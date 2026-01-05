/**
 * 🧪 Admin Products Routes Tests
 * 
 * Testes unitários para endpoints administrativos de produtos
 * Coverage target: 100% lines, branches, statements, functions
 * 
 * @module __tests__/v2/admin/products.admin.spec
 */

import request from "supertest";
import express, { Express } from "express";

// Mock firebase-admin antes de importar o router
const mockFirestoreGet = jest.fn();
const mockFirestoreSet = jest.fn();
const mockFirestoreUpdate = jest.fn();
const mockFirestoreDelete = jest.fn();
const mockFirestoreDoc = jest.fn(() => ({ 
  get: mockFirestoreGet,
  set: mockFirestoreSet,
  update: mockFirestoreUpdate,
  delete: mockFirestoreDelete,
}));
const mockFirestoreWhere = jest.fn(() => ({
  where: mockFirestoreWhere,
  orderBy: jest.fn(() => ({
    limit: jest.fn(() => ({
      offset: jest.fn(() => ({
        get: mockFirestoreGet,
      })),
      get: mockFirestoreGet,
    })),
    get: mockFirestoreGet,
  })),
  count: jest.fn(() => ({
    get: jest.fn().mockResolvedValue({ data: () => ({ count: 10 }) }),
  })),
  get: mockFirestoreGet,
  limit: jest.fn(() => ({
    offset: jest.fn(() => ({
      get: mockFirestoreGet,
    })),
    get: mockFirestoreGet,
  })),
}));
const mockFirestoreOrderBy = jest.fn(() => ({
  limit: jest.fn(() => ({
    offset: jest.fn(() => ({
      get: mockFirestoreGet,
    })),
  })),
  get: mockFirestoreGet,
}));
const mockFirestoreSelect = jest.fn(() => ({
  get: mockFirestoreGet,
}));
const mockFirestoreCount = jest.fn(() => ({
  get: jest.fn().mockResolvedValue({ data: () => ({ count: 100 }) }),
}));
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
const mockBatchUpdate = jest.fn();
const mockFirestoreBatch = jest.fn(() => ({
  update: mockBatchUpdate,
  commit: mockBatchCommit,
}));
const mockFirestoreCollection = jest.fn(() => ({ 
  doc: mockFirestoreDoc,
  where: mockFirestoreWhere,
  orderBy: mockFirestoreOrderBy,
  count: mockFirestoreCount,
  select: mockFirestoreSelect,
}));

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(
    jest.fn(() => ({
      collection: mockFirestoreCollection,
      doc: mockFirestoreDoc,
      batch: mockFirestoreBatch,
    })),
    {
      FieldValue: {
        serverTimestamp: jest.fn(() => "mock-timestamp"),
        arrayUnion: jest.fn((v) => ({ arrayUnion: v })),
        increment: jest.fn((v) => ({ increment: v })),
      },
    }
  ),
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

// Mock AuditService
jest.mock("../../../services/audit.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({
    log: jest.fn().mockResolvedValue(undefined),
  })),
  AuditAction: {
    PRODUCT_UPDATED: "product.updated",
    PRODUCT_DELETED: "product.deleted",
  },
}));

// Import after mocks
import { productsAdminRouter } from "../products.admin";

