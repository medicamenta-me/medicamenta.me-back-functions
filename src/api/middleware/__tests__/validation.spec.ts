/**
 * 🧪 Validation Middleware Tests
 * 
 * Testes unitários para middleware de validação Zod
 * Coverage target: 100% lines, branches, statements, functions
 * 
 * @module __tests__/middleware/validation.spec
 */

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { 
  validateBody, 
  validateQuery, 
  validateParams,
  validate 
} from "../validation";
import { ApiError } from "../../utils/api-error";

describe("Validation Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe("validateBody", () => {
    const TestSchema = z.object({
      name: z.string().min(3),
      email: z.string().email(),
      age: z.number().int().min(0).optional(),
    });

    describe("✅ Cenários de Sucesso", () => {
      it("deve validar body válido e chamar next", () => {
        // Arrange
        mockReq.body = { name: "John Doe", email: "john@example.com" };
        const middleware = validateBody(TestSchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
        expect(mockReq.body.name).toBe("John Doe");
      });

      it("deve validar body com campos opcionais", () => {
        // Arrange
        mockReq.body = { name: "John Doe", email: "john@example.com", age: 25 };
        const middleware = validateBody(TestSchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
        expect(mockReq.body.age).toBe(25);
      });

      it("deve transformar dados com schema transform", () => {
        // Arrange
        const TransformSchema = z.object({
          value: z.string().transform((val) => val.toUpperCase()),
        });
        mockReq.body = { value: "hello" };
        const middleware = validateBody(TransformSchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockReq.body.value).toBe("HELLO");
      });
    });

    describe("❌ Cenários de Erro", () => {
      it("deve retornar 400 se body inválido - campo obrigatório faltando", () => {
        // Arrange
        mockReq.body = { email: "john@example.com" }; // name faltando
        const middleware = validateBody(TestSchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe("VALIDATION_ERROR");
        expect(error.details).toBeDefined();
        expect(error.details).toContainEqual(expect.objectContaining({
          field: "name",
        }));
      });

      it("deve retornar 400 se email inválido", () => {
        // Arrange
        mockReq.body = { name: "John", email: "invalid-email" };
        const middleware = validateBody(TestSchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.details).toContainEqual(expect.objectContaining({
          field: "email",
        }));
      });

      it("deve retornar 400 se string muito curta", () => {
        // Arrange
        mockReq.body = { name: "Jo", email: "john@example.com" }; // name < 3
        const middleware = validateBody(TestSchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.details).toContainEqual(expect.objectContaining({
          field: "name",
        }));
      });

      it("deve retornar 400 se tipo inválido", () => {
        // Arrange
        mockReq.body = { name: "John", email: "john@example.com", age: "not-a-number" };
        const middleware = validateBody(TestSchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.details).toContainEqual(expect.objectContaining({
          field: "age",
        }));
      });

      it("deve formatar múltiplos erros", () => {
        // Arrange
        mockReq.body = { name: "Jo", email: "invalid" }; // 2 erros
        const middleware = validateBody(TestSchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.details?.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe("validateQuery", () => {
    const QuerySchema = z.object({
      page: z.string().optional().transform(val => val ? parseInt(val) : 1),
      limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
      search: z.string().optional(),
    });

    describe("✅ Cenários de Sucesso", () => {
      it("deve validar query params válidos", () => {
        // Arrange
        mockReq.query = { page: "2", limit: "20", search: "test" };
        const middleware = validateQuery(QuerySchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
        expect((mockReq as any).validatedQuery.page).toBe(2);
        expect((mockReq as any).validatedQuery.limit).toBe(20);
      });

      it("deve usar valores default quando não fornecidos", () => {
        // Arrange
        mockReq.query = {};
        const middleware = validateQuery(QuerySchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
        expect((mockReq as any).validatedQuery.page).toBe(1);
        expect((mockReq as any).validatedQuery.limit).toBe(10);
      });

      it("deve validar query com search", () => {
        // Arrange
        mockReq.query = { search: "farmacia" };
        const middleware = validateQuery(QuerySchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect((mockReq as any).validatedQuery.search).toBe("farmacia");
      });
    });

    describe("❌ Cenários de Erro", () => {
      it("deve retornar 400 se validação de query falha", () => {
        // Arrange
        const StrictSchema = z.object({
          status: z.enum(["active", "inactive"]),
        });
        mockReq.query = { status: "invalid-status" };
        const middleware = validateQuery(StrictSchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain("Query parameters");
      });
    });
  });

  describe("validateParams", () => {
    const ParamsSchema = z.object({
      id: z.string().min(20, "Invalid ID format"),
    });

    describe("✅ Cenários de Sucesso", () => {
      it("deve validar params válidos", () => {
        // Arrange
        mockReq.params = { id: "12345678901234567890" }; // 20 chars
        const middleware = validateParams(ParamsSchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
        expect((mockReq as any).validatedParams.id).toBe("12345678901234567890");
      });
    });

    describe("❌ Cenários de Erro", () => {
      it("deve retornar 400 se id muito curto", () => {
        // Arrange
        mockReq.params = { id: "short" };
        const middleware = validateParams(ParamsSchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain("Path parameters");
      });

      it("deve retornar 400 se param obrigatório faltando", () => {
        // Arrange
        mockReq.params = {};
        const middleware = validateParams(ParamsSchema);

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
      });
    });
  });

  describe("validate (combined)", () => {
    const bodySchema = z.object({
      status: z.enum(["confirmed", "cancelled"]),
      reason: z.string().optional(),
    });
    const querySchema = z.object({
      notify: z.string().optional().transform(val => val === "true"),
    });
    const paramsSchema = z.object({
      id: z.string().min(1),
    });

    describe("✅ Cenários de Sucesso", () => {
      it("deve validar todos os schemas simultaneamente", () => {
        // Arrange
        mockReq.params = { id: "order-123" };
        mockReq.query = { notify: "true" };
        mockReq.body = { status: "confirmed" };
        const middleware = validate({
          body: bodySchema,
          query: querySchema,
          params: paramsSchema,
        });

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
        expect(mockReq.body.status).toBe("confirmed");
        expect((mockReq as any).validatedQuery.notify).toBe(true);
        expect((mockReq as any).validatedParams.id).toBe("order-123");
      });

      it("deve funcionar com apenas body schema", () => {
        // Arrange
        mockReq.body = { status: "cancelled", reason: "User requested" };
        const middleware = validate({ body: bodySchema });

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
        expect(mockReq.body.status).toBe("cancelled");
      });

      it("deve funcionar com apenas query schema", () => {
        // Arrange
        mockReq.query = { notify: "false" };
        const middleware = validate({ query: querySchema });

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
        expect((mockReq as any).validatedQuery.notify).toBe(false);
      });

      it("deve funcionar com apenas params schema", () => {
        // Arrange
        mockReq.params = { id: "test-id" };
        const middleware = validate({ params: paramsSchema });

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
        expect((mockReq as any).validatedParams.id).toBe("test-id");
      });

      it("deve funcionar sem nenhum schema (passthrough)", () => {
        // Arrange
        mockReq.body = { anything: "value" };
        const middleware = validate({});

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
      });
    });

    describe("❌ Cenários de Erro", () => {
      it("deve retornar erro se params inválido (validado primeiro)", () => {
        // Arrange
        mockReq.params = {}; // id faltando
        mockReq.body = { status: "confirmed" };
        const middleware = validate({
          body: bodySchema,
          params: paramsSchema,
        });

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.message).toContain("Path parameters");
      });

      it("deve retornar erro se query inválido", () => {
        // Arrange
        const strictQuerySchema = z.object({
          page: z.string().regex(/^\d+$/),
        });
        mockReq.params = { id: "test" };
        mockReq.query = { page: "not-a-number" };
        const middleware = validate({
          query: strictQuerySchema,
          params: paramsSchema,
        });

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.message).toContain("Query parameters");
      });

      it("deve retornar erro se body inválido", () => {
        // Arrange
        mockReq.params = { id: "test" };
        mockReq.query = { notify: "true" };
        mockReq.body = { status: "invalid-status" }; // enum inválido
        const middleware = validate({
          body: bodySchema,
          query: querySchema,
          params: paramsSchema,
        });

        // Act
        middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.message).toContain("Request body");
      });
    });
  });

  describe("formatZodErrors (internal)", () => {
    it("deve formatar campos aninhados corretamente", () => {
      // Arrange
      const NestedSchema = z.object({
        address: z.object({
          city: z.string().min(2),
          zipCode: z.string().regex(/^\d{5}-\d{3}$/),
        }),
      });
      mockReq.body = {
        address: {
          city: "A", // muito curto
          zipCode: "invalid",
        },
      };
      const middleware = validateBody(NestedSchema);

      // Act
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
      const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
      expect(error.details).toContainEqual(expect.objectContaining({
        field: "address.city",
      }));
      expect(error.details).toContainEqual(expect.objectContaining({
        field: "address.zipCode",
      }));
    });

    it("deve incluir código do erro Zod", () => {
      // Arrange
      const TypeSchema = z.object({
        count: z.number(),
      });
      mockReq.body = { count: "not-a-number" };
      const middleware = validateBody(TypeSchema);

      // Act
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
      const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
      expect(error.details?.[0]).toHaveProperty("code");
    });

    it("deve formatar arrays de erros", () => {
      // Arrange
      const ArraySchema = z.object({
        items: z.array(z.string().min(1)),
      });
      mockReq.body = { items: ["valid", ""] }; // segundo item inválido
      const middleware = validateBody(ArraySchema);

      // Act
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
      const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
      expect(error.details?.[0].field).toContain("items");
    });
  });
});
