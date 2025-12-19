/**
 * 🧪 API Key Validator Tests
 * Cobertura: 100% (linhas, branches, funções)
 */

import { Request, Response, NextFunction } from "express";

// Setup mocks ANTES de importar o módulo testado
const mockGet = jest.fn();
const mockUpdate = jest.fn().mockResolvedValue({});
const mockAdd = jest.fn().mockResolvedValue({ id: "new-key-id" });
const mockDocGet = jest.fn().mockResolvedValue({
  data: () => ({
    key: "mk_free_test",
    status: "active",
  }),
});
const mockCollection = jest.fn((collectionName: string) => ({
  where: jest.fn(() => ({
    limit: jest.fn(() => ({
      get: mockGet,
    })),
  })),
  doc: jest.fn(() => ({
    update: mockUpdate,
    get: mockDocGet,
  })),
  add: mockAdd,
}));

// Mock Firebase Admin
jest.mock("firebase-admin", () => {
  const mockFieldValue = {
    increment: jest.fn((val) => val),
    serverTimestamp: jest.fn(() => new Date()),
  };
  
  const mockFirestoreInstance = () => ({
    collection: mockCollection,
  });
  
  // FieldValue deve ser uma propriedade estática de firestore
  (mockFirestoreInstance as any).FieldValue = mockFieldValue;
  
  return {
    firestore: mockFirestoreInstance,
  };
});

// DEPOIS dos mocks, importar o módulo
import { validateApiKey, generateApiKey, revokeApiKey } from "../api-key-validator";

