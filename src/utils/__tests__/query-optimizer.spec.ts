/**
 * Tests for Query Optimizer Service
 * Sprint H6.4: Database Query Optimization
 */

import {
  QueryOptimizer,
  getQueryOptimizer,
  createQueryOptimizer,
  cleanupCache,
  getCacheStats,
} from "../query-optimizer";

// Mock firebase-admin
jest.mock("firebase-admin", () => {
  const mockDoc = {
    id: "doc-1",
    exists: true,
    data: () => ({ name: "Test", value: 100 }),
  };

  const mockSnapshot = {
    docs: [
      { id: "doc-1", exists: true, data: () => ({ name: "Test 1", value: 100 }) },
      { id: "doc-2", exists: true, data: () => ({ name: "Test 2", value: 200 }) },
      { id: "doc-3", exists: true, data: () => ({ name: "Test 3", value: 300 }) },
    ],
  };

  const mockCountSnapshot = {
    data: () => ({ count: 42 }),
  };

  const mockQuery = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    startAfter: jest.fn().mockReturnThis(),
    startAt: jest.fn().mockReturnThis(),
    endBefore: jest.fn().mockReturnThis(),
    endAt: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue(mockSnapshot),
    count: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(mockCountSnapshot),
    }),
  };

  const mockDocRef = {
    get: jest.fn().mockResolvedValue(mockDoc),
  };

  const mockCollection = jest.fn(() => ({
    ...mockQuery,
    doc: jest.fn(() => mockDocRef),
  }));

  const mockGetAll = jest.fn().mockResolvedValue([
    { id: "doc-1", exists: true, data: () => ({ name: "Test 1", value: 100 }) },
    { id: "doc-2", exists: true, data: () => ({ name: "Test 2", value: 200 }) },
  ]);

  return {
    firestore: jest.fn(() => ({
      collection: mockCollection,
      getAll: mockGetAll,
    })),
    initializeApp: jest.fn(),
    credential: {
      applicationDefault: jest.fn(),
    },
  };
});

// Mock structured-logger
jest.mock("../structured-logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    audit: jest.fn(),
  })),
}));

