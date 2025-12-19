/**
 * 🧪 Error Handler Middleware Tests
 * Cobertura: 100% (linhas, branches, funções)
 */

import { Request, Response, NextFunction } from "express";
import { errorHandler } from "../error-handler";
import { ApiError } from "../../utils/api-error";

describe("🚨 Error Handler Middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    mockRequest = {
      path: "/api/test",
      method: "GET",
      headers: {
        "x-request-id": "test-request-123",
      },
    };

    mockResponse = {
      status: mockStatus,
      json: mockJson,
    };

    mockNext = jest.fn();

    // Spy on console.error
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("✅ Cenários Positivos", () => {
    it("deve tratar ApiError corretamente", () => {
      const apiError = new ApiError(400, "BAD_REQUEST", "Invalid input", {
        field: "email",
      });

      errorHandler(
        apiError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "BAD_REQUEST",
            message: "Invalid input",
            statusCode: 400,
            details: { field: "email" },
          }),
        })
      );
    });

    it("deve logar erro com detalhes", () => {
      const error = new Error("Test error");
      const consoleErrorSpy = jest.spyOn(console, "error");

      errorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "API Error:",
        expect.objectContaining({
          error: "Test error",
          path: "/api/test",
          method: "GET",
          requestId: "test-request-123",
        })
      );
    });
  });

  describe("❌ Cenários Negativos", () => {
    it("deve tratar ValidationError com status 400", () => {
      const validationError = new Error("Validation failed");
      validationError.name = "ValidationError";

      errorHandler(
        validationError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "VALIDATION_ERROR",
            message: "Validation failed",
            requestId: "test-request-123",
          }),
        })
      );
    });

    it("deve tratar erro desconhecido com status 500", () => {
      const unknownError = new Error("Unknown error");

      errorHandler(
        unknownError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "INTERNAL_ERROR",
            requestId: "test-request-123",
          }),
        })
      );
    });

    it("deve ocultar mensagem de erro em produção", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const unknownError = new Error("Sensitive error message");

      errorHandler(
        unknownError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: "An internal error occurred",
          }),
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it("deve mostrar mensagem de erro em desenvolvimento", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const unknownError = new Error("Detailed error message");

      errorHandler(
        unknownError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: "Detailed error message",
          }),
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("⚠️ Edge Cases", () => {
    it("deve lidar com ApiError sem details", () => {
      const apiError = new ApiError(404, "NOT_FOUND", "Resource not found");

      errorHandler(
        apiError,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: "NOT_FOUND",
            message: "Resource not found",
            details: undefined,
          }),
        })
      );
    });

    it("deve lidar com request sem x-request-id", () => {
      mockRequest.headers = {};

      const error = new Error("Test error");

      errorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            requestId: undefined,
          }),
        })
      );
    });

    it("deve incluir timestamp em todas as respostas", () => {
      const error = new Error("Test");
      const beforeTime = new Date().toISOString();

      errorHandler(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const callArgs = mockJson.mock.calls[0][0];
      const timestamp = callArgs.error.timestamp;

      expect(timestamp).toBeDefined();
      expect(new Date(timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTime).getTime()
      );
    });
  });
});