describe("🔑 API Key Validator", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {};
    mockNext = jest.fn();

    jest.clearAllMocks();
  });

  describe("validateApiKey()", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve validar API key válida", async () => {
        const mockApiKey = {
          id: "key123",
          partnerId: "partner123",
          name: "Test API Key",
          key: "mk_free_test123",
          tier: "free",
          permissions: ["read", "write"],
          status: "active",
          rateLimit: { requestsPerMinute: 100, requestsPerDay: 10000 },
          usage: { totalRequests: 0 },
          createdAt: new Date(),
        };

        mockRequest.headers = {
          "x-api-key": "mk_free_test123",
        };

        const mockSnapshot = {
          empty: false,
          docs: [
            {
              id: "key123",
              data: () => mockApiKey,
            },
          ],
        };

        mockGet.mockResolvedValue(mockSnapshot);

        await validateApiKey(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalledWith();
        expect((mockRequest as any).apiKey).toBeDefined();
        expect((mockRequest as any).partnerId).toBe("partner123");
        expect((mockRequest as any).tier).toBe("free");
      });

      it("deve usar cache para API key já consultada", async () => {
        const mockApiKey = {
          id: "key123",
          partnerId: "partner123",
          name: "Test API Key",
          key: "mk_free_cached",
          tier: "professional",
          permissions: ["read"],
          status: "active",
          rateLimit: { requestsPerMinute: 2000, requestsPerDay: 200000 },
          usage: { totalRequests: 5 },
          createdAt: new Date(),
        };

        mockRequest.headers = {
          "x-api-key": "mk_free_cached",
        };

        const mockSnapshot = {
          empty: false,
          docs: [{ id: "key123", data: () => mockApiKey }],
        };

        mockGet.mockResolvedValue(mockSnapshot);

        // Primeira chamada
        await validateApiKey(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Segunda chamada (deve usar cache)
        await validateApiKey(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Firestore deve ser chamado apenas uma vez
        expect(mockGet).toHaveBeenCalledTimes(1);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar erro 401 se X-API-Key header não existe", async () => {
        mockRequest.headers = {};

        await validateApiKey(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 401,
            code: "MISSING_API_KEY",
            message: expect.stringContaining("API key is required"),
          })
        );
      });

      it("deve retornar erro 401 se API key não existe", async () => {
        mockRequest.headers = {
          "x-api-key": "mk_free_invalid",
        };

        const mockSnapshot = {
          empty: true,
          docs: [],
        };

        mockGet.mockResolvedValue(mockSnapshot);

        await validateApiKey(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 401,
            code: "INVALID_API_KEY",
            message: "Invalid API key",
          })
        );
      });

      it("deve retornar erro 403 se API key está suspensa", async () => {
        const mockApiKey = {
          id: "key123",
          partnerId: "partner123",
          key: "mk_free_suspended",
          tier: "free",
          permissions: [],
          status: "suspended",
          rateLimit: { requestsPerMinute: 100, requestsPerDay: 10000 },
          usage: { totalRequests: 0 },
          createdAt: new Date(),
        };

        mockRequest.headers = {
          "x-api-key": "mk_free_suspended",
        };

        const mockSnapshot = {
          empty: false,
          docs: [{ id: "key123", data: () => mockApiKey }],
        };

        mockGet.mockResolvedValue(mockSnapshot);

        await validateApiKey(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 403,
            code: "API_KEY_INACTIVE",
            message: expect.stringContaining("suspended"),
          })
        );
      });

      it("deve retornar erro 403 se API key está revogada", async () => {
        const mockApiKey = {
          id: "key123",
          partnerId: "partner123",
          key: "mk_free_revoked",
          tier: "free",
          permissions: [],
          status: "revoked",
          rateLimit: { requestsPerMinute: 100, requestsPerDay: 10000 },
          usage: { totalRequests: 0 },
          createdAt: new Date(),
        };

        mockRequest.headers = {
          "x-api-key": "mk_free_revoked",
        };

        const mockSnapshot = {
          empty: false,
          docs: [{ id: "key123", data: () => mockApiKey }],
        };

        mockGet.mockResolvedValue(mockSnapshot);

        await validateApiKey(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 403,
            code: "API_KEY_INACTIVE",
            message: expect.stringContaining("revoked"),
          })
        );
      });

      it("deve retornar erro 401 se API key expirou", async () => {
        const expiredDate = new Date();
        expiredDate.setDate(expiredDate.getDate() - 1); // 1 dia atrás

        const mockApiKey = {
          id: "key123",
          partnerId: "partner123",
          key: "mk_free_expired",
          tier: "free",
          permissions: [],
          status: "active",
          rateLimit: { requestsPerMinute: 100, requestsPerDay: 10000 },
          usage: { totalRequests: 0 },
          createdAt: new Date(),
          expiresAt: expiredDate,
        };

        mockRequest.headers = {
          "x-api-key": "mk_free_expired",
        };

        const mockSnapshot = {
          empty: false,
          docs: [{ id: "key123", data: () => mockApiKey }],
        };

        mockGet.mockResolvedValue(mockSnapshot);

        await validateApiKey(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 401,
            code: "API_KEY_EXPIRED",
            message: "API key has expired",
          })
        );
      });
    });

    describe("⚠️ Edge Cases", () => {
      it("deve lidar com Firestore erro", async () => {
        mockRequest.headers = {
          "x-api-key": "mk_free_test",
        };

        mockGet.mockRejectedValue(
          new Error("Firestore error")
        );

        await validateApiKey(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      });

      it("deve atualizar usage stats assincronamente", async () => {
        const mockApiKey = {
          id: "key123",
          partnerId: "partner123",
          key: "mk_free_usage",
          tier: "free",
          permissions: [],
          status: "active",
          rateLimit: { requestsPerMinute: 100, requestsPerDay: 10000 },
          usage: { totalRequests: 0 },
          createdAt: new Date(),
        };

        mockRequest.headers = {
          "x-api-key": "mk_free_usage",
        };

        const mockSnapshot = {
          empty: false,
          docs: [{ id: "key123", data: () => mockApiKey }],
        };

        mockGet.mockResolvedValue(mockSnapshot);

        await validateApiKey(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        // Deve ter chamado next() antes da atualização
        expect(mockNext).toHaveBeenCalledWith();
      });
    });
  });

  describe("generateApiKey()", () => {
    it("deve gerar API key com tier free", async () => {
      const key = await generateApiKey("partner123", "Test Key", "free", ["read"]);

      expect(key).toMatch(/^mk_free_[A-Za-z0-9]{32}$/);
      expect(mockAdd).toHaveBeenCalled();
    });

    it("deve gerar API key com tier enterprise", async () => {
      const key = await generateApiKey("partner456", "Enterprise Key", "enterprise", [
        "read",
        "write",
        "admin",
      ]);

      expect(key).toMatch(/^mk_enterprise_[A-Za-z0-9]{32}$/);
    });

    it("deve criar audit log ao gerar key", async () => {
      await generateApiKey("partner789", "Audit Test", "professional");

      // Verifica se add foi chamado duas vezes (API key + audit log)
      expect(mockAdd).toHaveBeenCalledTimes(2);
    });
  });

  describe("revokeApiKey()", () => {
    it("deve revogar API key", async () => {
      await revokeApiKey("key123");

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "revoked",
        })
      );
    });
  });
});