describe("Admin Products Routes", () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Mock admin user middleware
    app.use((req, _res, next) => {
      (req as any).admin = {
        uid: "admin-123",
        email: "admin@test.com",
        role: "admin",
        permissions: ["manage_products", "view_products"],
      };
      next();
    });
    
    // Mock validated query middleware
    app.use((req, _res, next) => {
      (req as any).validatedQuery = {
        limit: 20,
        offset: 0,
        sortBy: "createdAt",
        sortOrder: "desc",
        ...req.query,
      };
      next();
    });
    
    app.use("/products", productsAdminRouter);
    
    // Error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode || 500).json({
        error: {
          code: err.code || "INTERNAL_ERROR",
          message: err.message,
          details: err.details,
        },
      });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /products", () => {
    it("deve listar produtos com paginação", async () => {
      // Arrange
      const mockProducts = [
        { id: "prod-1", name: "Produto A", price: 10.99 },
        { id: "prod-2", name: "Produto B", price: 20.99 },
      ];
      mockFirestoreGet.mockResolvedValue({
        docs: mockProducts.map(p => ({
          id: p.id,
          data: () => p,
        })),
      });

      // Act
      const response = await request(app).get("/products");

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });

    it("deve filtrar por categoria", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      await request(app)
        .get("/products")
        .query({ category: "analgesics" });

      // Assert
      expect(mockFirestoreWhere).toHaveBeenCalledWith("category", "==", "analgesics");
    });

    it("deve filtrar por pharmacyId", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      await request(app)
        .get("/products")
        .query({ pharmacyId: "pharm-123" });

      // Assert
      expect(mockFirestoreWhere).toHaveBeenCalledWith("pharmacyId", "==", "pharm-123");
    });

    it("deve aplicar busca textual client-side", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { id: "p1", data: () => ({ name: "Paracetamol 500mg", price: 5.99 }) },
          { id: "p2", data: () => ({ name: "Ibuprofeno 400mg", price: 8.99 }) },
        ],
      });

      // Act
      const response = await request(app)
        .get("/products")
        .query({ q: "paracetamol" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe("Paracetamol 500mg");
    });

    it("deve filtrar por range de preço", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { id: "p1", data: () => ({ name: "Barato", price: 5 }) },
          { id: "p2", data: () => ({ name: "Médio", price: 15 }) },
          { id: "p3", data: () => ({ name: "Caro", price: 50 }) },
        ],
      });

      // Act
      const response = await request(app)
        .get("/products")
        .query({ minPrice: 10, maxPrice: 20 });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe("Médio");
    });

    it("deve filtrar por fabricante", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { id: "p1", data: () => ({ name: "Produto 1", manufacturer: "Lab A" }) },
          { id: "p2", data: () => ({ name: "Produto 2", manufacturer: "Lab B" }) },
        ],
      });

      // Act
      const response = await request(app)
        .get("/products")
        .query({ manufacturer: "Lab A" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe("GET /products/stats", () => {
    it("deve retornar estatísticas", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { data: () => ({ category: "analgesics" }) },
          { data: () => ({ category: "vitamins" }) },
        ],
      });

      // Act
      const response = await request(app).get("/products/stats");

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.total).toBeDefined();
      expect(response.body.byCategory).toBeDefined();
    });
  });

  describe("GET /products/low-stock", () => {
    it("deve listar produtos com estoque baixo", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { id: "p1", data: () => ({ name: "Produto 1", stock: 5 }) },
          { id: "p2", data: () => ({ name: "Produto 2", stock: 8 }) },
        ],
      });

      // Act
      const response = await request(app)
        .get("/products/low-stock")
        .query({ threshold: 10 });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.threshold).toBe(10);
    });
  });

  describe("GET /products/:id", () => {
    it("deve retornar 404 se produto não existe", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ exists: false });

      // Act
      const response = await request(app).get("/products/nonexistent");

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PATCH /products/:id", () => {
    it("deve atualizar produto", async () => {
      // Arrange
      mockFirestoreGet
        .mockResolvedValueOnce({
          exists: true,
          id: "prod-123",
          data: () => ({ name: "Produto Original", price: 10.99 }),
        })
        .mockResolvedValueOnce({
          exists: true,
          id: "prod-123",
          data: () => ({ name: "Produto Atualizado", price: 15.99 }),
        });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .patch("/products/prod-123")
        .send({ price: 15.99 });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockFirestoreUpdate).toHaveBeenCalled();
    });

    it("deve retornar 404 se produto não existe", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ exists: false });

      // Act
      const response = await request(app)
        .patch("/products/nonexistent")
        .send({ price: 10 });

      // Assert
      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /products/bulk", () => {
    it("deve atualizar múltiplos produtos", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "prod-123",
        data: () => ({ name: "Produto", price: 10 }),
      });

      // Act
      const response = await request(app)
        .patch("/products/bulk")
        .send({
          productIds: ["prod-1", "prod-2"],
          updates: { price: 19.99 },
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.summary).toBeDefined();
    });

    it("deve reportar produtos não encontrados", async () => {
      // Arrange
      mockFirestoreGet
        .mockResolvedValueOnce({ exists: true, data: () => ({}) })
        .mockResolvedValueOnce({ exists: false });

      // Act
      const response = await request(app)
        .patch("/products/bulk")
        .send({
          productIds: ["exists", "not-exists"],
          updates: { price: 10.99 },
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.results).toBeDefined();
      expect(response.body.summary.failed).toBe(1);
    });

    it("deve retornar 400 se updates vazio", async () => {
      // Act
      const response = await request(app)
        .patch("/products/bulk")
        .send({
          productIds: ["prod-1"],
          updates: {},
        });

      // Assert
      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /products/:id", () => {
    it("deve soft-delete produto", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "prod-123",
        data: () => ({ name: "Produto", pharmacyId: "pharm-1" }),
      });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      // Act
      const response = await request(app).delete("/products/prod-123");

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockFirestoreUpdate).toHaveBeenCalled();
    });

    it("deve retornar 404 se produto não existe", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ exists: false });

      // Act
      const response = await request(app).delete("/products/nonexistent");

      // Assert
      expect(response.status).toBe(404);
    });
  });

  describe("Error Handling", () => {
    it("deve tratar erros do Firestore", async () => {
      // Arrange
      mockFirestoreGet.mockRejectedValue(new Error("Firestore error"));

      // Act
      const response = await request(app).get("/products");

      // Assert
      expect(response.status).toBe(500);
    });
  });
});
