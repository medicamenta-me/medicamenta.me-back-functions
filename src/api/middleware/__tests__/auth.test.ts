/**
 * 🧪 Auth Middleware Tests
 * Testes do middleware de autenticação
 * Cobertura: 100% (linhas, branches, funções)
 */

import { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import jwt from "jsonwebtoken";
import {
  authenticate,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  requirePermissions,
} from "../auth";

// Mock Firebase Admin
jest.mock("firebase-admin", () => ({
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

// Mock JWT
jest.mock("jsonwebtoken");

describe("🔐 Auth Middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      user: undefined,
    };
    mockResponse = {};
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe("authenticate()", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve autenticar com Firebase ID token válido", async () => {
        const mockToken = "valid-firebase-token";
        const mockDecodedToken = {
          uid: "user123",
          email: "user@example.com",
          partnerId: "partner123",
          permissions: ["read", "write"],
        };

        mockRequest.headers = {
          authorization: `Bearer ${mockToken}`,
        };

        const mockVerifyIdToken = jest.fn().mockResolvedValue(mockDecodedToken);
        (admin.auth as jest.Mock).mockReturnValue({
          verifyIdToken: mockVerifyIdToken,
        });

        await authenticate(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockVerifyIdToken).toHaveBeenCalledWith(mockToken);
        expect(mockRequest.user).toEqual({
          uid: "user123",
          email: "user@example.com",
          partnerId: "partner123",
          permissions: ["read", "write"],
        });
        expect(mockNext).toHaveBeenCalledWith();
      });

      it("deve autenticar com JWT token válido quando Firebase falha", async () => {
        const mockToken = "valid-jwt-token";
        const mockJwtPayload = {
          sub: "user456",
          email: "jwt@example.com",
          partnerId: "partner456",
          permissions: ["admin"],
        };

        mockRequest.headers = {
          authorization: `Bearer ${mockToken}`,
        };

        const mockVerifyIdToken = jest.fn().mockRejectedValue(new Error("Invalid Firebase token"));
        (admin.auth as jest.Mock).mockReturnValue({
          verifyIdToken: mockVerifyIdToken,
        });

        (jwt.verify as jest.Mock).mockReturnValue(mockJwtPayload);

        await authenticate(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(jwt.verify).toHaveBeenCalledWith(mockToken, expect.any(String));
        expect(mockRequest.user).toEqual({
          uid: "user456",
          email: "jwt@example.com",
          partnerId: "partner456",
          permissions: ["admin"],
          apiKeyId: undefined,
        });
        expect(mockNext).toHaveBeenCalledWith();
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar erro 401 se authorization header não existe", async () => {
        mockRequest.headers = {};

        await authenticate(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 401,
            code: "UNAUTHORIZED",
            message: "Missing authorization header",
          })
        );
      });

      it("deve retornar erro 401 se scheme não é Bearer", async () => {
        mockRequest.headers = {
          authorization: "Basic dXNlcjpwYXNz",
        };

        await authenticate(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 401,
            message: expect.stringContaining("Invalid authorization scheme"),
          })
        );
      });

      it("deve retornar erro 401 se token está vazio", async () => {
        mockRequest.headers = {
          authorization: "Bearer ",
        };

        await authenticate(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 401,
            message: "Missing token",
          })
        );
      });

      it("deve retornar erro 401 se Firebase e JWT tokens são inválidos", async () => {
        const mockToken = "invalid-token";
        mockRequest.headers = {
          authorization: `Bearer ${mockToken}`,
        };

        const mockVerifyIdToken = jest.fn().mockRejectedValue(new Error("Invalid token"));
        (admin.auth as jest.Mock).mockReturnValue({
          verifyIdToken: mockVerifyIdToken,
        });

        (jwt.verify as jest.Mock).mockImplementation(() => {
          throw new Error("Invalid JWT");
        });

        await authenticate(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 401,
            message: "Invalid or expired token",
          })
        );
      });
    });

    describe("⚠️ Edge Cases", () => {
      it("deve lidar com token Firebase sem permissions", async () => {
        const mockToken = "token-without-permissions";
        const mockDecodedToken = {
          uid: "user789",
          email: "noperm@example.com",
        };

        mockRequest.headers = {
          authorization: `Bearer ${mockToken}`,
        };

        const mockVerifyIdToken = jest.fn().mockResolvedValue(mockDecodedToken);
        (admin.auth as jest.Mock).mockReturnValue({
          verifyIdToken: mockVerifyIdToken,
        });

        await authenticate(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockRequest.user?.permissions).toEqual([]);
        expect(mockNext).toHaveBeenCalledWith();
      });

      it("deve lidar com token JWT sem email", async () => {
        const mockToken = "jwt-no-email";
        const mockJwtPayload = {
          sub: "user-no-email",
        };

        mockRequest.headers = {
          authorization: `Bearer ${mockToken}`,
        };

        const mockVerifyIdToken = jest.fn().mockRejectedValue(new Error("Not Firebase"));
        (admin.auth as jest.Mock).mockReturnValue({
          verifyIdToken: mockVerifyIdToken,
        });

        (jwt.verify as jest.Mock).mockReturnValue(mockJwtPayload);

        await authenticate(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockRequest.user?.email).toBeUndefined();
        expect(mockRequest.user?.uid).toBe("user-no-email");
        expect(mockNext).toHaveBeenCalledWith();
      });
    });
  });

  describe("generateAccessToken()", () => {
    beforeEach(() => {
      (jwt.sign as jest.Mock).mockReturnValue("mock-access-token");
    });

    it("deve gerar token com payload completo", () => {
      const payload = {
        sub: "user123",
        email: "user@example.com",
        partnerId: "partner123",
        permissions: ["read", "write"],
        apiKeyId: "key123",
      };

      const token = generateAccessToken(payload);

      expect(jwt.sign).toHaveBeenCalledWith(
        payload,
        expect.any(String),
        expect.objectContaining({
          expiresIn: "24h",
          issuer: "medicamenta.me",
          audience: "medicamenta-api",
        })
      );
      expect(token).toBe("mock-access-token");
    });

    it("deve gerar token com payload mínimo", () => {
      const payload = { sub: "user456" };

      const token = generateAccessToken(payload);

      expect(jwt.sign).toHaveBeenCalledWith(payload, expect.any(String), expect.any(Object));
      expect(token).toBe("mock-access-token");
    });
  });

  describe("generateRefreshToken()", () => {
    beforeEach(() => {
      (jwt.sign as jest.Mock).mockReturnValue("mock-refresh-token");
    });

    it("deve gerar refresh token com sub", () => {
      const payload = { sub: "user123" };

      const token = generateRefreshToken(payload);

      expect(jwt.sign).toHaveBeenCalledWith(
        payload,
        expect.any(String),
        expect.objectContaining({
          expiresIn: "30d",
          issuer: "medicamenta.me",
          audience: "medicamenta-api",
        })
      );
      expect(token).toBe("mock-refresh-token");
    });
  });

  describe("verifyRefreshToken()", () => {
    it("deve verificar token válido", () => {
      const mockDecoded = { sub: "user123", iat: 1234567890, exp: 9999999999 };
      (jwt.verify as jest.Mock).mockReturnValue(mockDecoded);

      const result = verifyRefreshToken("valid-refresh-token");

      expect(jwt.verify).toHaveBeenCalledWith(
        "valid-refresh-token",
        expect.any(String),
        expect.objectContaining({
          issuer: "medicamenta.me",
          audience: "medicamenta-api",
        })
      );
      expect(result).toEqual(mockDecoded);
    });

    it("deve lançar erro para token inválido", () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error("Invalid token");
      });

      expect(() => verifyRefreshToken("invalid-token")).toThrow("Invalid token");
    });
  });

  describe("requirePermissions()", () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let nextFn: NextFunction;

    beforeEach(() => {
      mockReq = {
        user: {
          uid: "user123",
          permissions: ["read", "write"],
        },
      };
      mockRes = {};
      nextFn = jest.fn();
    });

    it("deve permitir acesso com permissão correta", () => {
      const middleware = requirePermissions("read");

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
    });

    it("deve permitir acesso com múltiplas permissões", () => {
      const middleware = requirePermissions("read", "write");

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
    });

    it("deve permitir acesso com permissão admin", () => {
      mockReq.user!.permissions = ["admin"];
      const middleware = requirePermissions("read", "write", "delete");

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalledWith();
    });

    it("deve retornar 401 se usuário não está autenticado", () => {
      mockReq.user = undefined;
      const middleware = requirePermissions("read");

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: "UNAUTHORIZED",
          message: "Authentication required",
        })
      );
    });

    it("deve retornar 403 se permissão faltando", () => {
      mockReq.user!.permissions = ["read"];
      const middleware = requirePermissions("write");

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: "FORBIDDEN",
          message: expect.stringContaining("Missing required permissions: write"),
        })
      );
    });

    it("deve lidar com usuário sem array de permissions", () => {
      mockReq.user!.permissions = undefined;
      const middleware = requirePermissions("read");

      middleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
        })
      );
    });
  });
});
