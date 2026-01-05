import {
  FUNCTION_OPTIONS,
  HIGH_TRAFFIC_OPTIONS,
  BACKGROUND_OPTIONS,
  trackRequest,
  getColdStartMetrics,
  logInitComplete
} from "../cold-start-optimizer";

// Mock firebase-admin at module level
jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({})
      }))
    }))
  }))
}));

describe("Cold Start Optimizer", () => {
  describe("FUNCTION_OPTIONS", () => {
    it("should have correct minInstances", () => {
      expect(FUNCTION_OPTIONS.minInstances).toBe(1);
    });

    it("should have correct memory allocation", () => {
      expect(FUNCTION_OPTIONS.memory).toBe("512MB");
    });

    it("should have correct timeout", () => {
      expect(FUNCTION_OPTIONS.timeoutSeconds).toBe(60);
    });
  });

  describe("HIGH_TRAFFIC_OPTIONS", () => {
    it("should have higher minInstances", () => {
      expect(HIGH_TRAFFIC_OPTIONS.minInstances).toBe(2);
    });

    it("should have maxInstances for scaling", () => {
      expect(HIGH_TRAFFIC_OPTIONS.maxInstances).toBe(100);
    });

    it("should have more memory", () => {
      expect(HIGH_TRAFFIC_OPTIONS.memory).toBe("1GB");
    });
  });

  describe("BACKGROUND_OPTIONS", () => {
    it("should have zero minInstances", () => {
      expect(BACKGROUND_OPTIONS.minInstances).toBe(0);
    });

    it("should have lower memory", () => {
      expect(BACKGROUND_OPTIONS.memory).toBe("256MB");
    });

    it("should have longer timeout for background tasks", () => {
      expect(BACKGROUND_OPTIONS.timeoutSeconds).toBe(540);
    });
  });

  describe("trackRequest", () => {
    it("should track first request time", () => {
      const metrics = trackRequest();
      
      expect(metrics.firstRequestTime).not.toBeNull();
      expect(metrics.totalRequests).toBeGreaterThan(0);
    });

    it("should increment request count", () => {
      const initialMetrics = trackRequest();
      const subsequentMetrics = trackRequest();
      
      expect(subsequentMetrics.totalRequests).toBeGreaterThan(initialMetrics.totalRequests);
    });

    it("should update lastRequestTime", () => {
      const before = Date.now();
      const metrics = trackRequest();
      const after = Date.now();
      
      expect(metrics.lastRequestTime).toBeGreaterThanOrEqual(before);
      expect(metrics.lastRequestTime).toBeLessThanOrEqual(after);
    });

    it("should have unique instanceId", () => {
      const metrics = trackRequest();
      
      expect(metrics.instanceId).toMatch(/^inst-\d+-[a-z0-9]+$/);
    });
  });

  describe("getColdStartMetrics", () => {
    it("should return metrics with uptime", () => {
      const metrics = getColdStartMetrics();
      
      expect(metrics.uptime).toBeGreaterThan(0);
    });

    it("should calculate timeSinceFirstRequest", () => {
      trackRequest(); // Ensure first request is tracked
      const metrics = getColdStartMetrics();
      
      expect(metrics.timeSinceFirstRequest).toBeGreaterThanOrEqual(0);
    });

    it("should have coldStartTime", () => {
      const metrics = getColdStartMetrics();
      
      expect(metrics.coldStartTime).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("logInitComplete", () => {
    it("should log initialization time", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      const startTime = Date.now() - 100;
      
      logInitComplete("TestModule", startTime);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/✅ TestModule initialized in \d+ms/)
      );
      
      consoleSpy.mockRestore();
    });
  });
});
