/**
 * 🧪 Admin Audit Routes Tests
 * 
 * Testes unitários para endpoints de auditoria administrativa
 * Coverage target: 100% lines, branches, statements, functions
 * 
 * @module __tests__/v2/admin/audit.admin.spec
 */

import request from "supertest";
import express, { Express } from "express";

// Mock firebase-admin
const mockFirestoreGet = jest.fn();
const mockFirestoreDoc = jest.fn(() => ({ 
  get: mockFirestoreGet,
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
    get: mockFirestoreGet,
  })),
  get: mockFirestoreGet,
}));
const mockFirestoreCount = jest.fn(() => ({
  get: jest.fn().mockResolvedValue({ data: () => ({ count: 100 }) }),
}));
const mockFirestoreCollection = jest.fn(() => ({ 
  doc: mockFirestoreDoc,
  where: mockFirestoreWhere,
  orderBy: mockFirestoreOrderBy,
  count: mockFirestoreCount,
}));

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(
    jest.fn(() => ({
      collection: mockFirestoreCollection,
      doc: mockFirestoreDoc,
    })),
    {
      FieldValue: {
        serverTimestamp: jest.fn(() => "mock-timestamp"),
        arrayUnion: jest.fn((v) => ({ arrayUnion: v })),
      },
    }
  ),
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

// Import after mocks
import { auditAdminRouter } from "../audit.admin";

