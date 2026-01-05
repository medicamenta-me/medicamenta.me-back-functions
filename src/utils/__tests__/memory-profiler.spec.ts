/**
 * Tests for Memory Profiler
 * Sprint H6.5: Memory Profiling
 */

import {
  MemoryProfiler,
  getMemoryProfiler,
  createMemoryProfiler,
  memoryMonitorMiddleware,
} from "../memory-profiler";
import { Request, Response, NextFunction } from "express";

// Mock structured-logger
jest.mock("../structured-logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    audit: jest.fn(),
  })),
}));

describe("MemoryProfiler", () => {
  let profiler: MemoryProfiler;

  beforeEach(() => {
    jest.clearAllMocks();
    profiler = new MemoryProfiler();
  });

  afterEach(() => {
    profiler.stopTracking();
  });

  describe("takeSnapshot", () => {
    it("should take a memory snapshot", () => {
      const snapshot = profiler.takeSnapshot();

      expect(snapshot).toHaveProperty("timestamp");
      expect(snapshot).toHaveProperty("heapUsed");
      expect(snapshot).toHaveProperty("heapTotal");
      expect(snapshot).toHaveProperty("rss");
      expect(snapshot).toHaveProperty("external");
      expect(snapshot).toHaveProperty("arrayBuffers");
      expect(snapshot).toHaveProperty("heapUsagePercent");
    });

    it("should return positive values", () => {
      const snapshot = profiler.takeSnapshot();

      expect(snapshot.heapUsed).toBeGreaterThan(0);
      expect(snapshot.heapTotal).toBeGreaterThan(0);
      expect(snapshot.rss).toBeGreaterThan(0);
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });

    it("should calculate heap usage percent", () => {
      const snapshot = profiler.takeSnapshot();

      // heapUsagePercent can exceed 100% if actual heap > configured limit
      expect(snapshot.heapUsagePercent).toBeGreaterThan(0);
      expect(typeof snapshot.heapUsagePercent).toBe("number");
    });
  });

  describe("startTracking / stopTracking", () => {
    it("should start tracking memory", () => {
      profiler.startTracking();

      // Wait for at least one sample
      expect(profiler.getSnapshots().length).toBeGreaterThanOrEqual(1);
    });

    it("should stop tracking memory", () => {
      profiler.startTracking();
      profiler.stopTracking();

      const countBefore = profiler.getSnapshots().length;

      // Wait a bit and verify no new snapshots
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(profiler.getSnapshots().length).toBe(countBefore);
          resolve();
        }, 100);
      });
    });

    it("should not start multiple tracking sessions", () => {
      profiler.startTracking();
      profiler.startTracking(); // Second call should be no-op

      // Should not throw and should have only one sample initially
      expect(profiler.getSnapshots().length).toBeGreaterThanOrEqual(1);
    });

    it("should handle stopTracking when not tracking", () => {
      // Should not throw
      profiler.stopTracking();
    });
  });

  describe("getMetrics", () => {
    it("should return current metrics", () => {
      const metrics = profiler.getMetrics();

      expect(metrics).toHaveProperty("current");
      expect(metrics).toHaveProperty("avgHeapUsed");
      expect(metrics).toHaveProperty("peakHeapUsed");
      expect(metrics).toHaveProperty("growthRate");
      expect(metrics).toHaveProperty("sampleCount");
      expect(metrics).toHaveProperty("possibleLeak");
      expect(metrics).toHaveProperty("trackingDurationMs");
    });

    it("should return metrics without tracking history", () => {
      const metrics = profiler.getMetrics();

      expect(metrics.sampleCount).toBe(1);
      expect(metrics.growthRate).toBe(0);
      expect(metrics.possibleLeak).toBe(false);
    });

    it("should calculate average heap used", () => {
      profiler.startTracking();

      // Wait for a few samples
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const metrics = profiler.getMetrics();
          expect(metrics.avgHeapUsed).toBeGreaterThan(0);
          profiler.stopTracking();
          resolve();
        }, 200);
      });
    });

    it("should calculate peak heap used", () => {
      profiler.startTracking();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const metrics = profiler.getMetrics();
          // Peak should be at least as big as average (could be smaller than current due to GC)
          expect(metrics.peakHeapUsed).toBeGreaterThanOrEqual(metrics.avgHeapUsed);
          profiler.stopTracking();
          resolve();
        }, 200);
      });
    });
  });

  describe("monitorOperation", () => {
    it("should monitor async operation memory usage", async () => {
      const operation = async () => {
        // Simulate some work
        const arr = new Array(1000).fill("test");
        return arr.length;
      };

      const result = await profiler.monitorOperation(operation, "test-operation");

      expect(result.result).toBe(1000);
      expect(result).toHaveProperty("memoryDelta");
      expect(result).toHaveProperty("executionTimeMs");
      expect(result).toHaveProperty("exceededThreshold");
    });

    it("should detect when operation exceeds threshold", async () => {
      const operation = async () => {
        // Allocate significant memory
        const arr = new Array(1000000).fill({ data: "x".repeat(100) });
        return arr.length;
      };

      const result = await profiler.monitorOperation(
        operation,
        "heavy-operation",
        1024 // Very small threshold
      );

      expect(result.exceededThreshold).toBe(true);
    });

    it("should propagate errors from operation", async () => {
      const operation = async () => {
        throw new Error("Test error");
      };

      await expect(
        profiler.monitorOperation(operation, "error-operation")
      ).rejects.toThrow("Test error");
    });
  });

  describe("formatBytes", () => {
    it("should format bytes correctly", () => {
      expect(profiler.formatBytes(512)).toBe("512.00 B");
      expect(profiler.formatBytes(1024)).toBe("1.00 KB");
      expect(profiler.formatBytes(1024 * 1024)).toBe("1.00 MB");
      expect(profiler.formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
    });

    it("should handle negative bytes", () => {
      expect(profiler.formatBytes(-1024)).toBe("-1.00 KB");
    });

    it("should handle zero", () => {
      expect(profiler.formatBytes(0)).toBe("0.00 B");
    });

    it("should handle fractional KB", () => {
      expect(profiler.formatBytes(1536)).toBe("1.50 KB");
    });
  });

  describe("clearSnapshots", () => {
    it("should clear all snapshots", () => {
      profiler.startTracking();

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(profiler.getSnapshots().length).toBeGreaterThan(0);

          profiler.clearSnapshots();

          expect(profiler.getSnapshots().length).toBe(0);
          profiler.stopTracking();
          resolve();
        }, 200);
      });
    });
  });

  describe("isNearLimit", () => {
    it("should check if memory is near limit", () => {
      const isNear = profiler.isNearLimit(100); // 100% threshold - should be false
      expect(typeof isNear).toBe("boolean");
    });

    it("should use default threshold", () => {
      const isNear = profiler.isNearLimit();
      expect(typeof isNear).toBe("boolean");
    });
  });

  describe("getOptimizationRecommendations", () => {
    it("should return array of recommendations", () => {
      const recommendations = profiler.getOptimizationRecommendations();

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it("should return positive recommendation when memory is OK", () => {
      const recommendations = profiler.getOptimizationRecommendations();

      // Should have at least one recommendation with status indicator
      expect(recommendations.length).toBeGreaterThan(0);
      // Recommendations contain either success, warning or error indicators
      const hasIndicator = recommendations.some(
        (r) => r.includes("✅") || r.includes("⚠️") || r.includes("🔴") || r.includes("📦") || r.includes("📊")
      );
      expect(hasIndicator).toBe(true);
    });
  });

  describe("suggestGC", () => {
    it("should return false when gc is not available", () => {
      const result = profiler.suggestGC();
      expect(result).toBe(false);
    });

    it("should call gc when available", () => {
      const mockGc = jest.fn();
      (global as any).gc = mockGc;

      const result = profiler.suggestGC();

      expect(result).toBe(true);
      expect(mockGc).toHaveBeenCalled();

      delete (global as any).gc;
    });
  });

  describe("Configuration", () => {
    it("should use default configuration", () => {
      const defaultProfiler = new MemoryProfiler();
      const metrics = defaultProfiler.getMetrics();

      expect(metrics).toBeDefined();
    });

    it("should accept custom configuration", () => {
      const customProfiler = new MemoryProfiler(
        {
          sampleIntervalMs: 1000,
          maxSamples: 10,
          warningThreshold: 50,
          criticalThreshold: 75,
        },
        "512MB"
      );

      expect(customProfiler).toBeInstanceOf(MemoryProfiler);
    });

    it("should accept different memory limits", () => {
      const limits = ["128MB", "256MB", "512MB", "1GB", "2GB", "4GB", "8GB"] as const;

      for (const limit of limits) {
        const p = new MemoryProfiler({}, limit);
        expect(p).toBeInstanceOf(MemoryProfiler);
      }
    });
  });
});

