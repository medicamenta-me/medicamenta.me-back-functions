/**
 * 🔐 Authentication Routes
 * 
 * OAuth 2.0 endpoints para geração de tokens
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../middleware/auth';
import { generateApiKey } from '../middleware/api-key-validator';
import { ApiError } from '../utils/api-error';

const router = Router();
const db = admin.firestore();

/**
 * POST /v1/auth/token
 * OAuth 2.0 Token Endpoint
 * 
 * Grant types supported:
 * - client_credentials (for server-to-server)
 * - refresh_token (to refresh access token)
 */
router.post('/token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { grant_type, client_id, client_secret, refresh_token } = req.body;

    if (!grant_type) {
      throw new ApiError(400, 'INVALID_REQUEST', 'grant_type is required');
    }

    // Client Credentials Flow
    if (grant_type === 'client_credentials') {
      if (!client_id || !client_secret) {
        throw new ApiError(
          400,
          'INVALID_REQUEST',
          'client_id and client_secret are required'
        );
      }

      // Verify client credentials
      const partnerRef = db.collection('partners').doc(client_id);
      const partnerDoc = await partnerRef.get();

      if (!partnerDoc.exists) {
        throw new ApiError(401, 'INVALID_CLIENT', 'Invalid client credentials');
      }

      const partner = partnerDoc.data()!;

      if (partner.clientSecret !== client_secret) {
        throw new ApiError(401, 'INVALID_CLIENT', 'Invalid client credentials');
      }

      if (partner.status !== 'active') {
        throw new ApiError(403, 'CLIENT_SUSPENDED', 'Client account is suspended');
      }

      // Generate tokens
      const accessToken = generateAccessToken({
        sub: client_id,
        partnerId: client_id,
        permissions: partner.permissions || [],
      });

      const refreshToken = generateRefreshToken({ sub: client_id });

      // Store refresh token
      await db.collection('refresh_tokens').add({
        partnerId: client_id,
        token: refreshToken,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 86400, // 24 hours
        refresh_token: refreshToken,
      });
      return;
    }

    // Refresh Token Flow
    if (grant_type === 'refresh_token') {
      if (!refresh_token) {
        throw new ApiError(400, 'INVALID_REQUEST', 'refresh_token is required');
      }

      // Verify refresh token
      let decoded: any;
      try {
        decoded = verifyRefreshToken(refresh_token);
      } catch (error) {
        throw new ApiError(401, 'INVALID_GRANT', 'Invalid or expired refresh token');
      }

      // Check if token exists and is not revoked
      const tokensRef = db.collection('refresh_tokens');
      const tokenSnapshot = await tokensRef
        .where('token', '==', refresh_token)
        .where('revoked', '==', false)
        .limit(1)
        .get();

      if (tokenSnapshot.empty) {
        throw new ApiError(401, 'INVALID_GRANT', 'Refresh token has been revoked');
      }

      // Get partner data
      const partnerRef = db.collection('partners').doc(decoded.sub);
      const partnerDoc = await partnerRef.get();

      if (!partnerDoc.exists) {
        throw new ApiError(401, 'INVALID_GRANT', 'Partner not found');
      }

      const partner = partnerDoc.data()!;

      // Generate new access token
      const accessToken = generateAccessToken({
        sub: decoded.sub,
        partnerId: decoded.sub,
        permissions: partner.permissions || [],
      });

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 86400,
      });
      return;
    }

    throw new ApiError(400, 'UNSUPPORTED_GRANT_TYPE', `Grant type ${grant_type} is not supported`);

  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/auth/revoke
 * Revoke refresh token
 */
router.post('/revoke', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;

    if (!token) {
      throw new ApiError(400, 'INVALID_REQUEST', 'token is required');
    }

    // Find and revoke token
    const tokensRef = db.collection('refresh_tokens');
    const snapshot = await tokensRef
      .where('token', '==', token)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const tokenDoc = snapshot.docs[0];
      await tokenDoc.ref.update({
        revoked: true,
        revokedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/auth/api-key
 * Generate new API key (requires authentication)
 */
router.post('/api-key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, tier = 'free', permissions = [] } = req.body;

    // This would normally require authentication
    // For demo, we'll require client credentials
    const { client_id, client_secret } = req.body;

    if (!client_id || !client_secret) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Client credentials required');
    }

    // Verify credentials
    const partnerRef = db.collection('partners').doc(client_id);
    const partnerDoc = await partnerRef.get();

    if (!partnerDoc.exists || partnerDoc.data()!.clientSecret !== client_secret) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid credentials');
    }

    // Generate API key
    const apiKey = await generateApiKey(
      client_id,
      name || 'Default API Key',
      tier,
      permissions
    );

    res.status(201).json({
      api_key: apiKey,
      name,
      tier,
      permissions,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export const authRouter = router;
