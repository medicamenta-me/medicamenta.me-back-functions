// @ts-nocheck
/**
 * 💊 Products Routes v2 - Unit Tests
 * 
 * Uses global Firestore mock from setup.ts
 */

import request from "supertest";
import express, { Express } from "express";
import * as admin from "firebase-admin";
import { productsRouter } from "../products.routes";
import { errorHandler } from "../../middleware/error-handler";
import { clearMockData } from "../../../__tests__/setup";

// Firebase Admin mockado no setup.ts global
const db = admin.firestore();

describe("💊 Products Routes v2 - Unit Tests", () => {
  let app: Express;
  const testPartnerId = "test-partner-products-v2";
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
    
    app.use("/v2/products", productsRouter);
    app.use(errorHandler);
    
    // Seed pharmacy
    await db.collection("pharmacies").doc(testPharmacyId).set({
      name: "Farmácia Teste",
      partnerId: testPartnerId,
      status: "active",
    });
  });

  afterAll(() => {
    clearMockData();
  });

  // =========================================
  // GET /v2/products - List Products
  // =========================================
  describe("GET /v2/products - List Products", () => {
    beforeEach(async () => {
      await db.collection("products").doc("product-1").set({
        partnerId: testPartnerId,
        pharmacyId: testPharmacyId,
        name: "Paracetamol 500mg",
        category: "analgesics",
        price: 15.90,
        stock: 100,
        requiresPrescription: false,
        createdAt: new Date().toISOString(),
      });
      await db.collection("products").doc("product-2").set({
        partnerId: testPartnerId,
        pharmacyId: testPharmacyId,
        name: "Amoxicilina 500mg",
        category: "antibiotics",
        price: 35.50,
        stock: 50,
        requiresPrescription: true,
        createdAt: new Date().toISOString(),
      });
    });

    it("✅ should list all products", async () => {
      const response = await request(app)
        .get("/v2/products");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body).toHaveProperty("pagination");
    });

    it("✅ should filter products by category", async () => {
      const response = await request(app)
        .get("/v2/products?category=analgesics");

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it("✅ should filter products by pharmacyId", async () => {
      const response = await request(app)
        .get(`/v2/products?pharmacyId=${testPharmacyId}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it("✅ should filter in-stock products", async () => {
      const response = await request(app)
        .get("/v2/products?inStock=true");

      expect(response.status).toBe(200);
    });

    it("✅ should filter prescription products", async () => {
      const response = await request(app)
        .get("/v2/products?requiresPrescription=true");

      expect(response.status).toBe(200);
    });

    it("✅ should search products by name", async () => {
      const response = await request(app)
        .get("/v2/products?q=paracetamol");

      expect(response.status).toBe(200);
    });

    it("✅ should filter by price range", async () => {
      const response = await request(app)
        .get("/v2/products?minPrice=10&maxPrice=20");

      expect(response.status).toBe(200);
    });

    it("✅ should paginate results", async () => {
      const response = await request(app)
        .get("/v2/products?limit=1&offset=0");

      expect(response.status).toBe(200);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.limit).toBe(1);
    });

    it("✅ should return empty array when no products match", async () => {
      clearMockData();
      const response = await request(app)
        .get("/v2/products");

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(0);
    });
  });

  // =========================================
  // GET /v2/products/:id - Get Product
  // =========================================
  describe("GET /v2/products/:id - Get Product Details", () => {
    beforeEach(async () => {
      await db.collection("products").doc("product-123").set({
        partnerId: testPartnerId,
        pharmacyId: testPharmacyId,
        name: "Paracetamol 500mg",
        price: 15.90,
        stock: 100,
      });
    });

    it("✅ should get product details by ID", async () => {
      const response = await request(app)
        .get("/v2/products/product-123");

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Paracetamol 500mg");
      expect(response.body.price).toBe(15.90);
    });

    it("❌ should return 404 if product not found", async () => {
      const response = await request(app)
        .get("/v2/products/non-existent");

      expect(response.status).toBe(404);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("❌ should return 403 for products from another partner", async () => {
      await db.collection("products").doc("other-product").set({
        partnerId: "other-partner",
        name: "Other Product",
      });

      const response = await request(app)
        .get("/v2/products/other-product");

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  // =========================================
  // GET /v2/products/categories - List Categories
  // =========================================
  describe("GET /v2/products/categories - List Categories", () => {
    it("✅ should return list of categories", async () => {
      const response = await request(app)
        .get("/v2/products/categories");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty("id");
      expect(response.body.data[0]).toHaveProperty("name");
    });
  });

  // =========================================
  // POST /v2/products - Create Product
  // =========================================
  describe("POST /v2/products - Create Product", () => {
    const validProductData = {
      pharmacyId: "test-pharmacy-123",
      name: "New Product",
      category: "analgesics",
      price: 25.00,
      stock: 50,
    };

    it("✅ should create a product successfully", async () => {
      const response = await request(app)
        .post("/v2/products")
        .send(validProductData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.name).toBe("New Product");
      expect(response.body.status).toBe("pending");
    });

    it("✅ should create product with all optional fields", async () => {
      const response = await request(app)
        .post("/v2/products")
        .send({
          ...validProductData,
          description: "Product description",
          requiresPrescription: true,
          activeIngredient: "Dipirona",
          manufacturer: "Lab XYZ",
          imageUrl: "https://example.com/image.jpg",
          sku: "SKU123",
        });

      expect(response.status).toBe(201);
      expect(response.body.description).toBe("Product description");
      expect(response.body.requiresPrescription).toBe(true);
    });

    it("❌ should return 400 if required fields are missing", async () => {
      const response = await request(app)
        .post("/v2/products")
        .send({
          name: "Incomplete Product",
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("❌ should return 404 if pharmacy not found", async () => {
      const response = await request(app)
        .post("/v2/products")
        .send({
          ...validProductData,
          pharmacyId: "non-existent-pharmacy",
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("❌ should return 403 if pharmacy belongs to another partner", async () => {
      await db.collection("pharmacies").doc("other-pharmacy").set({
        name: "Other Pharmacy",
        partnerId: "other-partner",
      });

      const response = await request(app)
        .post("/v2/products")
        .send({
          ...validProductData,
          pharmacyId: "other-pharmacy",
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  // =========================================
  // PATCH /v2/products/:id - Update Product
  // =========================================
  describe("PATCH /v2/products/:id - Update Product", () => {
    beforeEach(async () => {
      await db.collection("products").doc("product-123").set({
        partnerId: testPartnerId,
        pharmacyId: testPharmacyId,
        name: "Original Name",
        price: 10.00,
        stock: 50,
        category: "analgesics",
      });
    });

    it("✅ should update product successfully", async () => {
      const response = await request(app)
        .patch("/v2/products/product-123")
        .send({ name: "Updated Name", price: 15.00 });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Updated Name");
      expect(response.body.price).toBe(15.00);
    });

    it("❌ should return 400 if no valid fields to update", async () => {
      const response = await request(app)
        .patch("/v2/products/product-123")
        .send({ invalidField: "value" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("❌ should return 404 if product not found", async () => {
      const response = await request(app)
        .patch("/v2/products/non-existent")
        .send({ name: "New Name" });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("❌ should return 403 for products from another partner", async () => {
      await db.collection("products").doc("other-product").set({
        partnerId: "other-partner",
        name: "Other Product",
      });

      const response = await request(app)
        .patch("/v2/products/other-product")
        .send({ name: "Hacked Name" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  // =========================================
  // DELETE /v2/products/:id - Delete Product
  // =========================================
  describe("DELETE /v2/products/:id - Delete Product", () => {
    beforeEach(async () => {
      await db.collection("products").doc("product-123").set({
        partnerId: testPartnerId,
        pharmacyId: testPharmacyId,
        name: "Product to Delete",
        status: "active",
      });
    });

    it("✅ should soft delete product successfully", async () => {
      const response = await request(app)
        .delete("/v2/products/product-123");

      expect(response.status).toBe(204);
    });

    it("❌ should return 404 if product not found", async () => {
      const response = await request(app)
        .delete("/v2/products/non-existent");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("❌ should return 403 for products from another partner", async () => {
      await db.collection("products").doc("other-product").set({
        partnerId: "other-partner",
        name: "Other Product",
      });

      const response = await request(app)
        .delete("/v2/products/other-product");

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  // =========================================
  // PATCH /v2/products/:id/stock - Update Stock
  // =========================================
  describe("PATCH /v2/products/:id/stock - Update Stock", () => {
    beforeEach(async () => {
      await db.collection("products").doc("product-123").set({
        partnerId: testPartnerId,
        pharmacyId: testPharmacyId,
        name: "Stock Product",
        stock: 50,
      });
    });

    it("✅ should update stock successfully", async () => {
      const response = await request(app)
        .patch("/v2/products/product-123/stock")
        .send({ stock: 100 });

      expect(response.status).toBe(200);
      expect(response.body.stock).toBe(100);
    });

    it("✅ should allow setting stock to zero", async () => {
      const response = await request(app)
        .patch("/v2/products/product-123/stock")
        .send({ stock: 0 });

      expect(response.status).toBe(200);
      expect(response.body.stock).toBe(0);
    });

    it("❌ should return 400 if stock is negative", async () => {
      const response = await request(app)
        .patch("/v2/products/product-123/stock")
        .send({ stock: -5 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("❌ should return 400 if stock is missing", async () => {
      const response = await request(app)
        .patch("/v2/products/product-123/stock")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("❌ should return 404 if product not found", async () => {
      const response = await request(app)
        .patch("/v2/products/non-existent/stock")
        .send({ stock: 10 });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("❌ should return 403 for products from another partner", async () => {
      await db.collection("products").doc("other-product").set({
        partnerId: "other-partner",
        name: "Other Product",
        stock: 50,
      });

      const response = await request(app)
        .patch("/v2/products/other-product/stock")
        .send({ stock: 100 });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });
});