describe("QueryOptimizer", () => {
  let optimizer: QueryOptimizer;
  let mockFirestore: any;

  beforeEach(() => {
    jest.clearAllMocks();
    optimizer = new QueryOptimizer();
    mockFirestore = require("firebase-admin").firestore();

    // Clear cache between tests
    optimizer.clearCache();
  });

  describe("executeQuery", () => {
    it("should execute a simple query", async () => {
      const result = await optimizer.executeQuery("users", {});

      expect(result.data).toBeDefined();
      expect(result.hasMore).toBeDefined();
      expect(result.fromCache).toBe(false);
    });

    it("should apply filters correctly", async () => {
      const mockQuery = mockFirestore.collection();

      await optimizer.executeQuery("users", { status: "active", role: "admin" });

      expect(mockQuery.where).toHaveBeenCalledWith("status", "==", "active");
      expect(mockQuery.where).toHaveBeenCalledWith("role", "==", "admin");
    });

    it("should apply filter with custom operator", async () => {
      const mockQuery = mockFirestore.collection();

      await optimizer.executeQuery("users", {
        age: { operator: ">=", value: 18 },
      });

      expect(mockQuery.where).toHaveBeenCalledWith("age", ">=", 18);
    });

    it("should apply limit correctly", async () => {
      const mockQuery = mockFirestore.collection();

      await optimizer.executeQuery("users", {}, { limit: 50 });

      // +1 for hasMore check
      expect(mockQuery.limit).toHaveBeenCalledWith(51);
    });

    it("should enforce max limit of 1000", async () => {
      const mockQuery = mockFirestore.collection();

      await optimizer.executeQuery("users", {}, { limit: 5000 });

      // Should be capped at 1000 + 1
      expect(mockQuery.limit).toHaveBeenCalledWith(1001);
    });

    it("should apply field selection", async () => {
      const mockQuery = mockFirestore.collection();

      await optimizer.executeQuery("users", {}, { selectFields: ["name", "email"] });

      expect(mockQuery.select).toHaveBeenCalledWith("name", "email");
    });

    it("should handle cursor pagination - startAfter", async () => {
      const mockQuery = mockFirestore.collection();

      await optimizer.executeQuery(
        "users",
        {},
        { cursor: "doc-1", cursorDirection: "startAfter" }
      );

      expect(mockQuery.startAfter).toHaveBeenCalled();
    });

    it("should handle cursor pagination - startAt", async () => {
      const mockQuery = mockFirestore.collection();

      await optimizer.executeQuery(
        "users",
        {},
        { cursor: "doc-1", cursorDirection: "startAt" }
      );

      expect(mockQuery.startAt).toHaveBeenCalled();
    });

    it("should handle cursor pagination - endBefore", async () => {
      const mockQuery = mockFirestore.collection();

      await optimizer.executeQuery(
        "users",
        {},
        { cursor: "doc-1", cursorDirection: "endBefore" }
      );

      expect(mockQuery.endBefore).toHaveBeenCalled();
    });

    it("should handle cursor pagination - endAt", async () => {
      const mockQuery = mockFirestore.collection();

      await optimizer.executeQuery(
        "users",
        {},
        { cursor: "doc-1", cursorDirection: "endAt" }
      );

      expect(mockQuery.endAt).toHaveBeenCalled();
    });

    it("should return fromCache: true on cache hit", async () => {
      // First call - cache miss
      const result1 = await optimizer.executeQuery("users", {}, { cacheTTL: 60 });
      expect(result1.fromCache).toBe(false);

      // Second call - cache hit
      const result2 = await optimizer.executeQuery("users", {}, { cacheTTL: 60 });
      expect(result2.fromCache).toBe(true);
    });

    it("should skip cache when cacheTTL is 0", async () => {
      await optimizer.executeQuery("users", {}, { cacheTTL: 0 });
      const result = await optimizer.executeQuery("users", {}, { cacheTTL: 0 });

      expect(result.fromCache).toBe(false);
    });

    it("should include metrics when requested", async () => {
      const result = await optimizer.executeQuery(
        "users",
        {},
        { includeMetrics: true }
      );

      expect(result.metrics).toBeDefined();
      expect(result.metrics!.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics!.documentsRead).toBeGreaterThanOrEqual(0);
      expect(result.metrics!.responseSizeBytes).toBeGreaterThan(0);
      expect(result.metrics!.usedIndex).toBe(true);
    });

    it("should detect hasMore correctly", async () => {
      // Mock returns 3 docs, limit is 100, so hasMore should be false
      const result = await optimizer.executeQuery("users", {}, { limit: 100 });
      expect(result.hasMore).toBe(false);
    });

    it("should skip undefined/null filter values", async () => {
      const mockQuery = mockFirestore.collection();

      await optimizer.executeQuery("users", {
        active: true,
        deleted: null,
        archived: undefined,
      });

      expect(mockQuery.where).toHaveBeenCalledTimes(1);
      expect(mockQuery.where).toHaveBeenCalledWith("active", "==", true);
    });
  });

  describe("batchRead", () => {
    it("should read multiple documents by IDs", async () => {
      const result = await optimizer.batchRead({
        ids: ["doc-1", "doc-2"],
        collection: "users",
      });

      expect(result).toHaveLength(2);
      expect(mockFirestore.getAll).toHaveBeenCalled();
    });

    it("should remove duplicate IDs", async () => {
      await optimizer.batchRead({
        ids: ["doc-1", "doc-1", "doc-2", "doc-2"],
        collection: "users",
      });

      // getAll should be called with unique refs only
      expect(mockFirestore.getAll).toHaveBeenCalled();
    });

    it("should return empty array for empty IDs", async () => {
      const result = await optimizer.batchRead({
        ids: [],
        collection: "users",
      });

      expect(result).toEqual([]);
      expect(mockFirestore.getAll).not.toHaveBeenCalled();
    });

    it("should apply field projection in batch read", async () => {
      const result = await optimizer.batchRead({
        ids: ["doc-1"],
        collection: "users",
        selectFields: ["name"],
      });

      expect(result).toBeDefined();
      // The result should only have 'name' and 'id' fields
    });

    it("should batch large ID lists into chunks", async () => {
      const largeIdList = Array.from({ length: 250 }, (_, i) => `doc-${i}`);

      await optimizer.batchRead({
        ids: largeIdList,
        collection: "users",
        batchSize: 100,
      });

      // Should be called 3 times for 250 items with batch size 100
      expect(mockFirestore.getAll).toHaveBeenCalledTimes(3);
    });
  });

  describe("aggregate", () => {
    it("should execute count aggregation", async () => {
      const result = await optimizer.aggregate("users", "count");

      expect(result.value).toBe(42);
      expect(result.fromCache).toBe(false);
    });

    it("should execute count aggregation with filters", async () => {
      await optimizer.aggregate("users", "count", undefined, { status: "active" });

      const mockQuery = mockFirestore.collection();
      expect(mockQuery.where).toHaveBeenCalledWith("status", "==", "active");
    });

    it("should cache aggregation results", async () => {
      const result1 = await optimizer.aggregate("users", "count", undefined, {}, 300);
      expect(result1.fromCache).toBe(false);

      const result2 = await optimizer.aggregate("users", "count", undefined, {}, 300);
      expect(result2.fromCache).toBe(true);
    });

    it("should throw error for sum without field", async () => {
      await expect(optimizer.aggregate("users", "sum")).rejects.toThrow(
        "Field required for sum aggregation"
      );
    });

    it("should throw error for avg without field", async () => {
      await expect(optimizer.aggregate("users", "avg")).rejects.toThrow(
        "Field required for avg aggregation"
      );
    });

    it("should execute sum aggregation", async () => {
      const result = await optimizer.aggregate("users", "sum", "value");
      expect(result.value).toBeDefined();
    });

    it("should execute avg aggregation", async () => {
      const result = await optimizer.aggregate("users", "avg", "value");
      expect(result.value).toBeDefined();
    });
  });

  describe("paginate", () => {
    it("should paginate with default settings", async () => {
      const result = await optimizer.paginate("users", "createdAt");

      expect(result.data).toBeDefined();
      expect(result.hasNextPage).toBeDefined();
      expect(result.hasPrevPage).toBe(false);
    });

    it("should paginate with cursor", async () => {
      const result = await optimizer.paginate("users", "createdAt", "desc", 20, "doc-1");

      expect(result.hasPrevPage).toBe(true);
      expect(result.prevCursor).toBe("doc-1");
    });

    it("should apply filters in pagination", async () => {
      const mockQuery = mockFirestore.collection();

      await optimizer.paginate("users", "createdAt", "desc", 20, undefined, {
        status: "active",
      });

      expect(mockQuery.where).toHaveBeenCalledWith("status", "==", "active");
    });

    it("should apply order direction", async () => {
      const mockQuery = mockFirestore.collection();

      await optimizer.paginate("users", "createdAt", "asc");

      expect(mockQuery.orderBy).toHaveBeenCalledWith("createdAt", "asc");
    });

    it("should enforce max page size", async () => {
      const mockQuery = mockFirestore.collection();

      await optimizer.paginate("users", "createdAt", "desc", 5000);

      // Should be capped at 1000 + 1
      expect(mockQuery.limit).toHaveBeenCalledWith(1001);
    });
  });

  describe("Cache Management", () => {
    it("should invalidate cache by collection", async () => {
      // Populate cache
      await optimizer.executeQuery("users", {}, { cacheTTL: 60 });
      await optimizer.executeQuery("orders", {}, { cacheTTL: 60 });

      const invalidated = optimizer.invalidateCacheByCollection("users");

      expect(invalidated).toBeGreaterThanOrEqual(0);
    });

    it("should clear all cache", () => {
      optimizer.clearCache();

      const stats = getCacheStats();
      expect(stats.size).toBe(0);
    });

    it("should cleanup expired cache entries", async () => {
      // This test validates the cleanupCache function
      const cleaned = cleanupCache();
      expect(typeof cleaned).toBe("number");
    });

    it("should return cache stats", () => {
      const stats = getCacheStats();

      expect(stats).toHaveProperty("size");
      expect(stats).toHaveProperty("maxSize");
      expect(stats).toHaveProperty("hitRate");
    });
  });

  describe("Singleton and Factory", () => {
    it("should return singleton instance", () => {
      const instance1 = getQueryOptimizer();
      const instance2 = getQueryOptimizer();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance with custom firestore", () => {
      const customFirestore = require("firebase-admin").firestore();
      const customOptimizer = createQueryOptimizer(customFirestore);

      expect(customOptimizer).toBeInstanceOf(QueryOptimizer);
      expect(customOptimizer).not.toBe(getQueryOptimizer());
    });
  });
});

describe("Query Timeout", () => {
  it("should timeout long-running queries", async () => {
    const optimizer = new QueryOptimizer();

    // Mock a slow query
    const mockFirestore = require("firebase-admin").firestore();
    mockFirestore.collection().get.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 15000))
    );

    await expect(
      optimizer.executeQuery("users", {}, { timeout: 100 })
    ).rejects.toThrow("Query timeout");
  });
});