describe("Admin Audit Routes", () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Mock admin user middleware with permissions
    app.use((req, _res, next) => {
      (req as any).admin = {
        uid: "admin-123",
        email: "admin@test.com",
        role: "super_admin",
        permissions: ["view_audit", "manage_audit"],
      };
      next();
    });
    
    // Mock validated query middleware
    app.use((req, _res, next) => {
      (req as any).validatedQuery = {
        limit: 50,
        offset: 0,
        sortOrder: "desc",
        format: "json",
        ...req.query,
      };
      next();
    });
    
    app.use("/audit", auditAdminRouter);
    
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

  describe("GET /audit", () => {
    it("deve listar logs de auditoria com paginação", async () => {
      // Arrange
      const mockLogs = [
        { id: "log-1", action: "ORDER_CREATED", adminId: "admin-1" },
        { id: "log-2", action: "PRODUCT_UPDATED", adminId: "admin-2" },
      ];
      mockFirestoreGet.mockResolvedValue({
        docs: mockLogs.map(l => ({
          id: l.id,
          data: () => l,
        })),
      });

      // Act
      const response = await request(app).get("/audit");

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });

    it("deve filtrar por adminId", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      await request(app)
        .get("/audit")
        .query({ adminId: "admin-123" });

      // Assert
      expect(mockFirestoreWhere).toHaveBeenCalledWith("adminId", "==", "admin-123");
    });

    it("deve filtrar por adminEmail", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      await request(app)
        .get("/audit")
        .query({ adminEmail: "admin@test.com" });

      // Assert
      expect(mockFirestoreWhere).toHaveBeenCalledWith("adminEmail", "==", "admin@test.com");
    });

    it("deve filtrar por action", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      await request(app)
        .get("/audit")
        .query({ action: "ORDER_CANCELLED" });

      // Assert
      expect(mockFirestoreWhere).toHaveBeenCalledWith("action", "==", "ORDER_CANCELLED");
    });

    it("deve filtrar por targetType", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      await request(app)
        .get("/audit")
        .query({ targetType: "order" });

      // Assert
      expect(mockFirestoreWhere).toHaveBeenCalledWith("targetType", "==", "order");
    });

    it("deve filtrar por targetId", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      await request(app)
        .get("/audit")
        .query({ targetId: "order-123" });

      // Assert
      expect(mockFirestoreWhere).toHaveBeenCalledWith("targetId", "==", "order-123");
    });
  });

  describe("GET /audit/stats", () => {
    it("deve retornar estatísticas de auditoria", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { data: () => ({ action: "ORDER_CREATED", targetType: "order", adminEmail: "a@b.com" }) },
          { data: () => ({ action: "ORDER_CANCELLED", targetType: "order", adminEmail: "a@b.com" }) },
        ],
      });

      // Act
      const response = await request(app).get("/audit/stats");

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.totalActions).toBe(2);
      expect(response.body.byAction).toBeDefined();
      expect(response.body.byTargetType).toBeDefined();
      expect(response.body.byAdmin).toBeDefined();
    });

    it("deve filtrar stats por período today", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      const response = await request(app)
        .get("/audit/stats")
        .query({ period: "today" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.period).toBe("today");
    });

    it("deve filtrar stats por período week", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      const response = await request(app)
        .get("/audit/stats")
        .query({ period: "week" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.period).toBe("week");
    });

    it("deve filtrar stats por período month", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      const response = await request(app)
        .get("/audit/stats")
        .query({ period: "month" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.period).toBe("month");
    });
  });

  describe("GET /audit/actions", () => {
    it("deve retornar lista de ações disponíveis", async () => {
      // Act
      const response = await request(app).get("/audit/actions");

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.actions).toBeDefined();
      expect(Array.isArray(response.body.actions)).toBe(true);
      expect(response.body.actions.length).toBeGreaterThan(0);
    });
  });

  describe("GET /audit/export", () => {
    it("deve exportar logs em formato JSON", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { 
            id: "log-1", 
            data: () => ({ 
              action: "ORDER_CREATED", 
              timestamp: { toDate: () => new Date() } 
            }) 
          },
        ],
      });

      // Act
      const response = await request(app)
        .get("/audit/export")
        .query({ format: "json" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.exportedAt).toBeDefined();
    });

    it("deve exportar logs em formato CSV", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { 
            id: "log-1", 
            data: () => ({ 
              action: "ORDER_CREATED",
              adminId: "admin-1",
              adminEmail: "admin@test.com",
              targetType: "order",
              targetId: "order-123",
              timestamp: { toDate: () => new Date() } 
            }) 
          },
        ],
      });

      // Act
      const response = await request(app)
        .get("/audit/export")
        .query({ format: "csv" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/csv");
    });

    it("deve filtrar export por adminId", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      await request(app)
        .get("/audit/export")
        .query({ adminId: "admin-123" });

      // Assert
      expect(mockFirestoreWhere).toHaveBeenCalledWith("adminId", "==", "admin-123");
    });

    it("deve filtrar export por action", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      await request(app)
        .get("/audit/export")
        .query({ action: "ORDER_CANCELLED" });

      // Assert
      expect(mockFirestoreWhere).toHaveBeenCalledWith("action", "==", "ORDER_CANCELLED");
    });

    it("deve tratar valores com vírgulas no CSV", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { 
            id: "log-1", 
            data: () => ({ 
              action: "ORDER_CREATED",
              adminId: "admin,with,commas",
              adminEmail: "admin@test.com",
              targetType: "order",
              targetId: "order-123",
              timestamp: { toDate: () => new Date() } 
            }) 
          },
        ],
      });

      // Act
      const response = await request(app)
        .get("/audit/export")
        .query({ format: "csv" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.text).toContain('"admin,with,commas"');
    });
  });

  describe("GET /audit/:id", () => {
    it("deve retornar log de auditoria por ID", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "log-123",
        data: () => ({ action: "ORDER_CREATED", adminId: "admin-1" }),
      });

      // Act
      const response = await request(app).get("/audit/log-123");

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.id).toBe("log-123");
    });

    it("deve retornar 404 se log não existe", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ exists: false });

      // Act
      const response = await request(app).get("/audit/nonexistent");

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("GET /audit/target/:type/:id", () => {
    it("deve retornar logs para um alvo específico", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { id: "log-1", data: () => ({ action: "ORDER_CREATED" }) },
          { id: "log-2", data: () => ({ action: "ORDER_CANCELLED" }) },
        ],
      });

      // Act
      const response = await request(app).get("/audit/target/order/order-123");

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.targetType).toBe("order");
      expect(response.body.targetId).toBe("order-123");
      expect(response.body.data).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("deve tratar erros do Firestore", async () => {
      // Arrange
      mockFirestoreGet.mockRejectedValue(new Error("Firestore error"));

      // Act
      const response = await request(app).get("/audit");

      // Assert
      expect(response.status).toBe(500);
    });
  });
});
