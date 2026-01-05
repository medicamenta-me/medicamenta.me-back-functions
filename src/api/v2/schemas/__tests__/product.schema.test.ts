/**
 * 🧪 Product Schema Tests
 * 
 * Testes unitários para validações de produtos.
 */

import {
  CreateProductSchema,
  UpdateProductSchema,
  ProductSearchSchema,
  UpdateStockSchema,
  BulkUpdateProductsSchema,
} from "../product.schema";

describe("💊 Product Schemas", () => {
  // =========================================
  // CreateProductSchema Tests
  // =========================================
  describe("CreateProductSchema", () => {
    const validProduct = {
      pharmacyId: "pharmacy-123",
      name: "Paracetamol 500mg",
      category: "analgesics" as const,
      price: 12.99,
      stock: 100,
    };

    it("✅ should validate a minimal product", () => {
      const result = CreateProductSchema.safeParse(validProduct);
      expect(result.success).toBe(true);
    });

    it("✅ should validate a complete product", () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        description: "Pain relief medication for headaches and fever",
        requiresPrescription: false,
        activeIngredient: "Paracetamol",
        manufacturer: "EMS",
        imageUrl: "https://example.com/image.jpg",
        sku: "PAR-500-100",
        barcode: "7891234567890",
        dosage: "500mg",
        unit: "box",
        minQuantity: 1,
        maxQuantity: 10,
        originalPrice: 15.99,
        costPrice: 8.50,
        tags: ["pain", "fever", "headache"],
        searchKeywords: "dor cabeça febre",
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject missing pharmacyId", () => {
      const { pharmacyId, ...productWithoutPharmacy } = validProduct;
      const result = CreateProductSchema.safeParse(productWithoutPharmacy);
      expect(result.success).toBe(false);
    });

    it("❌ should reject short product name", () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        name: "Pa",
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid category", () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        category: "invalid_category",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should accept all valid categories", () => {
      const categories = [
        "analgesics", "antibiotics", "antiinflammatory", "vitamins",
        "supplements", "skincare", "hygiene", "baby", "medical_devices",
        "first_aid", "cardiovascular", "diabetes", "respiratory",
        "digestive", "neurological", "hormonal", "ophthalmology",
        "dermatology", "other"
      ];
      categories.forEach((category) => {
        const result = CreateProductSchema.safeParse({
          ...validProduct,
          category,
        });
        expect(result.success).toBe(true);
      });
    });

    it("❌ should reject zero price", () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        price: 0,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject negative stock", () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        stock: -1,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject decimal stock", () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        stock: 10.5,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid image URL", () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        imageUrl: "not-a-url",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should accept zero stock", () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        stock: 0,
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject too many tags", () => {
      const result = CreateProductSchema.safeParse({
        ...validProduct,
        tags: Array(11).fill("tag"),
      });
      expect(result.success).toBe(false);
    });

    it("✅ should default requiresPrescription to false", () => {
      const result = CreateProductSchema.safeParse(validProduct);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requiresPrescription).toBe(false);
      }
    });

    it("✅ should default unit to 'unit'", () => {
      const result = CreateProductSchema.safeParse(validProduct);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.unit).toBe("unit");
      }
    });
  });

  // =========================================
  // UpdateProductSchema Tests
  // =========================================
  describe("UpdateProductSchema", () => {
    it("✅ should validate partial update", () => {
      const result = UpdateProductSchema.safeParse({
        price: 15.99,
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate multiple fields update", () => {
      const result = UpdateProductSchema.safeParse({
        name: "Paracetamol 750mg",
        price: 15.99,
        stock: 50,
        description: "Updated description",
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate empty update (no fields)", () => {
      const result = UpdateProductSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("❌ should reject invalid values in update", () => {
      const result = UpdateProductSchema.safeParse({
        price: -10,
      });
      expect(result.success).toBe(false);
    });

    it("should not include pharmacyId in update schema", () => {
      // pharmacyId is omitted from UpdateProductSchema
      const result = UpdateProductSchema.safeParse({
        pharmacyId: "new-pharmacy",
        name: "Test",
      });
      // Should fail because pharmacyId is omitted
      expect(result.success).toBe(false);
    });
  });

  // =========================================
  // ProductSearchSchema Tests
  // =========================================
  describe("ProductSearchSchema", () => {
    it("✅ should validate empty search (use defaults)", () => {
      const result = ProductSearchSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
        expect(result.data.sortBy).toBe("createdAt");
        expect(result.data.sortOrder).toBe("desc");
      }
    });

    it("✅ should validate complete search", () => {
      const result = ProductSearchSchema.safeParse({
        q: "paracetamol",
        category: "analgesics",
        pharmacyId: "pharmacy-123",
        minPrice: 10,
        maxPrice: 50,
        inStock: "true",
        requiresPrescription: "false",
        manufacturer: "EMS",
        activeIngredient: "Paracetamol",
        lat: -23.5505,
        lng: -46.6333,
        radius: 10,
        limit: 50,
        offset: 0,
        sortBy: "price",
        sortOrder: "asc",
      });
      expect(result.success).toBe(true);
    });

    it("✅ should transform inStock string to boolean", () => {
      const result = ProductSearchSchema.safeParse({
        inStock: "true",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.inStock).toBe(true);
      }
    });

    it("✅ should transform requiresPrescription string to boolean", () => {
      const result = ProductSearchSchema.safeParse({
        requiresPrescription: "false",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requiresPrescription).toBe(false);
      }
    });

    it("❌ should reject invalid sortBy", () => {
      const result = ProductSearchSchema.safeParse({
        sortBy: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should accept all valid sortBy values", () => {
      const sortValues = ["createdAt", "price", "name", "rating", "soldCount"];
      sortValues.forEach((sortBy) => {
        const result = ProductSearchSchema.safeParse({ sortBy });
        expect(result.success).toBe(true);
      });
    });

    it("❌ should reject radius > 100", () => {
      const result = ProductSearchSchema.safeParse({
        lat: -23.5505,
        lng: -46.6333,
        radius: 101,
      });
      expect(result.success).toBe(false);
    });

    it("✅ should coerce string numbers", () => {
      const result = ProductSearchSchema.safeParse({
        minPrice: "10.50",
        maxPrice: "100",
        limit: "50",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.minPrice).toBe(10.5);
        expect(result.data.maxPrice).toBe(100);
        expect(result.data.limit).toBe(50);
      }
    });
  });

  // =========================================
  // UpdateStockSchema Tests
  // =========================================
  describe("UpdateStockSchema", () => {
    it("✅ should validate stock set", () => {
      const result = UpdateStockSchema.safeParse({
        action: "set",
        quantity: 100,
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate stock increment", () => {
      const result = UpdateStockSchema.safeParse({
        action: "increment",
        quantity: 50,
        reason: "New shipment received",
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate stock decrement", () => {
      const result = UpdateStockSchema.safeParse({
        action: "decrement",
        quantity: 10,
        reason: "Manual adjustment",
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject invalid action", () => {
      const result = UpdateStockSchema.safeParse({
        action: "multiply",
        quantity: 10,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject negative quantity", () => {
      const result = UpdateStockSchema.safeParse({
        action: "set",
        quantity: -10,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject decimal quantity", () => {
      const result = UpdateStockSchema.safeParse({
        action: "set",
        quantity: 10.5,
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================
  // BulkUpdateProductsSchema Tests
  // =========================================
  describe("BulkUpdateProductsSchema", () => {
    it("✅ should validate bulk status update", () => {
      const result = BulkUpdateProductsSchema.safeParse({
        productIds: ["prod-1", "prod-2", "prod-3"],
        updates: {
          status: "inactive",
        },
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate bulk price update", () => {
      const result = BulkUpdateProductsSchema.safeParse({
        productIds: ["prod-1", "prod-2"],
        updates: {
          price: 29.99,
        },
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate multiple updates", () => {
      const result = BulkUpdateProductsSchema.safeParse({
        productIds: ["prod-1"],
        updates: {
          status: "active",
          price: 19.99,
          stock: 50,
        },
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject empty productIds", () => {
      const result = BulkUpdateProductsSchema.safeParse({
        productIds: [],
        updates: {
          status: "active",
        },
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject too many productIds (> 100)", () => {
      const result = BulkUpdateProductsSchema.safeParse({
        productIds: Array(101).fill("prod-id"),
        updates: {
          status: "active",
        },
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject empty updates", () => {
      const result = BulkUpdateProductsSchema.safeParse({
        productIds: ["prod-1"],
        updates: {},
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid status in updates", () => {
      const result = BulkUpdateProductsSchema.safeParse({
        productIds: ["prod-1"],
        updates: {
          status: "invalid_status",
        },
      });
      expect(result.success).toBe(false);
    });
  });
});
