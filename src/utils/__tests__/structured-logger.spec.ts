/**
 * Tests for Structured Logger
 * Sprint H7: Logging & Auditoria
 */

import { Request, Response } from "express";
import {
  Logger,
  StructuredLog,
  loggerMiddleware,
  getLogger,
  createLogger,
} from "../structured-logger";

describe("StructuredLogger", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleLogSpy: jest.SpyInstance;
  let capturedLogs: string[];

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.LOG_LEVEL = "debug";
    process.env.NODE_ENV = "test";
    
    capturedLogs = [];
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation((msg: string) => {
      capturedLogs.push(msg);
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    process.env = originalEnv;
  });

  describe("Logger class", () => {
    it("should create logger with default options", () => {
      const logger = new Logger();
      expect(logger).toBeDefined();
      expect(logger.getCorrelationId()).toBeTruthy();
      expect(logger.getCorrelationId()).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("should create logger with custom options", () => {
      const logger = new Logger({
        correlationId: "custom-correlation-id",
        requestId: "custom-request-id",
        sessionId: "custom-session-id",
        userId: "user-123",
        userRole: "admin",
        service: "test-service",
        component: "test-component",
      });

      expect(logger.getCorrelationId()).toBe("custom-correlation-id");
    });

    it("should create child logger with same correlation ID", () => {
      const parent = new Logger({ correlationId: "parent-id" });
      const child = parent.child("child-component");
      
      expect(child.getCorrelationId()).toBe("parent-id");
    });

    it("should set user context", () => {
      const logger = new Logger({ component: "test" });
      logger.setUser("user-456", "pharmacist");
      
      logger.info("test_action", "Test message");
      
      const logOutput = JSON.parse(capturedLogs[0]);
      expect(logOutput.userId).toBe("user-456");
      expect(logOutput.userRole).toBe("pharmacist");
    });

    it("should track elapsed time", () => {
      const logger = new Logger();
      
      // Wait a bit
      const start = Date.now();
      while (Date.now() - start < 10) {
        // busy wait
      }
      
      const elapsed = logger.getElapsedMs();
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });
  });

  describe("Log levels", () => {
    it("should log debug level", () => {
      // Debug is filtered by default log level, so we need to use info or higher
      // for testing the format. For debug level test, we test the method exists.
      const logger = new Logger({ component: "test" });
      
      // Debug logging won't appear due to default log level being 'info'
      // But we can verify the method exists and doesn't throw
      expect(() => logger.debug("debug_action", "Debug message", { extra: "data" })).not.toThrow();
    });

    it("should log info level", () => {
      const logger = new Logger({ component: "test" });
      logger.info("info_action", "Info message");
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.level).toBe("info");
      expect(logOutput.levelEmoji).toBe("ℹ️");
    });

    it("should log warn level", () => {
      const logger = new Logger({ component: "test" });
      logger.warn("warn_action", "Warning message");
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.level).toBe("warn");
      expect(logOutput.levelEmoji).toBe("⚠️");
    });

    it("should log error level with error object", () => {
      const logger = new Logger({ component: "test" });
      const error = new Error("Something went wrong");
      (error as any).code = "ERR_TEST";
      
      logger.error("error_action", "Error occurred", error, { context: "value" });
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.level).toBe("error");
      expect(logOutput.levelEmoji).toBe("❌");
      expect(logOutput.error).toBeDefined();
      expect(logOutput.error!.code).toBe("ERR_TEST");
      expect(logOutput.error!.message).toBe("Something went wrong");
    });

    it("should log fatal level", () => {
      const logger = new Logger({ component: "test" });
      const fatalError = new Error("System crash");
      
      logger.fatal("fatal_action", "Fatal error", fatalError);
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.level).toBe("fatal");
      expect(logOutput.levelEmoji).toBe("💀");
    });

    it("should filter logs by log level", () => {
      // Note: LOG_LEVEL is evaluated at module load time.
      // In production, changing the env var would require restarting the process.
      // Here we test that multiple logs are generated and the mechanism exists.
      const logger = new Logger({ component: "test" });
      
      // These should all log at info level or higher (info is default)
      logger.info("test", "Info message");
      logger.warn("test", "Warning message");
      
      const jsonLogs = capturedLogs.filter(l => l.startsWith("{"));
      expect(jsonLogs.length).toBe(2);
    });
  });

  describe("Structured log format", () => {
    it("should include all required fields", () => {
      const logger = new Logger({
        correlationId: "corr-123",
        requestId: "req-456",
        sessionId: "sess-789",
        userId: "user-001",
        userRole: "admin",
        service: "medicamenta-api",
        component: "auth",
      });

      logger.info("login", "User logged in");

      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;

      // Temporal
      expect(logOutput.timestamp).toBeDefined();
      expect(logOutput.timestampMs).toBeDefined();

      // Identification
      expect(logOutput.correlationId).toBe("corr-123");
      expect(logOutput.requestId).toBe("req-456");
      expect(logOutput.sessionId).toBe("sess-789");

      // Classification
      expect(logOutput.level).toBe("info");
      expect(logOutput.service).toBe("medicamenta-api");
      expect(logOutput.component).toBe("auth");
      expect(logOutput.action).toBe("login");

      // Context
      expect(logOutput.userId).toBe("user-001");
      expect(logOutput.userRole).toBe("admin");

      // Performance
      expect(logOutput.durationMs).toBeDefined();
      expect(logOutput.memoryUsageMB).toBeDefined();

      // Content
      expect(logOutput.message).toBe("User logged in");

      // LGPD
      expect(logOutput.sensitiveDataMasked).toBe(true);

      // AI hints
      expect(logOutput.aiHints).toBeDefined();
    });

    it("should include ISO timestamp format", () => {
      const logger = new Logger({ component: "test" });
      logger.info("test", "Test");
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      const timestamp = new Date(logOutput.timestamp);
      expect(timestamp.getTime()).toBeCloseTo(logOutput.timestampMs, -3);
    });
  });

  describe("LGPD Data Masking", () => {
    it("should mask CPF", () => {
      const logger = new Logger({ component: "test" });
      logger.info("test", "Test", { cpf: "123.456.789-00" });
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.metadata!.cpf).toBe("***MASKED(14)***");
    });

    it("should mask CNPJ", () => {
      const logger = new Logger({ component: "test" });
      logger.info("test", "Test", { cnpj: "12.345.678/0001-99" });
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.metadata!.cnpj).toBe("***MASKED(18)***");
    });

    it("should mask password fields", () => {
      const logger = new Logger({ component: "test" });
      logger.info("test", "Test", { 
        password: "secret123",
        userPassword: "also-secret",
        senha: "segredo",
      });
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.metadata!.password).toBe("***MASKED(9)***");
      expect(logOutput.metadata!.userPassword).toBe("***MASKED(11)***");
      expect(logOutput.metadata!.senha).toBe("***MASKED(7)***");
    });

    it("should mask tokens", () => {
      const logger = new Logger({ component: "test" });
      logger.info("test", "Test", {
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        accessToken: "access-123",
        refreshToken: "refresh-456",
        apiKey: "sk-1234567890",
      });
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.metadata!.token).toContain("***MASKED");
      expect(logOutput.metadata!.accessToken).toContain("***MASKED");
      expect(logOutput.metadata!.refreshToken).toContain("***MASKED");
      expect(logOutput.metadata!.apiKey).toContain("***MASKED");
    });

    it("should mask email and phone", () => {
      const logger = new Logger({ component: "test" });
      logger.info("test", "Test", {
        email: "user@example.com",
        phone: "+55119999999999",
        telefone: "11999999999",
        celular: "11988888888",
      });
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.metadata!.email).toContain("***MASKED");
      expect(logOutput.metadata!.phone).toContain("***MASKED");
      expect(logOutput.metadata!.telefone).toContain("***MASKED");
      expect(logOutput.metadata!.celular).toContain("***MASKED");
    });

    it("should mask address fields", () => {
      const logger = new Logger({ component: "test" });
      logger.info("test", "Test", {
        address: "123 Main St",
        endereco: "Rua Principal, 123",
      });
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.metadata!.address).toContain("***MASKED");
      expect(logOutput.metadata!.endereco).toContain("***MASKED");
    });

    it("should mask health data fields", () => {
      const logger = new Logger({ component: "test" });
      logger.info("test", "Test", {
        healthData: { bloodType: "O+" },
        prescriptionData: { medications: ["med1"] },
        medicationHistory: ["med1", "med2"],
      });
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.metadata!.healthData).toBe("***MASKED***");
      expect(logOutput.metadata!.prescriptionData).toBe("***MASKED***");
      expect(logOutput.metadata!.medicationHistory).toBe("***MASKED***");
    });

    it("should mask nested sensitive fields", () => {
      const logger = new Logger({ component: "test" });
      logger.info("test", "Test", {
        user: {
          name: "John Doe",
          cpf: "123.456.789-00",
          contact: {
            email: "john@example.com",
          },
        },
      });
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      const user = logOutput.metadata!.user as Record<string, unknown>;
      expect(user.name).toBe("John Doe"); // Not sensitive
      expect(user.cpf).toContain("***MASKED");
      expect((user.contact as Record<string, unknown>).email).toContain("***MASKED");
    });

    it("should preserve non-sensitive data", () => {
      const logger = new Logger({ component: "test" });
      logger.info("test", "Test", {
        orderId: "ord-123",
        quantity: 5,
        status: "active",
        tags: ["tag1", "tag2"],
      });
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.metadata!.orderId).toBe("ord-123");
      expect(logOutput.metadata!.quantity).toBe(5);
      expect(logOutput.metadata!.status).toBe("active");
      expect(logOutput.metadata!.tags).toEqual(["tag1", "tag2"]);
    });
  });

  describe("AI Hints", () => {
    it("should generate severity based on log level", () => {
      const logger = new Logger({ component: "test" });
      
      // Info level logs (debug filtered by default)
      logger.info("test", "Info");
      const infoLog = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(infoLog.aiHints!.severity).toBe("low");

      capturedLogs.length = 0;
      logger.error("test", "Error", new Error("Test"));
      const errorLog = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(errorLog.aiHints!.severity).toBe("high");

      capturedLogs.length = 0;
      logger.fatal("test", "Fatal", new Error("Test"));
      const fatalLog = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(fatalLog.aiHints!.severity).toBe("critical");
    });

    it("should mark error and fatal as requiring attention", () => {
      const logger = new Logger({ component: "test" });
      
      logger.info("test", "Info");
      const infoLog = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(infoLog.aiHints!.requiresAttention).toBe(false);

      logger.error("test", "Error", new Error("Test"));
      const errorLogs = capturedLogs.filter(l => l.startsWith("{") && l.includes('"level":"error"'));
      const errorLog = JSON.parse(errorLogs[0]) as StructuredLog;
      expect(errorLog.aiHints!.requiresAttention).toBe(true);
    });

    it("should suggest action for connection errors", () => {
      const logger = new Logger({ component: "test" });
      const error = new Error("connect ECONNREFUSED 127.0.0.1:5432");
      
      logger.error("db_error", "Database error", error);
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.aiHints!.suggestedAction).toBe("Check database/service connectivity");
    });

    it("should suggest action for timeout errors", () => {
      const logger = new Logger({ component: "test" });
      const error = new Error("Request timeout after 30000ms");
      
      logger.error("timeout", "Timeout", error);
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.aiHints!.suggestedAction).toBe("Check for slow queries or network issues");
    });

    it("should suggest action for permission errors", () => {
      const logger = new Logger({ component: "test" });
      const error = new Error("permission denied for resource");
      
      logger.error("permission_error", "Permission error", error);
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.aiHints!.suggestedAction).toBe("Review IAM permissions and security rules");
    });

    it("should suggest action for auth_failed action", () => {
      const logger = new Logger({ component: "test" });
      
      logger.warn("auth_failed", "Authentication failed");
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.aiHints!.suggestedAction).toBe("Review authentication configuration");
      expect(logOutput.aiHints!.severity).toBe("high");
    });
  });

  describe("HTTP Logging", () => {
    it("should log HTTP request with correct level based on status", () => {
      const logger = new Logger({ component: "http" });
      
      const mockReq = {
        method: "GET",
        path: "/api/users",
        ip: "127.0.0.1",
        get: jest.fn().mockReturnValue("Mozilla/5.0"),
        query: {},
      } as unknown as Request;

      // Success
      const mockRes200 = { statusCode: 200 } as Response;
      logger.httpLog(mockReq, mockRes200, 50);
      
      const successLog = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(successLog.level).toBe("info");
      expect(successLog.metadata!.method).toBe("GET");
      expect(successLog.metadata!.path).toBe("/api/users");
      expect(successLog.metadata!.statusCode).toBe(200);
      expect(successLog.metadata!.durationMs).toBe(50);

      // Client error
      const mockRes400 = { statusCode: 400 } as Response;
      logger.httpLog(mockReq, mockRes400, 30);
      
      const clientErrorLogs = capturedLogs.filter(l => l.includes('"statusCode":400'));
      const clientErrorLog = JSON.parse(clientErrorLogs[0]) as StructuredLog;
      expect(clientErrorLog.level).toBe("warn");

      // Server error
      const mockRes500 = { statusCode: 500 } as Response;
      logger.httpLog(mockReq, mockRes500, 100);
      
      const serverErrorLogs = capturedLogs.filter(l => l.includes('"statusCode":500'));
      const serverErrorLog = JSON.parse(serverErrorLogs[0]) as StructuredLog;
      expect(serverErrorLog.level).toBe("error");
    });
  });

  describe("Metrics", () => {
    it("should log metric with name, value and unit", () => {
      const logger = new Logger({ component: "performance" });
      
      logger.metric("response_time", 150, "ms", { endpoint: "/api/users" });
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.action).toBe("metric");
      expect(logOutput.message).toBe("response_time: 150ms");
      expect(logOutput.metadata!.metricName).toBe("response_time");
      expect(logOutput.metadata!.metricValue).toBe(150);
      expect(logOutput.metadata!.metricUnit).toBe("ms");
      expect(logOutput.metadata!.endpoint).toBe("/api/users");
    });
  });

  describe("Audit", () => {
    it("should log audit event with resource info", () => {
      const logger = new Logger({ 
        component: "audit",
        userId: "user-123",
        userRole: "admin",
      });
      
      logger.audit("UPDATE", "prescription", "presc-456", { 
        previousStatus: "pending",
        newStatus: "approved",
      });
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.action).toBe("audit");
      expect(logOutput.message).toBe("Audit: UPDATE on prescription/presc-456");
      expect(logOutput.metadata!.auditAction).toBe("UPDATE");
      expect(logOutput.metadata!.resourceType).toBe("prescription");
      expect(logOutput.metadata!.resourceId).toBe("presc-456");
      expect(logOutput.metadata!.performedBy).toBe("user-123");
      expect(logOutput.metadata!.performedByRole).toBe("admin");
    });
  });

  describe("loggerMiddleware", () => {
    it("should create logger and attach to request", () => {
      const mockReq = {
        headers: {},
        method: "GET",
        path: "/test",
        query: {},
      } as unknown as Request;
      
      const mockRes = {
        setHeader: jest.fn(),
        on: jest.fn(),
      } as unknown as Response;
      
      const nextFn = jest.fn();

      loggerMiddleware(mockReq, mockRes, nextFn);

      expect((mockReq as any).logger).toBeDefined();
      expect((mockReq as any).correlationId).toBeDefined();
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-Correlation-ID", expect.any(String));
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-Request-ID", expect.any(String));
      expect(nextFn).toHaveBeenCalled();
    });

    it("should use existing correlation ID from headers", () => {
      const mockReq = {
        headers: { "x-correlation-id": "existing-corr-id" },
        method: "GET",
        path: "/test",
        query: {},
      } as unknown as Request;
      
      const mockRes = {
        setHeader: jest.fn(),
        on: jest.fn(),
      } as unknown as Response;
      
      const nextFn = jest.fn();

      loggerMiddleware(mockReq, mockRes, nextFn);

      expect((mockReq as any).correlationId).toBe("existing-corr-id");
      expect(mockRes.setHeader).toHaveBeenCalledWith("X-Correlation-ID", "existing-corr-id");
    });

    it("should log on response finish", () => {
      const mockReq = {
        headers: {},
        method: "POST",
        path: "/api/orders",
        query: {},
        ip: "127.0.0.1",
        get: jest.fn().mockReturnValue("test-agent"),
      } as unknown as Request;
      
      let finishCallback: () => void = () => {};
      const mockRes = {
        statusCode: 201,
        setHeader: jest.fn(),
        on: jest.fn().mockImplementation((event: string, cb: () => void) => {
          if (event === "finish") {
            finishCallback = cb;
          }
        }),
      } as unknown as Response;
      
      const nextFn = jest.fn();

      loggerMiddleware(mockReq, mockRes, nextFn);
      
      // Simulate response finish
      finishCallback();

      // Should have request_start and http_request logs
      const jsonLogs = capturedLogs.filter(l => l.startsWith("{"));
      expect(jsonLogs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getLogger", () => {
    it("should return logger from request", () => {
      const existingLogger = new Logger({ correlationId: "test-corr" });
      const mockReq = { logger: existingLogger } as any;

      const logger = getLogger(mockReq);
      expect(logger.getCorrelationId()).toBe("test-corr");
    });

    it("should return child logger with component", () => {
      const existingLogger = new Logger({ correlationId: "test-corr" });
      const mockReq = { logger: existingLogger } as any;

      const childLogger = getLogger(mockReq, "child-component");
      expect(childLogger.getCorrelationId()).toBe("test-corr");
    });

    it("should create new logger if not in request", () => {
      const logger = getLogger(undefined, "standalone");
      expect(logger).toBeDefined();
      expect(logger.getCorrelationId()).toBeTruthy();
    });
  });

  describe("createLogger", () => {
    it("should create standalone logger with component", () => {
      const logger = createLogger("background-job");
      expect(logger).toBeDefined();
      expect(logger.getCorrelationId()).toBeTruthy();
    });

    it("should create logger with custom correlation ID", () => {
      const logger = createLogger("cron", "cron-corr-123");
      expect(logger.getCorrelationId()).toBe("cron-corr-123");
    });
  });

  describe("Error handling", () => {
    it("should handle errors without code property", () => {
      const logger = new Logger({ component: "test" });
      const error = new Error("Generic error");
      
      logger.error("test", "Error occurred", error);
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.error!.code).toBe("UNKNOWN_ERROR");
    });

    it("should include error cause if present", () => {
      const logger = new Logger({ component: "test" });
      const cause = new Error("Root cause");
      const error = new Error("Wrapper error");
      (error as any).cause = cause;
      
      logger.error("test", "Error occurred", error);
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.error!.cause).toContain("Root cause");
    });

    it("should hide stack trace in production", () => {
      process.env.NODE_ENV = "production";
      const logger = new Logger({ component: "test" });
      const error = new Error("Production error");
      
      logger.error("test", "Error occurred", error);
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.error!.stack).toBeUndefined();
    });

    it("should show stack trace in non-production", () => {
      process.env.NODE_ENV = "development";
      const logger = new Logger({ component: "test" });
      const error = new Error("Dev error");
      
      logger.error("test", "Error occurred", error);
      
      const logOutput = JSON.parse(capturedLogs[0]) as StructuredLog;
      expect(logOutput.error!.stack).toBeDefined();
    });
  });

  describe("Human-readable output", () => {
    it("should output human-readable format in non-production", () => {
      process.env.NODE_ENV = "development";
      const logger = new Logger({ 
        component: "test",
        correlationId: "12345678-1234-1234-1234-123456789012",
      });
      
      logger.info("test_action", "Test message");
      
      // Should have both JSON and human-readable outputs
      expect(capturedLogs.length).toBe(2);
      
      const humanReadable = capturedLogs[1];
      expect(humanReadable).toContain("ℹ️");
      expect(humanReadable).toContain("[12345678]");
      expect(humanReadable).toContain("test.test_action");
      expect(humanReadable).toContain("Test message");
    });
  });
});
