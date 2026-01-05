import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * In-Memory Cache for API responses
 * 
 * Features:
 * - TTL-based expiration
 * - LRU eviction when max size reached
 * - Automatic cleanup of expired entries
 * - Cache statistics for monitoring
 * - Configurable per-route TTL
 * 
 * Designed for:
 * - Human interpretation: Clear logging and stats
 * - AI interpretation: Structured metrics for analysis
 */

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  hits: number;
  size: number;
}

interface CacheStats {
  totalHits: number;
  totalMisses: number;
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  avgResponseTime: number;
}

interface CacheConfig {
  /** Time-to-live in milliseconds (default: 5 minutes) */
  ttl?: number;
  /** Maximum cache entries (default: 1000) */
  maxEntries?: number;
  /** Maximum cache size in bytes (default: 50MB) */
  maxSize?: number;
  /** Cleanup interval in milliseconds (default: 1 minute) */
  cleanupInterval?: number;
  /** Routes to exclude from caching */
  excludeRoutes?: RegExp[];
  /** Only cache these HTTP methods */
  methods?: string[];
}

const DEFAULT_CONFIG: Required<CacheConfig> = {
  ttl: 5 * 60 * 1000, // 5 minutes
  maxEntries: 1000,
  maxSize: 50 * 1024 * 1024, // 50MB
  cleanupInterval: 60 * 1000, // 1 minute
  excludeRoutes: [
    /\/auth\//,
    /\/admin\//,
    /\/checkout/,
    /\/payment/,
    /\/orders\/[^/]+\/status/,
  ],
  methods: ["GET"]
};

class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private config: Required<CacheConfig>;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    responseTimes: [] as number[]
  };
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: CacheConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupTimer();
  }

  /**
   * Generate cache key from request
   */
  private getCacheKey(req: Request): string {
    const userId = (req as any).user?.uid || "anonymous";
    return `${req.method}:${req.originalUrl}:${userId}`;
  }

  /**
   * Check if route should be cached
   */
  private shouldCache(req: Request): boolean {
    // Only cache specified methods
    if (!this.config.methods.includes(req.method)) {
      return false;
    }

    // Check excluded routes
    for (const pattern of this.config.excludeRoutes) {
      if (pattern.test(req.originalUrl)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get entry from cache
   */
  get(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    entry.hits++;
    this.stats.hits++;
    return entry.data;
  }

  /**
   * Set entry in cache
   */
  set(key: string, data: any, ttl?: number): void {
    const size = this.estimateSize(data);
    const effectiveTtl = ttl ?? this.config.ttl;

    // Evict if necessary
    this.evictIfNeeded(size);

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: effectiveTtl,
      hits: 0,
      size
    });
  }

  /**
   * Estimate size of data in bytes
   */
  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // UTF-16 chars
    } catch {
      return 1024; // Default 1KB if can't estimate
    }
  }

  /**
   * Evict entries if cache is too large
   */
  private evictIfNeeded(newEntrySize: number): void {
    // Check entry count
    while (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    // Check total size
    let totalSize = this.getTotalSize();
    while (totalSize + newEntrySize > this.config.maxSize && this.cache.size > 0) {
      this.evictLRU();
      totalSize = this.getTotalSize();
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Get total cache size
   */
  private getTotalSize(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }

  /**
   * Start automatic cleanup of expired entries
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`🧹 Cache cleanup: removed ${removed} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      totalEntries: this.cache.size,
      totalSize: this.getTotalSize(),
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      avgResponseTime: this.stats.responseTimes.length > 0
        ? this.stats.responseTimes.reduce((a, b) => a + b, 0) / this.stats.responseTimes.length
        : 0
    };
  }

  /**
   * Record response time for metrics
   */
  recordResponseTime(ms: number): void {
    this.stats.responseTimes.push(ms);
    // Keep only last 1000 samples
    if (this.stats.responseTimes.length > 1000) {
      this.stats.responseTimes.shift();
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      responseTimes: []
    };
    console.log("🗑️ Cache cleared");
  }

  /**
   * Invalidate entries matching pattern
   */
  invalidate(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    if (count > 0) {
      console.log(`🔄 Invalidated ${count} cache entries matching ${pattern}`);
    }
    return count;
  }

  /**
   * Stop cleanup timer (for graceful shutdown)
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Create cache middleware
   */
  middleware(routeTtl?: number): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!this.shouldCache(req)) {
        next();
        return;
      }

      const key = this.getCacheKey(req);
      const cached = this.get(key);

      if (cached !== null) {
        res.setHeader("X-Cache", "HIT");
        res.setHeader("X-Cache-Key", key);
        res.json(cached);
        return;
      }

      // Override res.json to cache response
      const originalJson = res.json.bind(res);
      const startTime = Date.now();

      res.json = (data: any): Response => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          this.set(key, data, routeTtl);
          res.setHeader("X-Cache", "MISS");
        }
        
        // Record response time
        this.recordResponseTime(Date.now() - startTime);
        
        return originalJson(data);
      };

      next();
    };
  }
}

// Singleton instance
export const responseCache = new ResponseCache();

/**
 * Cache middleware factory
 * @param ttl Optional TTL in milliseconds for this specific route
 */
export function cacheMiddleware(ttl?: number): RequestHandler {
  return responseCache.middleware(ttl);
}

/**
 * Invalidate cache for specific patterns
 * Use after mutations (POST, PUT, DELETE)
 */
export function invalidateCachePattern(pattern: RegExp): number {
  return responseCache.invalidate(pattern);
}

/**
 * Get cache statistics endpoint handler
 */
export function getCacheStats(req: Request, res: Response): void {
  res.json({
    success: true,
    data: responseCache.getStats(),
    timestamp: new Date().toISOString()
  });
}

// Route-specific TTL configurations (in milliseconds)
export const CACHE_TTL = {
  PRODUCTS_LIST: 2 * 60 * 1000,      // 2 minutes - product lists
  PRODUCT_DETAIL: 5 * 60 * 1000,     // 5 minutes - product details
  PHARMACIES_LIST: 5 * 60 * 1000,    // 5 minutes - pharmacy lists
  PHARMACY_DETAIL: 10 * 60 * 1000,   // 10 minutes - pharmacy details
  MEDICATIONS: 30 * 60 * 1000,       // 30 minutes - user medications (rare changes)
  STATIC_DATA: 60 * 60 * 1000,       // 1 hour - categories, states, etc.
  DEFAULT: 5 * 60 * 1000             // 5 minutes
};
