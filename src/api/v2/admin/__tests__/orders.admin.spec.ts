/**
 * 🧪 Admin Orders Routes Tests
 * 
 * Testes unitários para endpoints administrativos de pedidos
 * Coverage target: 100% lines, branches, statements, functions
 * 
 * @module __tests__/v2/admin/orders.admin.spec
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
  })),
  get: mockFirestoreGet,
}));
const mockFirestoreCount = jest.fn(() => ({
  get: jest.fn().mockResolvedValue({ data: () => ({ count: 100 }) }),
}));
const mockFirestoreCollection = jest.fn(() => ({ 
  doc: mockFirestoreDoc,
  where: mockFirestoreWhere,
  orderBy: jest.fn(() => ({
    limit: jest.fn(() => ({
      offset: jest.fn(() => ({
        get: mockFirestoreGet,
      })),
    })),
  })),
  count: mockFirestoreCount,
  add: mockFirestoreAdd,
}));
const mockFirestoreBatch = jest.fn(() => ({
  set: jest.fn(),
  update: jest.fn(),
  commit: jest.fn().mockResolvedValue(undefined),
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
    ORDER_STATUS_CHANGED: "order.status.changed",
    ORDER_CANCELLED: "order.cancelled",
    REFUND_PROCESSED: "refund.processed",
  },
}));

// Import after mocks
import { ordersAdminRouter } from "../orders.admin";

describe("Admin Orders Routes", () => {
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
        permissions: ["manage_orders", "view_orders"],
      };
      next();
    });
    
    app.use("/orders", ordersAdminRouter);
    
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

  describe("GET /orders", () => {
    it("deve listar pedidos com paginação", async () => {
      // Arrange
      const mockOrders = [
        { id: "order-1", status: "pending", total: 100 },
        { id: "order-2", status: "confirmed", total: 200 },
      ];
      mockFirestoreGet.mockResolvedValue({
        docs: mockOrders.map(o => ({
          id: o.id,
          data: () => o,
        })),
      });

      // Act
      const response = await request(app)
        .get("/orders")
        .query({ limit: 10, offset: 0 });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toBeDefined();
    });

    it("deve filtrar pedidos por status", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [{ id: "order-1", data: () => ({ status: "pending" }) }],
      });

      // Act
      const response = await request(app)
        .get("/orders")
        .query({ status: "pending" });

      // Assert
      expect(response.status).toBe(200);
      expect(mockFirestoreWhere).toHaveBeenCalledWith("status", "==", "pending");
    });

    it("deve filtrar pedidos por customerId", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      await request(app)
        .get("/orders")
        .query({ customerId: "customer-123" });

      // Assert
      expect(mockFirestoreWhere).toHaveBeenCalledWith("customerId", "==", "customer-123");
    });

    it("deve filtrar pedidos por pharmacyId", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      await request(app)
        .get("/orders")
        .query({ pharmacyId: "pharmacy-456" });

      // Assert
      expect(mockFirestoreWhere).toHaveBeenCalledWith("pharmacyId", "==", "pharmacy-456");
    });

    it("deve filtrar pedidos por range de total", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { id: "o1", data: () => ({ total: 50 }) },
          { id: "o2", data: () => ({ total: 150 }) },
          { id: "o3", data: () => ({ total: 250 }) },
        ],
      });

      // Act
      const response = await request(app)
        .get("/orders")
        .query({ minTotal: 100, maxTotal: 200 });

      // Assert
      expect(response.status).toBe(200);
      // Filtro client-side deve remover pedidos fora do range
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].total).toBe(150);
    });
  });

  describe("GET /orders/stats", () => {
    it("deve retornar estatísticas de pedidos", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        docs: [
          { data: () => ({ status: "pending", paymentStatus: "pending", total: 100 }) },
          { data: () => ({ status: "confirmed", paymentStatus: "paid", total: 200 }) },
        ],
      });

      // Act
      const response = await request(app).get("/orders/stats");

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.totalOrders).toBe(2);
      expect(response.body.totalRevenue).toBe(300);
    });

    it("deve filtrar stats por período week", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      const response = await request(app)
        .get("/orders/stats")
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
        .get("/orders/stats")
        .query({ period: "month" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.period).toBe("month");
    });

    it("deve filtrar stats por período year", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ docs: [] });

      // Act
      const response = await request(app)
        .get("/orders/stats")
        .query({ period: "year" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.period).toBe("year");
    });
  });

  describe("GET /orders/:id", () => {
    it("deve retornar pedido por ID", async () => {
      // Arrange
      const mockOrder = {
        status: "pending",
        total: 150.50,
        customerId: "customer-1",
        pharmacyId: "pharmacy-1",
        items: [{ productId: "p1", quantity: 2 }],
      };
      
      // First call: get order
      // Second call: get customer
      // Third call: get pharmacy
      mockFirestoreGet
        .mockResolvedValueOnce({
          exists: true,
          id: "order-123",
          data: () => mockOrder,
        })
        .mockResolvedValueOnce({
          exists: true,
          id: "customer-1",
          data: () => ({ name: "John Doe" }),
        })
        .mockResolvedValueOnce({
          exists: true,
          id: "pharmacy-1",
          data: () => ({ name: "Pharmacy 1" }),
        });

      // Act
      const response = await request(app).get("/orders/order-123");

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.id).toBe("order-123");
      expect(response.body.customer).toBeDefined();
      expect(response.body.pharmacy).toBeDefined();
    });

    it("deve retornar 404 se pedido não existe", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ exists: false });

      // Act
      const response = await request(app).get("/orders/nonexistent");

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PATCH /orders/:id/status", () => {
    it("deve atualizar status do pedido", async () => {
      // Arrange
      const mockOrder = { 
        status: "pending", 
        customerId: "c1",
        pharmacyId: "p1",
      };
      mockFirestoreGet
        .mockResolvedValueOnce({
          exists: true,
          id: "order-123",
          data: () => mockOrder,
        })
        .mockResolvedValueOnce({
          exists: true,
          id: "order-123",
          data: () => ({ ...mockOrder, status: "confirmed" }),
        });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .patch("/orders/order-123/status")
        .send({ status: "confirmed" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockFirestoreUpdate).toHaveBeenCalled();
    });

    it("deve retornar 400 se status inválido", async () => {
      // Act
      const response = await request(app)
        .patch("/orders/order-123/status")
        .send({ status: "invalid-status" });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("deve retornar 404 se pedido não existe", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ exists: false });

      // Act
      const response = await request(app)
        .patch("/orders/nonexistent/status")
        .send({ status: "confirmed" });

      // Assert
      expect(response.status).toBe(404);
    });

    it("deve incluir trackingCode na atualização se fornecido", async () => {
      // Arrange
      mockFirestoreGet
        .mockResolvedValueOnce({
          exists: true,
          id: "order-123",
          data: () => ({ status: "confirmed" }),
        })
        .mockResolvedValueOnce({
          exists: true,
          id: "order-123",
          data: () => ({ status: "shipped", trackingCode: "TRACK123" }),
        });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .patch("/orders/order-123/status")
        .send({ status: "shipped", trackingCode: "TRACK123" });

      // Assert
      expect(response.status).toBe(200);
    });
  });

  describe("POST /orders/:id/cancel", () => {
    it("deve cancelar pedido com motivo", async () => {
      // Arrange
      const mockOrder = {
        status: "pending",
        customerId: "c1",
        pharmacyId: "p1",
        items: [{ productId: "p1", quantity: 2 }],
      };
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "order-123",
        data: () => mockOrder,
      });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .post("/orders/order-123/cancel")
        .send({ reason: "Customer request" });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("deve retornar 400 se reason não fornecido", async () => {
      // Act
      const response = await request(app)
        .post("/orders/order-123/cancel")
        .send({});

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("deve retornar 400 se pedido já está cancelado", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "order-123",
        data: () => ({ status: "cancelled" }),
      });

      // Act
      const response = await request(app)
        .post("/orders/order-123/cancel")
        .send({ reason: "Testing cancellation" });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("ALREADY_CANCELLED");
    });

    it("deve retornar 400 se pedido já foi entregue", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "order-123",
        data: () => ({ status: "delivered" }),
      });

      // Act
      const response = await request(app)
        .post("/orders/order-123/cancel")
        .send({ reason: "Testing cancellation" });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("CANNOT_CANCEL");
    });

    it("deve retornar 404 se pedido não existe", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ exists: false });

      // Act
      const response = await request(app)
        .post("/orders/nonexistent/cancel")
        .send({ reason: "Testing cancellation" });

      // Assert
      expect(response.status).toBe(404);
    });
  });

  describe("POST /orders/:id/refund", () => {
    it("deve processar reembolso total", async () => {
      // Arrange
      const mockOrder = {
        status: "delivered",
        paymentStatus: "paid",
        total: 150,
        customerId: "c1",
        pharmacyId: "p1",
      };
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "order-123",
        data: () => mockOrder,
      });
      mockFirestoreAdd.mockResolvedValue({ id: "refund-123" });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .post("/orders/order-123/refund")
        .send({ reason: "Damaged item - need refund for customer satisfaction", refundMethod: "original_payment" });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.refund).toBeDefined();
    });

    it("deve processar reembolso parcial", async () => {
      // Arrange
      const mockOrder = {
        status: "delivered",
        paymentStatus: "paid",
        total: 150,
        customerId: "c1",
        pharmacyId: "p1",
      };
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "order-123",
        data: () => mockOrder,
      });
      mockFirestoreAdd.mockResolvedValue({ id: "refund-123" });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      // Act
      const response = await request(app)
        .post("/orders/order-123/refund")
        .send({ 
          reason: "Partial refund requested by customer", 
          refundMethod: "store_credit",
          amount: 50,
        });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.refund.amount).toBe(50);
      expect(response.body.refund.isPartialRefund).toBe(true);
    });

    it("deve retornar 400 se pedido não foi pago", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "order-123",
        data: () => ({ status: "pending", paymentStatus: "pending", total: 100 }),
      });

      // Act
      const response = await request(app)
        .post("/orders/order-123/refund")
        .send({ reason: "Test refund reason that is long enough", refundMethod: "original_payment" });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("CANNOT_REFUND");
    });

    it("deve retornar 404 se pedido não existe", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({ exists: false });

      // Act
      const response = await request(app)
        .post("/orders/nonexistent/refund")
        .send({ reason: "Test refund reason that is long enough", refundMethod: "original_payment" });

      // Assert
      expect(response.status).toBe(404);
    });

    it("deve retornar 400 se reason não fornecido", async () => {
      // Act
      const response = await request(app)
        .post("/orders/order-123/refund")
        .send({ refundMethod: "original_payment" });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Error Handling", () => {
    it("deve tratar erros do Firestore", async () => {
      // Arrange
      mockFirestoreGet.mockRejectedValue(new Error("Firestore error"));

      // Act
      const response = await request(app).get("/orders");

      // Assert
      expect(response.status).toBe(500);
    });

    it("deve tratar erros de update", async () => {
      // Arrange
      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: "order-123",
        data: () => ({ status: "pending" }),
      });
      mockFirestoreUpdate.mockRejectedValue(new Error("Update failed"));

      // Act
      const response = await request(app)
        .patch("/orders/order-123/status")
        .send({ status: "confirmed" });

      // Assert
      expect(response.status).toBe(500);
    });
  });
});
