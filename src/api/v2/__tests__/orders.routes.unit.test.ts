// @ts-nocheck
/**
 * 🛒 Orders Routes v2 - Unit Tests
 * 
 * Uses global Firestore mock from setup.ts
 */

import request from "supertest";
import express, { Express } from "express";
import * as admin from "firebase-admin";
import { ordersRouter } from "../orders.routes";
import { errorHandler } from "../../middleware/error-handler";
import { clearMockData } from "../../../__tests__/setup";

// Firebase Admin mockado no setup.ts global
const db = admin.firestore();

describe("🛒 Orders Routes v2 - Unit Tests", () => {
  let app: Express;
  const testPartnerId = "test-partner-orders-v2";
  const testCustomerId = "test-customer-123";
  const testPharmacyId = "test-pharmacy-123";

  beforeEach(async () => {
    clearMockData();
    
    // Setup test app
    app = express();
    app.use(express.json());
    
    // Mock partner authentication
    app.use((req, res, next) => {
      (req as any).partnerId = testPartnerId;
      next();
    });
    
    app.use("/v2/orders", ordersRouter);
    app.use(errorHandler);
    
    // Seed pharmacy
    await db.collection("pharmacies").doc(testPharmacyId).set({
      name: "Farmácia Teste",
      status: "active",
      shippingCost: 10,
      freeShipping: true,
      freeShippingMinValue: 50,
      partnerId: testPartnerId,
    });
    
    // Seed product
    await db.collection("products").doc("product-123").set({
      name: "Paracetamol 500mg",
      price: 10.50,
      stock: 100,
      requiresPrescription: false,
      status: "active",
      pharmacyId: testPharmacyId,
    });
  });

  afterAll(() => {
    clearMockData();
  });

  // =========================================
  // POST /v2/orders - Create Order
  // =========================================
  describe("POST /v2/orders - Create Order", () => {
    const validOrderData = {
      customerId: "test-customer-123",
      pharmacyId: "test-pharmacy-123",
      items: [
        {
          productId: "product-123",
          quantity: 2,
          price: 10.50,
        },
      ],
      shippingAddress: {
        street: "Rua Teste",
        number: "123",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        zipCode: "01234-567",
      },
      paymentMethod: "credit_card",
    };

    it("✅ should create an order successfully", async () => {
      const response = await request(app)
        .post("/v2/orders")
        .send(validOrderData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.customerId).toBe("test-customer-123");
      expect(response.body.pharmacyId).toBe("test-pharmacy-123");
      expect(response.body.status).toBe("pending");
    });

    it("❌ should return 400 if customerId is missing", async () => {
      const response = await request(app)
        .post("/v2/orders")
        .send({
          ...validOrderData,
          customerId: undefined,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("❌ should return 400 if pharmacyId is missing", async () => {
      const response = await request(app)
        .post("/v2/orders")
        .send({
          ...validOrderData,
          pharmacyId: undefined,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("❌ should return 400 if items array is empty", async () => {
      const response = await request(app)
        .post("/v2/orders")
        .send({
          ...validOrderData,
          items: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("❌ should return 404 if pharmacy not found", async () => {
      const response = await request(app)
        .post("/v2/orders")
        .send({
          ...validOrderData,
          pharmacyId: "non-existent-pharmacy",
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("❌ should return 400 if pharmacy is inactive", async () => {
      await db.collection("pharmacies").doc("inactive-pharmacy").set({
        name: "Farmácia Inativa",
        status: "inactive",
      });

      const response = await request(app)
        .post("/v2/orders")
        .send({
          ...validOrderData,
          pharmacyId: "inactive-pharmacy",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("PHARMACY_INACTIVE");
    });

    it("❌ should return 404 if product not found", async () => {
      const response = await request(app)
        .post("/v2/orders")
        .send({
          ...validOrderData,
          items: [
            {
              productId: "non-existent-product",
              quantity: 1,
              price: 10.00,
            },
          ],
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("❌ should return 400 if product is out of stock", async () => {
      await db.collection("products").doc("low-stock-product").set({
        name: "Low Stock Product",
        price: 10.00,
        stock: 1,
        requiresPrescription: false,
        status: "active",
      });

      const response = await request(app)
        .post("/v2/orders")
        .send({
          ...validOrderData,
          items: [
            {
              productId: "low-stock-product",
              quantity: 5,
              price: 10.00,
            },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("OUT_OF_STOCK");
    });

    it("❌ should return 400 if prescription required but not provided", async () => {
      await db.collection("products").doc("prescription-product").set({
        name: "Controlled Medication",
        price: 50.00,
        stock: 100,
        requiresPrescription: true,
        status: "active",
      });

      const response = await request(app)
        .post("/v2/orders")
        .send({
          ...validOrderData,
          items: [
            {
              productId: "prescription-product",
              quantity: 1,
              price: 50.00,
            },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("PRESCRIPTION_REQUIRED");
    });

    it("✅ should accept order with valid prescription", async () => {
      await db.collection("products").doc("prescription-product").set({
        name: "Controlled Medication",
        price: 50.00,
        stock: 100,
        requiresPrescription: true,
        status: "active",
      });

      const response = await request(app)
        .post("/v2/orders")
        .send({
          ...validOrderData,
          items: [
            {
              productId: "prescription-product",
              quantity: 1,
              price: 50.00,
            },
          ],
          prescriptionId: "valid-prescription-123",
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
    });

    it("✅ should calculate shipping correctly", async () => {
      const response = await request(app)
        .post("/v2/orders")
        .send(validOrderData);

      expect(response.status).toBe(201);
      expect(response.body.subtotal).toBe(21); // 2 * 10.50
      expect(response.body.shippingCost).toBeDefined();
      expect(response.body.total).toBeGreaterThan(0);
    });

    it("✅ should apply free shipping when threshold met", async () => {
      const response = await request(app)
        .post("/v2/orders")
        .send({
          ...validOrderData,
          items: [
            {
              productId: "product-123",
              quantity: 10,
              price: 10.50,
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.subtotal).toBe(105); // 10 * 10.50
      expect(response.body.shippingCost).toBe(0); // Free shipping (>50)
    });

    // =========================================
    // Coupon Tests (Branch Coverage)
    // =========================================
    describe("Coupon Handling", () => {
      beforeEach(async () => {
        // Seed valid percentage coupon
        await db.collection("coupons").doc("PERCENT10").set({
          active: true,
          type: "percentage",
          value: 10,
          expiresAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          minValue: 20,
          maxDiscount: 50,
        });

        // Seed valid fixed coupon
        await db.collection("coupons").doc("FIXED20").set({
          active: true,
          type: "fixed",
          value: 20,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        });

        // Seed expired coupon
        await db.collection("coupons").doc("EXPIRED").set({
          active: true,
          type: "percentage",
          value: 10,
          expiresAt: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        });

        // Seed inactive coupon
        await db.collection("coupons").doc("INACTIVE").set({
          active: false,
          type: "percentage",
          value: 10,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        });
      });

      it("✅ should apply percentage coupon correctly", async () => {
        const response = await request(app)
          .post("/v2/orders")
          .send({
            ...validOrderData,
            items: [
              {
                productId: "product-123",
                quantity: 5, // 52.50 subtotal
                price: 10.50,
              },
            ],
            couponCode: "PERCENT10",
          });

        expect(response.status).toBe(201);
        expect(response.body.subtotal).toBe(52.5);
        expect(response.body.discount).toBe(5.25); // 10% of 52.50
      });

      it("✅ should apply fixed amount coupon correctly", async () => {
        const response = await request(app)
          .post("/v2/orders")
          .send({
            ...validOrderData,
            items: [
              {
                productId: "product-123",
                quantity: 5,
                price: 10.50,
              },
            ],
            couponCode: "FIXED20",
          });

        expect(response.status).toBe(201);
        expect(response.body.discount).toBe(20);
      });

      it("✅ should apply maxDiscount limit on percentage coupon", async () => {
        // Create high value percentage coupon with low max
        await db.collection("coupons").doc("HIGHPERCENT").set({
          active: true,
          type: "percentage",
          value: 50, // 50% off
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          maxDiscount: 10, // Max 10
        });

        const response = await request(app)
          .post("/v2/orders")
          .send({
            ...validOrderData,
            items: [
              {
                productId: "product-123",
                quantity: 10, // 105 subtotal
                price: 10.50,
              },
            ],
            couponCode: "HIGHPERCENT",
          });

        expect(response.status).toBe(201);
        expect(response.body.discount).toBe(10); // Limited by maxDiscount
      });

      it("❌ should reject coupon if minValue not met", async () => {
        const response = await request(app)
          .post("/v2/orders")
          .send({
            ...validOrderData,
            items: [
              {
                productId: "product-123",
                quantity: 1, // 10.50 < 20 minValue
                price: 10.50,
              },
            ],
            couponCode: "PERCENT10",
          });

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe("MIN_VALUE_NOT_MET");
      });

      it("✅ should ignore expired coupon", async () => {
        const response = await request(app)
          .post("/v2/orders")
          .send({
            ...validOrderData,
            items: [
              {
                productId: "product-123",
                quantity: 5,
                price: 10.50,
              },
            ],
            couponCode: "EXPIRED",
          });

        expect(response.status).toBe(201);
        expect(response.body.discount).toBe(0); // No discount applied
      });

      it("✅ should ignore inactive coupon", async () => {
        const response = await request(app)
          .post("/v2/orders")
          .send({
            ...validOrderData,
            items: [
              {
                productId: "product-123",
                quantity: 5,
                price: 10.50,
              },
            ],
            couponCode: "INACTIVE",
          });

        expect(response.status).toBe(201);
        expect(response.body.discount).toBe(0);
      });

      it("✅ should ignore non-existent coupon", async () => {
        const response = await request(app)
          .post("/v2/orders")
          .send({
            ...validOrderData,
            items: [
              {
                productId: "product-123",
                quantity: 5,
                price: 10.50,
              },
            ],
            couponCode: "NONEXISTENT",
          });

        expect(response.status).toBe(201);
        expect(response.body.discount).toBe(0);
      });
    });
  });

  // =========================================
  // GET /v2/orders - List Orders
  // =========================================
  describe("GET /v2/orders - List Orders", () => {
    beforeEach(async () => {
      // Seed orders
      await db.collection("orders").doc("order-1").set({
        partnerId: testPartnerId,
        customerId: testCustomerId,
        pharmacyId: testPharmacyId,
        status: "pending",
        total: 50,
        createdAt: new Date().toISOString(),
      });
      await db.collection("orders").doc("order-2").set({
        partnerId: testPartnerId,
        customerId: testCustomerId,
        pharmacyId: testPharmacyId,
        status: "completed",
        total: 100,
        createdAt: new Date().toISOString(),
      });
    });

    it("✅ should list all orders", async () => {
      const response = await request(app)
        .get("/v2/orders");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body).toHaveProperty("pagination");
    });

    it("✅ should filter orders by status", async () => {
      const response = await request(app)
        .get("/v2/orders?status=pending");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it("✅ should filter orders by customerId", async () => {
      const response = await request(app)
        .get(`/v2/orders?customerId=${testCustomerId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it("✅ should filter orders by pharmacyId", async () => {
      const response = await request(app)
        .get(`/v2/orders?pharmacyId=${testPharmacyId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it("✅ should paginate results", async () => {
      const response = await request(app)
        .get("/v2/orders?limit=1&offset=0");

      expect(response.status).toBe(200);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.limit).toBe(1);
    });

    it("✅ should filter orders by paymentStatus", async () => {
      await db.collection("orders").doc("order-paid").set({
        partnerId: testPartnerId,
        customerId: testCustomerId,
        pharmacyId: testPharmacyId,
        status: "confirmed",
        paymentStatus: "paid",
        total: 75,
        createdAt: new Date().toISOString(),
      });

      const response = await request(app)
        .get("/v2/orders?paymentStatus=paid");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it("✅ should filter orders by startDate", async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      
      const response = await request(app)
        .get(`/v2/orders?startDate=${yesterday}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it("✅ should filter orders by endDate", async () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      
      const response = await request(app)
        .get(`/v2/orders?endDate=${tomorrow}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it("✅ should filter orders by date range", async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      
      const response = await request(app)
        .get(`/v2/orders?startDate=${yesterday}&endDate=${tomorrow}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it("✅ should return empty array when no orders found", async () => {
      clearMockData();
      const response = await request(app)
        .get("/v2/orders");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(0);
    });
  });

  // =========================================
  // GET /v2/orders/:id - Get Order Details
  // =========================================
  describe("GET /v2/orders/:id - Get Order Details", () => {
    beforeEach(async () => {
      await db.collection("orders").doc("order-123").set({
        partnerId: testPartnerId,
        customerId: testCustomerId,
        pharmacyId: testPharmacyId,
        status: "pending",
        total: 50.00,
        items: [{ productId: "product-1", quantity: 2, price: 25.00 }],
        createdAt: new Date().toISOString(),
      });
    });

    it("✅ should get order details by ID", async () => {
      const response = await request(app)
        .get("/v2/orders/order-123");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("pending");
    });

    it("❌ should return 404 if order not found", async () => {
      const response = await request(app)
        .get("/v2/orders/non-existent-order");

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  // =========================================
  // PATCH /v2/orders/:id/status - Update Status
  // =========================================
  describe("PATCH /v2/orders/:id/status - Update Order Status", () => {
    beforeEach(async () => {
      await db.collection("orders").doc("order-123").set({
        partnerId: testPartnerId,
        customerId: testCustomerId,
        pharmacyId: testPharmacyId,
        status: "pending",
        statusHistory: [],
        createdAt: new Date().toISOString(),
      });
    });

    it("✅ should update order status successfully", async () => {
      const response = await request(app)
        .patch("/v2/orders/order-123/status")
        .send({ status: "processing" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("processing");
    });

    it("✅ should track status history", async () => {
      const response = await request(app)
        .patch("/v2/orders/order-123/status")
        .send({ status: "processing", notes: "Started processing" });

      expect(response.status).toBe(200);
      expect(response.body.statusHistory).toBeDefined();
    });

    it("❌ should return 400 if status is missing", async () => {
      const response = await request(app)
        .patch("/v2/orders/order-123/status")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("❌ should return 400 if status is invalid", async () => {
      const response = await request(app)
        .patch("/v2/orders/order-123/status")
        .send({ status: "invalid_status" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("INVALID_STATUS");
    });

    it("❌ should return 404 if order not found", async () => {
      const response = await request(app)
        .patch("/v2/orders/non-existent/status")
        .send({ status: "processing" });

      expect(response.status).toBe(404);
    });

    it("❌ should return 400 for invalid status transition from cancelled", async () => {
      await db.collection("orders").doc("order-123").update({
        status: "cancelled",
      });

      const response = await request(app)
        .patch("/v2/orders/order-123/status")
        .send({ status: "pending" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_TRANSITION");
    });

    it("❌ should return 400 for invalid status transition from delivered", async () => {
      await db.collection("orders").doc("order-123").update({
        status: "delivered",
      });

      const response = await request(app)
        .patch("/v2/orders/order-123/status")
        .send({ status: "processing" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_TRANSITION");
    });
  });

  // =========================================
  // POST /v2/orders/:id/cancel - Cancel Order
  // =========================================
  describe("POST /v2/orders/:id/cancel - Cancel Order", () => {
    beforeEach(async () => {
      await db.collection("orders").doc("order-123").set({
        partnerId: testPartnerId,
        customerId: testCustomerId,
        pharmacyId: testPharmacyId,
        status: "pending",
        items: [{ productId: "product-123", quantity: 2 }],
        createdAt: new Date().toISOString(),
      });
    });

    it("✅ should cancel order successfully", async () => {
      const response = await request(app)
        .post("/v2/orders/order-123/cancel")
        .send({ reason: "Customer requested cancellation" });

      expect(response.status).toBe(204);
    });

    it("❌ should return 400 if order cannot be cancelled (shipped)", async () => {
      await db.collection("orders").doc("order-123").update({
        status: "shipped",
      });

      const response = await request(app)
        .post("/v2/orders/order-123/cancel")
        .send({ reason: "Changed my mind" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("CANNOT_CANCEL");
    });

    it("❌ should return 400 if order already cancelled", async () => {
      await db.collection("orders").doc("order-123").update({
        status: "cancelled",
      });

      const response = await request(app)
        .post("/v2/orders/order-123/cancel")
        .send({ reason: "Double cancel" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("ALREADY_CANCELLED");
    });

    it("❌ should return 404 if order not found", async () => {
      const response = await request(app)
        .post("/v2/orders/non-existent/cancel")
        .send({ reason: "Test" });

      expect(response.status).toBe(404);
    });
  });

  // =========================================
  // POST /v2/orders/:id/refund - Request Refund
  // =========================================
  describe("POST /v2/orders/:id/refund - Request Refund", () => {
    beforeEach(async () => {
      await db.collection("orders").doc("order-123").set({
        partnerId: testPartnerId,
        customerId: testCustomerId,
        pharmacyId: testPharmacyId,
        status: "delivered",
        paymentStatus: "paid",
        total: 100.00,
        createdAt: new Date().toISOString(),
      });
    });

    it("✅ should create refund request successfully", async () => {
      const response = await request(app)
        .post("/v2/orders/order-123/refund")
        .send({ reason: "Product damaged", amount: 100.00 });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.reason).toBe("Product damaged");
    });

    it("✅ should allow partial refund", async () => {
      const response = await request(app)
        .post("/v2/orders/order-123/refund")
        .send({ reason: "Partial refund", amount: 50.00 });

      expect(response.status).toBe(201);
      expect(response.body.amount).toBe(50.00);
    });

    it("✅ should default to order total when no amount specified", async () => {
      const response = await request(app)
        .post("/v2/orders/order-123/refund")
        .send({ reason: "Full refund" });

      expect(response.status).toBe(201);
      expect(response.body.amount).toBe(100.00);
    });

    it("❌ should return 400 if reason not provided", async () => {
      const response = await request(app)
        .post("/v2/orders/order-123/refund")
        .send({ amount: 50.00 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("❌ should return 400 if order not paid", async () => {
      await db.collection("orders").doc("order-123").update({
        paymentStatus: "pending",
      });

      const response = await request(app)
        .post("/v2/orders/order-123/refund")
        .send({ reason: "Test", amount: 50 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("CANNOT_REFUND");
    });

    it("❌ should return 404 if order not found", async () => {
      const response = await request(app)
        .post("/v2/orders/non-existent/refund")
        .send({ reason: "Test", amount: 50 });

      expect(response.status).toBe(404);
    });
  });
});
