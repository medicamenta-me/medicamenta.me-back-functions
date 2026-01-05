// @ts-nocheck
/**
 * 🏥 Pharmacies Routes v2 - Unit Tests
 * 
 * Uses global Firestore mock from setup.ts
 */

import request from "supertest";
import express, { Express } from "express";
import * as admin from "firebase-admin";
import { pharmaciesRouter } from "../pharmacies.routes";
import { errorHandler } from "../../middleware/error-handler";
import { clearMockData } from "../../../__tests__/setup";

// Firebase Admin mockado no setup.ts global
const db = admin.firestore();

describe("🏥 Pharmacies Routes v2 - Unit Tests", () => {
  let app: Express;
  const testPartnerId = "test-partner-pharmacies-v2";

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
    
    app.use("/v2/pharmacies", pharmaciesRouter);
    app.use(errorHandler);
  });

  afterAll(() => {
    clearMockData();
  });

  // =========================================
  // GET /v2/pharmacies - List Pharmacies
  // =========================================
  describe("GET /v2/pharmacies - List Pharmacies", () => {
    beforeEach(async () => {
      await db.collection("pharmacies").doc("pharmacy-1").set({
        partnerId: testPartnerId,
        name: "Farmácia Central",
        status: "active",
        address: { city: "São Paulo", state: "SP" },
        hasDelivery: true,
        createdAt: new Date().toISOString(),
      });
      await db.collection("pharmacies").doc("pharmacy-2").set({
        partnerId: testPartnerId,
        name: "Farmácia Popular",
        status: "pending",
        address: { city: "Rio de Janeiro", state: "RJ" },
        hasDelivery: false,
        createdAt: new Date().toISOString(),
      });
    });

    it("✅ should list all pharmacies", async () => {
      const response = await request(app)
        .get("/v2/pharmacies");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body).toHaveProperty("pagination");
    });

    it("✅ should filter pharmacies by status", async () => {
      const response = await request(app)
        .get("/v2/pharmacies?status=active");

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it("✅ should filter pharmacies with delivery", async () => {
      const response = await request(app)
        .get("/v2/pharmacies?hasDelivery=true");

      expect(response.status).toBe(200);
    });

    it("✅ should paginate results", async () => {
      const response = await request(app)
        .get("/v2/pharmacies?limit=1&offset=0");

      expect(response.status).toBe(200);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.limit).toBe(1);
    });

    it("✅ should return empty array when no pharmacies found", async () => {
      clearMockData();
      const response = await request(app)
        .get("/v2/pharmacies");

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(0);
    });
  });

  // =========================================
  // GET /v2/pharmacies/nearby - Find Nearby
  // =========================================
  describe("GET /v2/pharmacies/nearby - Find Nearby Pharmacies", () => {
    beforeEach(async () => {
      await db.collection("pharmacies").doc("pharmacy-near").set({
        partnerId: testPartnerId,
        name: "Farmácia Próxima",
        status: "active",
        address: {
          latitude: -23.5505,
          longitude: -46.6333,
          city: "São Paulo",
        },
      });
      await db.collection("pharmacies").doc("pharmacy-far").set({
        partnerId: testPartnerId,
        name: "Farmácia Distante",
        status: "active",
        address: {
          latitude: -22.9068,
          longitude: -43.1729,
          city: "Rio de Janeiro",
        },
      });
    });

    it("✅ should find nearby pharmacies", async () => {
      const response = await request(app)
        .get("/v2/pharmacies/nearby?lat=-23.5505&lng=-46.6333&radius=10");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it("✅ should return pharmacies with distance", async () => {
      const response = await request(app)
        .get("/v2/pharmacies/nearby?lat=-23.5505&lng=-46.6333&radius=100");

      expect(response.status).toBe(200);
      if (response.body.data.length > 0) {
        expect(response.body.data[0]).toHaveProperty("distance");
      }
    });

    it("❌ should return 400 if lat is missing", async () => {
      const response = await request(app)
        .get("/v2/pharmacies/nearby?lng=-46.6333");

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("❌ should return 400 if lng is missing", async () => {
      const response = await request(app)
        .get("/v2/pharmacies/nearby?lat=-23.5505");

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // =========================================
  // GET /v2/pharmacies/:id - Get Pharmacy
  // =========================================
  describe("GET /v2/pharmacies/:id - Get Pharmacy Details", () => {
    beforeEach(async () => {
      await db.collection("pharmacies").doc("pharmacy-123").set({
        partnerId: testPartnerId,
        name: "Farmácia Teste",
        cnpj: "12.345.678/0001-90",
        status: "active",
      });
    });

    it("✅ should get pharmacy details by ID", async () => {
      const response = await request(app)
        .get("/v2/pharmacies/pharmacy-123");

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Farmácia Teste");
    });

    it("❌ should return 404 if pharmacy not found", async () => {
      const response = await request(app)
        .get("/v2/pharmacies/non-existent");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("❌ should return 403 for pharmacies from another partner", async () => {
      await db.collection("pharmacies").doc("other-pharmacy").set({
        partnerId: "other-partner",
        name: "Other Pharmacy",
      });

      const response = await request(app)
        .get("/v2/pharmacies/other-pharmacy");

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  // =========================================
  // POST /v2/pharmacies - Create Pharmacy
  // =========================================
  describe("POST /v2/pharmacies - Create Pharmacy", () => {
    const validPharmacyData = {
      name: "Nova Farmácia",
      cnpj: "98.765.432/0001-21",
      email: "contato@novafarmacia.com",
      address: {
        street: "Rua Teste",
        number: "123",
        city: "São Paulo",
        state: "SP",
        zipCode: "01234-567",
      },
    };

    it("✅ should create a pharmacy successfully", async () => {
      const response = await request(app)
        .post("/v2/pharmacies")
        .send(validPharmacyData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.name).toBe("Nova Farmácia");
      expect(response.body.status).toBe("pending");
    });

    it("✅ should create pharmacy with all optional fields", async () => {
      const response = await request(app)
        .post("/v2/pharmacies")
        .send({
          ...validPharmacyData,
          phone: "(11) 99999-9999",
          hasDelivery: true,
          deliveryRadius: 10,
          shippingCost: 8.00,
          freeShippingMinValue: 50.00,
        });

      expect(response.status).toBe(201);
      expect(response.body.hasDelivery).toBe(true);
    });

    it("❌ should return 400 if required fields are missing", async () => {
      const response = await request(app)
        .post("/v2/pharmacies")
        .send({
          name: "Incomplete Pharmacy",
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("❌ should return 400 if CNPJ already registered", async () => {
      await db.collection("pharmacies").doc("existing-pharmacy").set({
        partnerId: testPartnerId,
        cnpj: "98.765.432/0001-21",
        name: "Existing Pharmacy",
      });

      const response = await request(app)
        .post("/v2/pharmacies")
        .send(validPharmacyData);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("DUPLICATE_CNPJ");
    });
  });

  // =========================================
  // PATCH /v2/pharmacies/:id - Update Pharmacy
  // =========================================
  describe("PATCH /v2/pharmacies/:id - Update Pharmacy", () => {
    beforeEach(async () => {
      await db.collection("pharmacies").doc("pharmacy-123").set({
        partnerId: testPartnerId,
        name: "Original Name",
        email: "original@email.com",
        status: "active",
      });
    });

    it("✅ should update pharmacy successfully", async () => {
      const response = await request(app)
        .patch("/v2/pharmacies/pharmacy-123")
        .send({ name: "Updated Name", email: "updated@email.com" });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Updated Name");
      expect(response.body.email).toBe("updated@email.com");
    });

    it("❌ should return 400 if no valid fields to update", async () => {
      const response = await request(app)
        .patch("/v2/pharmacies/pharmacy-123")
        .send({ invalidField: "value" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("❌ should return 404 if pharmacy not found", async () => {
      const response = await request(app)
        .patch("/v2/pharmacies/non-existent")
        .send({ name: "New Name" });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("❌ should return 403 for pharmacies from another partner", async () => {
      await db.collection("pharmacies").doc("other-pharmacy").set({
        partnerId: "other-partner",
        name: "Other Pharmacy",
      });

      const response = await request(app)
        .patch("/v2/pharmacies/other-pharmacy")
        .send({ name: "Hacked Name" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  // =========================================
  // GET /v2/pharmacies/:id/products - List Products
  // =========================================
  describe("GET /v2/pharmacies/:id/products - List Pharmacy Products", () => {
    beforeEach(async () => {
      await db.collection("pharmacies").doc("pharmacy-123").set({
        partnerId: testPartnerId,
        name: "Farmácia Teste",
        status: "active",
      });
      
      await db.collection("products").doc("product-1").set({
        partnerId: testPartnerId,
        pharmacyId: "pharmacy-123",
        name: "Paracetamol",
        price: 15.90,
        stock: 100,
        createdAt: new Date().toISOString(),
      });
      
      await db.collection("products").doc("product-2").set({
        partnerId: testPartnerId,
        pharmacyId: "pharmacy-123",
        name: "Dipirona",
        price: 12.50,
        stock: 50,
        createdAt: new Date().toISOString(),
      });
    });

    it("✅ should list pharmacy products", async () => {
      const response = await request(app)
        .get("/v2/pharmacies/pharmacy-123/products");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it("✅ should filter products by category", async () => {
      const response = await request(app)
        .get("/v2/pharmacies/pharmacy-123/products?category=analgesics");

      expect(response.status).toBe(200);
    });

    it("✅ should filter in-stock products", async () => {
      const response = await request(app)
        .get("/v2/pharmacies/pharmacy-123/products?inStock=true");

      expect(response.status).toBe(200);
    });

    it("✅ should paginate results", async () => {
      const response = await request(app)
        .get("/v2/pharmacies/pharmacy-123/products?limit=1&offset=0");

      expect(response.status).toBe(200);
      expect(response.body.pagination).toBeDefined();
    });

    it("❌ should return 404 if pharmacy not found", async () => {
      const response = await request(app)
        .get("/v2/pharmacies/non-existent/products");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });
});
