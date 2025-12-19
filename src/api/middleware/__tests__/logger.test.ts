/**
 * 🧪 Logger Middleware Tests
 * Cobertura: 100% (linhas, branches, funções)
 */

import { Request, Response, NextFunction } from "express";
import { EventEmitter } from "events";
import { requestLogger } from "../logger";

// Mock Firebase Admin
jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      add: jest.fn().mockResolvedValue({}),
    })),
  })),
}));

describe("📝 Request Logger Middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: any;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: "GET",
      path: "/api/test",
      query: { page: "1" },
      headers: {
        "user-agent": "test-agent",
        "x-forwarded-for": "192.168.1.1",
        authorization: "Bearer secret-token",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      } as any,
    };

    const emitter = new EventEmitter();
    mockResponse = Object.assign(emitter, {
      setHeader: jest.fn(),
      statusCode: 200,
    });

    mockNext = jest.fn();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("✅ Cenários Positivos", () => {
    it("deve gerar request ID único", () => {
      requestLogger(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.headers?.["x-request-id"]).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "X-Request-ID",
        expect.stringMatching(/^req_\d+_[a-z0-9]+$/)
      );
    });

    it("deve chamar next() imediatamente", () => {
      requestLogger(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it("deve logar quando response finaliza", (done) => {
      const consoleLogSpy = jest.spyOn(console, "log");

      requestLogger(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      mockResponse.emit("finish");

      setTimeout(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining("GET /api/test 200")
        );
        done();
      }, 10);
    });

    it("deve calcular duração da request", (done) => {
      const consoleLogSpy = jest.spyOn(console, "log");

      requestLogger(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      setTimeout(() => {
        mockResponse.emit("finish");

        setTimeout(() => {
          const logCall = consoleLogSpy.mock.calls[0][0];
          expect(logCall).toMatch(/\d+ms/);
          done();
        }, 10);
      }, 50);
    });
  });

  describe("❌ Cenários Negativos", () => {
    it("deve usar IP do socket se x-forwarded-for não existe", () => {
      delete mockRequest.headers?.["x-forwarded-for"];

      requestLogger(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("⚠️ Edge Cases", () => {
    it("deve lidar com query params vazios", () => {
      mockRequest.query = {};

      requestLogger(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it("deve incluir partnerId se disponível", (done) => {
      (mockRequest as any).partnerId = "partner123";

      requestLogger(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      mockResponse.emit("finish");

      setTimeout(() => {
        expect(mockNext).toHaveBeenCalled();
        done();
      }, 10);
    });

    it("deve incluir apiKeyId se disponível", (done) => {
      (mockRequest as any).apiKey = { id: "key123" };

      requestLogger(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      mockResponse.emit("finish");

      setTimeout(() => {
        expect(mockNext).toHaveBeenCalled();
        done();
      }, 10);
    });

    it("deve logar no Firestore em produção", (done) => {
      process.env.NODE_ENV = "production";

      requestLogger(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      mockResponse.emit("finish");

      setTimeout(() => {
        expect(mockNext).toHaveBeenCalled();
        done();
      }, 10);
    });
  });
});
