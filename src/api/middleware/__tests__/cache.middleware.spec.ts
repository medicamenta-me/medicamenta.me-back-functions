import { Request, Response, NextFunction } from "express";
import { responseCache, cacheMiddleware, invalidateCachePattern, getCacheStats, CACHE_TTL } from "../cache.middleware";

describe("Cache Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: jest.Mock;

  beforeEach(() => {
    // Clear cache before each test
    responseCache.clear();

    mockReq = {
      method: "GET",
      originalUrl: "/api/v2/products",
      user: { uid: "test-user-123" }
    };

    jsonSpy = jest.fn().mockImplementation(function(this: Response, data: any) {
      return this;
    });

    mockRes = {
      json: jsonSpy,
      setHeader: jest.fn(),
      statusCode: 200
    };

    mockNext = jest.fn();
  });

  afterAll(() => {
    // Stop the cleanup timer to allow Jest to exit
    responseCache.stop();
  });

  describe("cacheMiddleware", () => {
    it("should call next for cacheable requests", () => {
      const middleware = cacheMiddleware();
      
      middleware(mockReq as Request, mockRes as Response, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });

    it("should return cached response on cache hit", () => {
      const middleware = cacheMiddleware();
      const testData = { products: [{ id: 1 }] };

      // First request - cache miss
      middleware(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.json as Function)(testData);

      // Reset mocks
      jsonSpy.mockClear();
      (mockNext as jest.Mock).mockClear();

      // Second request - cache hit
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-Cache", "HIT");
      expect(jsonSpy).toHaveBeenCalledWith(testData);
    });

    it("should NOT cache non-GET requests", () => {
      const middleware = cacheMiddleware();
      mockReq.method = "POST";

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should NOT cache admin routes", () => {
      const middleware = cacheMiddleware();
      mockReq.originalUrl = "/api/v2/admin/users";

      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Should call next but not set cache headers
      expect(mockNext).toHaveBeenCalled();
    });

    it("should NOT cache auth routes", () => {
      const middleware = cacheMiddleware();
      mockReq.originalUrl = "/api/auth/login";

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should NOT cache checkout routes", () => {
      const middleware = cacheMiddleware();
      mockReq.originalUrl = "/api/v2/checkout";

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should use custom TTL when provided", () => {
      const customTtl = 1000; // 1 second
      const middleware = cacheMiddleware(customTtl);
      const testData = { test: true };

      // First request
      middleware(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.json as Function)(testData);

      // Should be cached
      jsonSpy.mockClear();
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-Cache", "HIT");
    });

    it("should separate cache by user", () => {
      const middleware = cacheMiddleware();
      const testData1 = { user: "user1" };

      // User 1 request
      mockReq.user = { uid: "user-1" };
      middleware(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.json as Function)(testData1);

      // User 2 request (different cache key)
      mockReq.user = { uid: "user-2" };
      jsonSpy.mockClear();
      (mockNext as jest.Mock).mockClear();
      
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Should be cache miss for user 2
      expect(mockNext).toHaveBeenCalled();
    });

    it("should only cache successful responses (2xx)", () => {
      const middleware = cacheMiddleware();

      // Error response
      mockRes.statusCode = 500;
      middleware(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.json as Function)({ error: "Server error" });

      // Next request should not be cached
      jsonSpy.mockClear();
      (mockNext as jest.Mock).mockClear();
      mockRes.statusCode = 200;

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("invalidateCachePattern", () => {
    it("should invalidate entries matching pattern", () => {
      const middleware = cacheMiddleware();

      // Cache multiple entries
      mockReq.originalUrl = "/api/v2/products";
      middleware(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.json as Function)({ products: [] });

      mockReq.originalUrl = "/api/v2/products/123";
      (mockNext as jest.Mock).mockClear();
      middleware(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.json as Function)({ product: {} });

      mockReq.originalUrl = "/api/v2/pharmacies";
      (mockNext as jest.Mock).mockClear();
      middleware(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.json as Function)({ pharmacies: [] });

      // Invalidate products cache
      const count = invalidateCachePattern(/products/);

      expect(count).toBe(2);

      // Pharmacies should still be cached
      mockReq.originalUrl = "/api/v2/pharmacies";
      jsonSpy.mockClear();
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-Cache", "HIT");
    });

    it("should return 0 when no matches found", () => {
      const count = invalidateCachePattern(/nonexistent/);
      expect(count).toBe(0);
    });
  });

  describe("getCacheStats", () => {
    it("should return cache statistics", () => {
      const statsReq = {} as Request;
      const statsRes = {
        json: jest.fn()
      } as unknown as Response;

      getCacheStats(statsReq, statsRes);

      expect(statsRes.json).toHaveBeenCalled();
      const response = (statsRes.json as jest.Mock).mock.calls[0][0];
      
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.totalHits).toBeDefined();
      expect(response.data.totalMisses).toBeDefined();
      expect(response.data.totalEntries).toBeDefined();
      expect(response.data.hitRate).toBeDefined();
    });

    it("should track hits and misses correctly", () => {
      const middleware = cacheMiddleware();
      const testData = { test: true };

      // First request - miss
      middleware(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.json as Function)(testData);

      // Second request - hit
      jsonSpy.mockClear();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Third request - hit
      jsonSpy.mockClear();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      const stats = responseCache.getStats();

      expect(stats.totalMisses).toBe(1);
      expect(stats.totalHits).toBe(2);
      expect(stats.hitRate).toBeCloseTo(2/3, 2);
    });
  });

  describe("CACHE_TTL", () => {
    it("should have defined TTL values", () => {
      expect(CACHE_TTL.PRODUCTS_LIST).toBe(2 * 60 * 1000);
      expect(CACHE_TTL.PRODUCT_DETAIL).toBe(5 * 60 * 1000);
      expect(CACHE_TTL.PHARMACIES_LIST).toBe(5 * 60 * 1000);
      expect(CACHE_TTL.PHARMACY_DETAIL).toBe(10 * 60 * 1000);
      expect(CACHE_TTL.MEDICATIONS).toBe(30 * 60 * 1000);
      expect(CACHE_TTL.STATIC_DATA).toBe(60 * 60 * 1000);
      expect(CACHE_TTL.DEFAULT).toBe(5 * 60 * 1000);
    });
  });

  describe("Cache expiration", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should expire entries after TTL", () => {
      const shortTtl = 1000; // 1 second
      const middleware = cacheMiddleware(shortTtl);
      const testData = { cached: true };

      // Cache the response
      middleware(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.json as Function)(testData);

      // Should be cached
      jsonSpy.mockClear();
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-Cache", "HIT");

      // Advance time past TTL
      jest.advanceTimersByTime(2000);

      // Should be expired
      (mockNext as jest.Mock).mockClear();
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("Anonymous user caching", () => {
    it("should cache for anonymous users", () => {
      const middleware = cacheMiddleware();
      mockReq.user = undefined;

      middleware(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.json as Function)({ public: true });

      jsonSpy.mockClear();
      (mockNext as jest.Mock).mockClear();

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-Cache", "HIT");
    });
  });
});
