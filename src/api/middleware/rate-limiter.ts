/**
 * ⏱️ Rate Limiter Middleware
 * 
 * Implementa rate limiting baseado em Redis para proteger a API
 * Diferentes limites para diferentes tiers de parceiros
 */

import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error";

// In-memory fallback (use Redis in production)
export const requestCounts = new Map<string, { count: number; resetTime: number }>();

interface RateLimitConfig {
  windowMs: number;     // Janela de tempo em ms
  maxRequests: number;  // Máximo de requests na janela
}

// Rate limits por tier
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  free: {
    windowMs: 60 * 1000,      // 1 minuto
    maxRequests: 100,          // 100 requests/min
  },
  starter: {
    windowMs: 60 * 1000,
    maxRequests: 500,          // 500 requests/min
  },
  professional: {
    windowMs: 60 * 1000,
    maxRequests: 2000,         // 2000 requests/min
  },
  business: {
    windowMs: 60 * 1000,
    maxRequests: 5000,         // 5000 requests/min
  },
  enterprise: {
    windowMs: 60 * 1000,
    maxRequests: 10000,        // 10000 requests/min
  },
};

/**
 * Get rate limit config for user's tier
 */
function getRateLimitConfig(tier?: string): RateLimitConfig {
  return RATE_LIMITS[tier || "free"] || RATE_LIMITS.free;
}

/**
 * Get client identifier (API key or user ID)
 */
function getClientId(req: Request): string {
  // Use API key if present
  const apiKey = req.headers["x-api-key"] as string;
  if (apiKey) {
    return `api-key:${apiKey}`;
  }

  // Use user ID if authenticated
  if (req.user?.uid) {
    return `user:${req.user.uid}`;
  }

  // Fallback to IP address
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  return `ip:${ip}`;
}

/**
 * Rate limiter middleware
 */
export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const clientId = getClientId(req);
    
    // Get tier from request (set by API key validator)
    const tier = (req as any).tier;
    const config = getRateLimitConfig(tier);

    const now = Date.now();
    const key = `${clientId}:${Math.floor(now / config.windowMs)}`;

    // Get or create request count
    let record = requestCounts.get(key);
    
    if (!record || record.resetTime < now) {
      record = {
        count: 0,
        resetTime: now + config.windowMs,
      };
      requestCounts.set(key, record);
    }

    // Increment count
    record.count++;

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", config.maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", Math.max(0, config.maxRequests - record.count).toString());
    res.setHeader("X-RateLimit-Reset", new Date(record.resetTime).toISOString());

    // Check if limit exceeded
    if (record.count > config.maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader("Retry-After", retryAfter.toString());
      
      throw new ApiError(
        429,
        "RATE_LIMIT_EXCEEDED",
        `Rate limit exceeded. Try again in ${retryAfter} seconds`,
        {
          limit: config.maxRequests,
          windowMs: config.windowMs,
          retryAfter,
        }
      );
    }

    // Clean up old records periodically
    if (Math.random() < 0.01) { // 1% chance
      cleanupOldRecords();
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Clean up expired rate limit records
 */
function cleanupOldRecords(): void {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (record.resetTime < now) {
      requestCounts.delete(key);
    }
  }
}

/**
 * Redis-based rate limiter (for production)
 * Requires Redis instance
 */
export async function redisRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // TODO: Implement with Redis client
  // import { createClient } from 'redis';
  // const redis = createClient({ url: process.env.REDIS_URL });
  
  // Use in-memory fallback for now
  return rateLimiter(req, res, next);
}
