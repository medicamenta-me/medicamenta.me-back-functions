/**
 * 🔑 API Key Validator Middleware
 * 
 * Valida API Keys e adiciona informações do parceiro à request
 */

import { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { ApiError } from "../utils/api-error";

const db = admin.firestore();

interface ApiKey {
  id: string;
  partnerId: string;
  name: string;
  key: string;
  tier: "free" | "starter" | "professional" | "business" | "enterprise";
  permissions: string[];
  status: "active" | "suspended" | "revoked";
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  usage: {
    totalRequests: number;
    lastUsed?: Date;
  };
  createdAt: Date;
  expiresAt?: Date;
}

// Cache for API keys (TTL: 5 minutes)
const apiKeyCache = new Map<string, { key: ApiKey; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Validate API Key from X-API-Key header
 */
export async function validateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKeyHeader = req.headers["x-api-key"] as string;

    if (!apiKeyHeader) {
      throw new ApiError(
        401,
        "MISSING_API_KEY",
        "API key is required. Provide it in X-API-Key header"
      );
    }

    // Check cache first
    const cached = apiKeyCache.get(apiKeyHeader);
    if (cached && cached.expiresAt > Date.now()) {
      attachApiKeyInfo(req, cached.key);
      return next();
    }

    // Query Firestore
    const apiKeysRef = db.collection("api_keys");
    const snapshot = await apiKeysRef
      .where("key", "==", apiKeyHeader)
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new ApiError(401, "INVALID_API_KEY", "Invalid API key");
    }

    const apiKeyDoc = snapshot.docs[0];
    const apiKey = {
      id: apiKeyDoc.id,
      ...apiKeyDoc.data(),
    } as ApiKey;

    // Validate status
    if (apiKey.status !== "active") {
      throw new ApiError(
        403,
        "API_KEY_INACTIVE",
        `API key is ${apiKey.status}`
      );
    }

    // Validate expiration
    if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
      throw new ApiError(401, "API_KEY_EXPIRED", "API key has expired");
    }

    // Update usage stats (async, don't wait)
    updateApiKeyUsage(apiKeyDoc.id).catch(console.error);

    // Cache the key
    apiKeyCache.set(apiKeyHeader, {
      key: apiKey,
      expiresAt: Date.now() + CACHE_TTL,
    });

    // Attach info to request
    attachApiKeyInfo(req, apiKey);

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Attach API key info to request object
 */
function attachApiKeyInfo(req: Request, apiKey: ApiKey): void {
  (req as any).apiKey = apiKey;
  (req as any).partnerId = apiKey.partnerId;
  (req as any).tier = apiKey.tier;
  (req as any).permissions = apiKey.permissions;
}

/**
 * Update API key usage statistics
 */
async function updateApiKeyUsage(apiKeyId: string): Promise<void> {
  const apiKeyRef = db.collection("api_keys").doc(apiKeyId);
  
  await apiKeyRef.update({
    "usage.totalRequests": admin.firestore.FieldValue.increment(1),
    "usage.lastUsed": admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Generate new API key
 */
export async function generateApiKey(
  partnerId: string,
  name: string,
  tier: ApiKey["tier"],
  permissions: string[] = []
): Promise<string> {
  // Generate secure random key
  const key = `mk_${tier}_${generateRandomString(32)}`;

  const apiKey: Omit<ApiKey, "id"> = {
    partnerId,
    name,
    key,
    tier,
    permissions,
    status: "active",
    rateLimit: {
      requestsPerMinute: getRateLimitForTier(tier).requestsPerMinute,
      requestsPerDay: getRateLimitForTier(tier).requestsPerDay,
    },
    usage: {
      totalRequests: 0,
    },
    createdAt: new Date(),
  };

  const docRef = await db.collection("api_keys").add(apiKey);

  // Log creation
  await db.collection("audit_logs").add({
    action: "API_KEY_CREATED",
    partnerId,
    apiKeyId: docRef.id,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return key;
}

/**
 * Revoke API key
 */
export async function revokeApiKey(apiKeyId: string): Promise<void> {
  const apiKeyRef = db.collection("api_keys").doc(apiKeyId);
  
  await apiKeyRef.update({
    status: "revoked",
    revokedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Remove from cache
  const snapshot = await apiKeyRef.get();
  const apiKey = snapshot.data() as ApiKey;
  if (apiKey) {
    apiKeyCache.delete(apiKey.key);
  }
}

/**
 * Get rate limit configuration for tier
 */
function getRateLimitForTier(tier: ApiKey["tier"]): {
  requestsPerMinute: number;
  requestsPerDay: number;
} {
  const limits = {
    free: { requestsPerMinute: 100, requestsPerDay: 10000 },
    starter: { requestsPerMinute: 500, requestsPerDay: 50000 },
    professional: { requestsPerMinute: 2000, requestsPerDay: 200000 },
    business: { requestsPerMinute: 5000, requestsPerDay: 500000 },
    enterprise: { requestsPerMinute: 10000, requestsPerDay: -1 }, // Unlimited
  };

  return limits[tier] || limits.free;
}

/**
 * Generate random string
 */
function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
