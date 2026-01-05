/**
 * 🔐 Authentication Middleware
 * 
 * Suporta múltiplos métodos de autenticação:
 * - JWT Bearer Token (OAuth 2.0)
 * - Firebase ID Token
 * - API Key (X-API-Key header)
 */

import { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/api-error";

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        partnerId?: string;
        permissions?: string[];
        apiKeyId?: string;
      };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

/**
 * Authenticate request using Bearer token
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new ApiError(401, "UNAUTHORIZED", "Missing authorization header");
    }

    // Extract token from "Bearer <token>"
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer") {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid authorization scheme. Use Bearer token");
    }

    if (!token) {
      throw new ApiError(401, "UNAUTHORIZED", "Missing token");
    }

    // Try Firebase ID token first
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        partnerId: decodedToken.partnerId,
        permissions: decodedToken.permissions || [],
      };

      return next();
    } catch (_firebaseError) {
      // Not a Firebase token, try JWT
    }

    // Try JWT token
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      
      req.user = {
        uid: decoded.sub,
        email: decoded.email,
        partnerId: decoded.partnerId,
        permissions: decoded.permissions || [],
        apiKeyId: decoded.apiKeyId,
      };

      return next();
    } catch (_jwtError) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired token");
    }

  } catch (error) {
    next(error);
  }
}

/**
 * Generate JWT access token
 */
export function generateAccessToken(payload: {
  sub: string;
  email?: string;
  partnerId?: string;
  permissions?: string[];
  apiKeyId?: string;
}): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "24h",
    issuer: "medicamenta.me",
    audience: "medicamenta-api",
  });
}

/**
 * Generate JWT refresh token
 */
export function generateRefreshToken(payload: { sub: string }): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "30d",
    issuer: "medicamenta.me",
    audience: "medicamenta-api",
  });
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): any {
  return jwt.verify(token, JWT_SECRET, {
    issuer: "medicamenta.me",
    audience: "medicamenta-api",
  });
}

/**
 * Middleware to check specific permissions
 */
export function requirePermissions(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new ApiError(401, "UNAUTHORIZED", "Authentication required"));
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = requiredPermissions.every(
      perm => userPermissions.includes(perm) || userPermissions.includes("admin")
    );

    if (!hasPermission) {
      return next(new ApiError(
        403,
        "FORBIDDEN",
        `Missing required permissions: ${requiredPermissions.join(", ")}`
      ));
    }

    next();
  };
}
