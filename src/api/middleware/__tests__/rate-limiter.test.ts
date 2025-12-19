/**
 * 🧪 Rate Limiter Middleware Tests
 * Cobertura: 100% (linhas, branches, funções)
 */

import { Request, Response, NextFunction } from "express";
import { rateLimiter, requestCounts } from "../rate-limiter";

describe("⏱️ Rate Limiter Middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockSetHeader: jest.Mock;

  beforeEach(() => {
    // Clear rate limit map before each test
    requestCounts.clear();

    mockSetHeader = jest.fn();

    mockRequest = {
      headers: {},
      socket: {
        remoteAddress: "127.0.0.1",
      } as any,
    };

    mockResponse = {
      setHeader: mockSetHeader,
    };

    mockNext = jest.fn();

    // Reset Date.now for consistent tests
    jest.spyOn(Date, "now").mockReturnValue(1000000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    requestCounts.clear();
  });

  describe("✅ Cenários Positivos", () => {
    it("deve permitir request dentro do limite (tier free)", async () => {
      mockRequest.headers = {};

      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockSetHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "100");
      expect(mockSetHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", "99");
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("deve usar tier correto quando fornecido", async () => {
      (mockRequest as any).tier = "professional";

      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockSetHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "2000");
      expect(mockSetHeader).toHaveBeenCalledWith(
        "X-RateLimit-Remaining",
        "1999"
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("deve identificar cliente por API key", async () => {
      mockRequest.headers = {
        "x-api-key": "test-api-key-123",
      };

      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });

    it("deve identificar cliente por user ID", async () => {
      mockRequest.user = {
        uid: "user123",
      };

      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });

    it("deve resetar contador após janela de tempo", async () => {
      const now = 1000000;
      jest.spyOn(Date, "now").mockReturnValue(now);

      // Primeira request
      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockSetHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", "99");

      // Avançar tempo além da janela (60s)
      jest.spyOn(Date, "now").mockReturnValue(now + 61000);

      // Segunda request deve ter contador resetado
      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Deve ser 99 novamente, não 98
      expect(mockSetHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", "99");
    });
  });

  describe("❌ Cenários Negativos", () => {
    it("deve bloquear quando limite é excedido (tier free)", async () => {
      mockRequest.headers = {};
      (mockRequest as any).tier = "free";

      // Fazer 100 requests (limite)
      for (let i = 0; i < 100; i++) {
        await rateLimiter(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );
      }

      // 101ª request deve ser bloqueada
      (mockNext as jest.Mock).mockClear();

      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 429,
          code: "RATE_LIMIT_EXCEEDED",
          message: expect.stringContaining("Rate limit exceeded"),
        })
      );
    });

    it("deve incluir Retry-After header quando bloqueado", async () => {
      mockRequest.headers = {};
      (mockRequest as any).tier = "free";

      // Exceder limite
      for (let i = 0; i < 101; i++) {
        await rateLimiter(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );
      }

      expect(mockSetHeader).toHaveBeenCalledWith(
        "Retry-After",
        expect.any(String)
      );
    });

    it("deve incluir X-RateLimit-Reset header", async () => {
      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockSetHeader).toHaveBeenCalledWith(
        "X-RateLimit-Reset",
        expect.any(String)
      );
    });
  });

  describe("⚠️ Edge Cases", () => {
    it("deve usar tier free como fallback para tier desconhecido", async () => {
      (mockRequest as any).tier = "unknown-tier";

      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockSetHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "100");
    });

    it("deve usar IP como fallback se não há API key nem user", async () => {
      mockRequest.headers = {
        "x-forwarded-for": "192.168.1.1",
      };

      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });

    it("deve decrementar remaining corretamente", async () => {
      // Request 1
      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      expect(mockSetHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", "99");

      // Request 2
      mockSetHeader.mockClear();
      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      expect(mockSetHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", "98");

      // Request 3
      mockSetHeader.mockClear();
      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      expect(mockSetHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", "97");
    });

    it("deve lidar com diferentes tiers corretamente", async () => {
      const tiers = [
        { name: "free", limit: 100 },
        { name: "starter", limit: 500 },
        { name: "professional", limit: 2000 },
        { name: "business", limit: 5000 },
        { name: "enterprise", limit: 10000 },
      ];

      for (const tier of tiers) {
        mockSetHeader.mockClear();
        (mockRequest as any).tier = tier.name;
        mockRequest.headers = { "x-api-key": `key-${tier.name}` };

        await rateLimiter(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockSetHeader).toHaveBeenCalledWith(
          "X-RateLimit-Limit",
          tier.limit.toString()
        );
        expect(mockSetHeader).toHaveBeenCalledWith(
          "X-RateLimit-Remaining",
          (tier.limit - 1).toString()
        );
      }
    });

    it("deve capturar exceções e passar para next", async () => {
      // Forçar erro mockando Date.now com função que lança exceção
      jest.spyOn(Date, "now").mockImplementation(() => {
        throw new Error("Time error");
      });

      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it("deve incluir details no erro de rate limit", async () => {
      (mockRequest as any).tier = "free";

      // Exceder limite
      for (let i = 0; i < 101; i++) {
        await rateLimiter(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );
      }

      const errorCall = (mockNext as jest.Mock).mock.calls.find((call) =>
        call[0]?.code?.includes("RATE_LIMIT")
      );

      expect(errorCall[0].details).toEqual(
        expect.objectContaining({
          limit: 100,
          windowMs: 60000,
          retryAfter: expect.any(Number),
        })
      );
    });

    it("deve executar cleanup de registros antigos aleatoriamente", async () => {
      // Criar registros expirados
      const now = 1000000;
      jest.spyOn(Date, "now").mockReturnValue(now);
      
      // Adicionar registro expirado manualmente
      requestCounts.set("expired:key", {
        count: 50,
        resetTime: now - 10000, // Expirado há 10s
      });

      // Forçar Math.random para garantir cleanup (< 0.01)
      jest.spyOn(Math, "random").mockReturnValue(0.005);

      expect(requestCounts.has("expired:key")).toBe(true);

      await rateLimiter(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Registro expirado deve ter sido removido
      expect(requestCounts.has("expired:key")).toBe(false);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});