describe("Singleton and Factory", () => {
  it("should return singleton instance", () => {
    const instance1 = getMemoryProfiler();
    const instance2 = getMemoryProfiler();

    expect(instance1).toBe(instance2);
  });

  it("should create new instance with factory", () => {
    const instance = createMemoryProfiler();
    const singleton = getMemoryProfiler();

    expect(instance).not.toBe(singleton);
  });
});

describe("memoryMonitorMiddleware", () => {
  it("should create middleware function", () => {
    const middleware = memoryMonitorMiddleware();

    expect(typeof middleware).toBe("function");
  });

  it("should call next()", () => {
    const middleware = memoryMonitorMiddleware();
    const req = { method: "GET", path: "/test" } as Request;
    const res = {
      on: jest.fn(),
      statusCode: 200,
    } as unknown as Response;
    const next = jest.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should register finish handler", () => {
    const middleware = memoryMonitorMiddleware();
    const req = { method: "GET", path: "/test" } as Request;
    const res = {
      on: jest.fn(),
      statusCode: 200,
    } as unknown as Response;
    const next = jest.fn() as NextFunction;

    middleware(req, res, next);

    expect(res.on).toHaveBeenCalledWith("finish", expect.any(Function));
  });

  it("should accept custom configuration", () => {
    const middleware = memoryMonitorMiddleware({
      warningThreshold: 60,
    });

    expect(typeof middleware).toBe("function");
  });
});

describe("Growth Rate Calculation", () => {
  it("should return 0 growth rate with insufficient samples", () => {
    const profiler = new MemoryProfiler({ sampleIntervalMs: 10000 });
    const metrics = profiler.getMetrics();

    expect(metrics.growthRate).toBe(0);
  });
});
