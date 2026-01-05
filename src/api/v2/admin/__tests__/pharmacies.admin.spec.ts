/**
 * 🧪 Admin Pharmacies Routes Tests
 * 
 * Testes unitários para endpoints administrativos de farmácias
 * Coverage target: 100% lines, branches, statements, functions
 * 
 * @module __tests__/v2/admin/pharmacies.admin.spec
 */

import request from "supertest";
import express, { Express } from "express";

// Mock firebase-admin antes de importar o router
const mockFirestoreGet = jest.fn();
const mockFirestoreSet = jest.fn();
const mockFirestoreUpdate = jest.fn();
const mockFirestoreAdd = jest.fn();
const mockFirestoreDoc = jest.fn(() => ({ 
  get: mockFirestoreGet,
  set: mockFirestoreSet,
  update: mockFirestoreUpdate,
}));
const mockFirestoreWhere = jest.fn(() => ({
  where: mockFirestoreWhere,
  orderBy: jest.fn(() => ({
    limit: jest.fn(() => ({
      offset: jest.fn(() => ({
        get: mockFirestoreGet,
      })),
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
const mockFirestoreCount = jest.fn(() => ({
  get: jest.fn().mockResolvedValue({ data: () => ({ count: 50 }) }),
}));
const mockFirestoreCollection = jest.fn(() => ({ 
  doc: mockFirestoreDoc,
  where: mockFirestoreWhere,
  orderBy: mockFirestoreOrderBy,
  count: mockFirestoreCount,
  add: mockFirestoreAdd,
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
    PHARMACY_APPROVED: "pharmacy.approved",
    PHARMACY_SUSPENDED: "pharmacy.suspended",
    PHARMACY_REJECTED: "pharmacy.rejected",
  },
}));

// Import after mocks
import { pharmaciesAdminRouter } from "../pharmacies.admin";

describe("Admin Pharmacies Routes", () => {
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
        permissions: ["manage_pharmacies", "view_pharmacies"],
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
    
    app.use("/pharmacies", pharmaciesAdminRouter);
    
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

  describe("GET /pharmacies", () => {
    it("deve listar farmácias com paginação", async () => {
      // Arrange
      const mockPharmacies = [
        { id: "pharm-1", name: "Farmácia A", status: "active" },
        { id: "pharm-2", name: "Farmácia B", status: "pending" },
      ];
      mockFirestoreGet.mockResolvedValue({
        docs: mockPharmacies.map(p => ({
          id: p.id,
          data: () => p,
        })),
      });

      // Act
      const response = await request(app).get("/pharmacies");

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });

    it("deve filtrar por status", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      const response = await request(app)
        .get("/pharmacies")
        .query({ status: "pending" });

      // Assert
      expect(response.status).toBe(200);
      expect(mockFirestoreWhere).toHaveBeenCalledWith("status", "==", "pending");
    });

    it("deve filtrar por cidade", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      await request(app)
        .get("/pharmacies")
        .query({ city: "São Paulo" });

      // Assert
      expect(mockFirestoreWhere).toHaveBeenCalledWith("address.city", "==", "São Paulo");
    });

    it("deve filtrar por estado", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      await request(app)
        .get("/pharmacies")
        .query({ state: "SP" });

      // Assert
      expect(mockFirestoreWhere).toHaveBeenCalledWith("address.state", "==", "SP");
    });

    it("deve aplicar busca textual client-side", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { id: "p1", data: () => ({ name: "Farmácia Central", cnpj: "12345", email: "a@b.com" }) },
          { id: "p2", data: () => ({ name: "Drogaria Norte", cnpj: "67890", email: "c@d.com" }) },
        ],
      });

      // Act
      const response = await request(app)
        .get("/pharmacies")
        .query({ q: "central" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe("Farmácia Central");
    });
  });

  describe("GET /pharmacies/pending", () => {
    it("deve listar farmácias pendentes", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { id: "p1", data: () => ({ name: "Pendente 1", status: "pending" }) },
        ],
      });

      // Act
      const response = await request(app).get("/pharmacies/pending");

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });
  });

  describe("GET /pharmacies/stats", () => {
    it("deve retornar estatísticas", async () => {
      // Act
      const response = await request(app).get("/pharmacies/stats");

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.total).toBeDefined();
    });
  });

  describe("GET /pharmacies/:id", () => {
    it("deve retornar 404 se farmácia não existe", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ exists: false });

      // Act
      const response = await request(app).get("/pharmacies/nonexistent");

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("POST /pharmacies/:id/approve", () => {
    it("deve aprovar farmácia pendente", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "pharm-123",
        data: () => ({ name: "Farmácia Teste", status: "pending" }),
      });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .post("/pharmacies/pharm-123/approve")
        .send({ notes: "Documentação verificada" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockFirestoreUpdate).toHaveBeenCalled();
    });

    it("deve retornar 400 se farmácia já está aprovada", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "pharm-123",
        data: () => ({ name: "Farmácia Teste", status: "active" }),
      });

      // Act
      const response = await request(app)
        .post("/pharmacies/pharm-123/approve")
        .send({});

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("ALREADY_APPROVED");
    });

    it("deve retornar 404 se farmácia não existe", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ exists: false });

      // Act
      const response = await request(app)
        .post("/pharmacies/nonexistent/approve")
        .send({});

      // Assert
      expect(response.status).toBe(404);
    });
  });

  describe("POST /pharmacies/:id/suspend", () => {
    it("deve suspender farmácia ativa", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "pharm-123",
        data: () => ({ name: "Farmácia Teste", status: "active" }),
      });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .post("/pharmacies/pharm-123/suspend")
        .send({ 
          reason: "Violação dos termos de uso do marketplace",
          duration: "temporary",
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("deve suspender farmácia permanentemente", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "pharm-123",
        data: () => ({ name: "Farmácia Teste", status: "active" }),
      });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .post("/pharmacies/pharm-123/suspend")
        .send({ 
          reason: "Múltiplas violações graves dos termos",
          duration: "permanent",
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.duration).toBe("permanent");
    });

    it("deve retornar 400 se farmácia já está suspensa", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "pharm-123",
        data: () => ({ name: "Farmácia Teste", status: "suspended" }),
      });

      // Act
      const response = await request(app)
        .post("/pharmacies/pharm-123/suspend")
        .send({ 
          reason: "Teste de suspensão de farmácia",
          duration: "temporary",
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("ALREADY_SUSPENDED");
    });

    it("deve retornar 400 se reason não fornecido", async () => {
      // Act
      const response = await request(app)
        .post("/pharmacies/pharm-123/suspend")
        .send({ duration: "temporary" });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("deve retornar 404 se farmácia não existe", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ exists: false });

      // Act
      const response = await request(app)
        .post("/pharmacies/nonexistent/suspend")
        .send({ 
          reason: "Teste de suspensão de farmácia",
          duration: "temporary",
        });

      // Assert
      expect(response.status).toBe(404);
    });
  });

  describe("POST /pharmacies/:id/reject", () => {
    it("deve rejeitar farmácia pendente", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "pharm-123",
        data: () => ({ name: "Farmácia Teste", status: "pending" }),
      });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .post("/pharmacies/pharm-123/reject")
        .send({ 
          reason: "Documentação incompleta ou inválida",
          canReapply: true,
          reapplyAfterDays: 30,
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("deve retornar 400 se farmácia não está pendente", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "pharm-123",
        data: () => ({ name: "Farmácia Teste", status: "active" }),
      });

      // Act
      const response = await request(app)
        .post("/pharmacies/pharm-123/reject")
        .send({ 
          reason: "Documentação incompleta ou inválida",
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_STATUS");
    });

    it("deve retornar 400 se reason muito curto", async () => {
      // Act
      const response = await request(app)
        .post("/pharmacies/pharm-123/reject")
        .send({ reason: "Curto" });

      // Assert
      expect(response.status).toBe(400);
    });

    it("deve retornar 404 se farmácia não existe", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ exists: false });

      // Act
      const response = await request(app)
        .post("/pharmacies/nonexistent/reject")
        .send({ 
          reason: "Documentação incompleta ou inválida",
        });

      // Assert
      expect(response.status).toBe(404);
    });
  });

  describe("POST /pharmacies/:id/reactivate", () => {
    it("deve reativar farmácia suspensa", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "pharm-123",
        data: () => ({ name: "Farmácia Teste", status: "suspended" }),
      });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .post("/pharmacies/pharm-123/reactivate")
        .send({ notes: "Situação regularizada" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("deve retornar 400 se farmácia não está suspensa", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "pharm-123",
        data: () => ({ name: "Farmácia Teste", status: "active" }),
      });

      // Act
      const response = await request(app)
        .post("/pharmacies/pharm-123/reactivate")
        .send({});

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_STATUS");
    });

    it("deve retornar 404 se farmácia não existe", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ exists: false });

      // Act
      const response = await request(app)
        .post("/pharmacies/nonexistent/reactivate")
        .send({});

      // Assert
      expect(response.status).toBe(404);
    });
  });

  describe("Error Handling", () => {
    it("deve tratar erros do Firestore", async () => {
      // Arrange
      mockFirestoreGet.mockRejectedValue(new Error("Firestore error"));

      // Act
      const response = await request(app).get("/pharmacies");

      // Assert
      expect(response.status).toBe(500);
    });
  });
});
