/**
 * 🧪 Order Schema Tests
 * 
 * Testes unitários para validações de pedidos.
 */

import {
  CreateOrderSchema,
  UpdateOrderStatusSchema,
  CancelOrderSchema,
  RequestRefundSchema,
  OrderQuerySchema,
  AddressSchema,
  OrderItemSchema,
  validateSchema,
} from "../order.schema";

describe("📦 Order Schemas", () => {
  // =========================================
  // AddressSchema Tests
  // =========================================
  describe("AddressSchema", () => {
    const validAddress = {
      street: "Rua das Flores",
      number: "123",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234-567",
    };

    it("✅ should validate a complete address", () => {
      const result = AddressSchema.safeParse(validAddress);
      expect(result.success).toBe(true);
    });

    it("✅ should validate address with complement", () => {
      const result = AddressSchema.safeParse({
        ...validAddress,
        complement: "Apto 101",
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate address with coordinates", () => {
      const result = AddressSchema.safeParse({
        ...validAddress,
        latitude: -23.5505,
        longitude: -46.6333,
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject short street name", () => {
      const result = AddressSchema.safeParse({
        ...validAddress,
        street: "Ru",
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid state (not 2 chars)", () => {
      const result = AddressSchema.safeParse({
        ...validAddress,
        state: "São Paulo",
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid ZIP code", () => {
      const result = AddressSchema.safeParse({
        ...validAddress,
        zipCode: "12345",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should accept ZIP code without hyphen", () => {
      const result = AddressSchema.safeParse({
        ...validAddress,
        zipCode: "01234567",
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject invalid latitude", () => {
      const result = AddressSchema.safeParse({
        ...validAddress,
        latitude: 100,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid longitude", () => {
      const result = AddressSchema.safeParse({
        ...validAddress,
        longitude: 200,
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================
  // OrderItemSchema Tests
  // =========================================
  describe("OrderItemSchema", () => {
    it("✅ should validate a valid order item", () => {
      const result = OrderItemSchema.safeParse({
        productId: "prod-123",
        quantity: 2,
        price: 29.99,
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject empty productId", () => {
      const result = OrderItemSchema.safeParse({
        productId: "",
        quantity: 2,
        price: 29.99,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject zero quantity", () => {
      const result = OrderItemSchema.safeParse({
        productId: "prod-123",
        quantity: 0,
        price: 29.99,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject negative quantity", () => {
      const result = OrderItemSchema.safeParse({
        productId: "prod-123",
        quantity: -1,
        price: 29.99,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject quantity > 100", () => {
      const result = OrderItemSchema.safeParse({
        productId: "prod-123",
        quantity: 101,
        price: 29.99,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject decimal quantity", () => {
      const result = OrderItemSchema.safeParse({
        productId: "prod-123",
        quantity: 1.5,
        price: 29.99,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject zero price", () => {
      const result = OrderItemSchema.safeParse({
        productId: "prod-123",
        quantity: 2,
        price: 0,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject price too high", () => {
      const result = OrderItemSchema.safeParse({
        productId: "prod-123",
        quantity: 2,
        price: 1000000,
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================
  // CreateOrderSchema Tests
  // =========================================
  describe("CreateOrderSchema", () => {
    const validOrder = {
      customerId: "customer-123",
      pharmacyId: "pharmacy-456",
      items: [
        { productId: "prod-1", quantity: 2, price: 29.99 },
        { productId: "prod-2", quantity: 1, price: 49.99 },
      ],
      shippingAddress: {
        street: "Rua das Flores",
        number: "123",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        zipCode: "01234-567",
      },
      paymentMethod: "credit_card" as const,
    };

    it("✅ should validate a complete order", () => {
      const result = CreateOrderSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
    });

    it("✅ should validate order with all optional fields", () => {
      const result = CreateOrderSchema.safeParse({
        ...validOrder,
        billingAddress: validOrder.shippingAddress,
        couponCode: "SAVE10",
        prescriptionId: "rx-123",
        notes: "Leave at door",
        deliveryInstructions: "Ring the bell twice",
        leaveAtDoor: true,
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject missing customerId", () => {
      const { customerId, ...orderWithoutCustomer } = validOrder;
      const result = CreateOrderSchema.safeParse(orderWithoutCustomer);
      expect(result.success).toBe(false);
    });

    it("❌ should reject missing pharmacyId", () => {
      const { pharmacyId, ...orderWithoutPharmacy } = validOrder;
      const result = CreateOrderSchema.safeParse(orderWithoutPharmacy);
      expect(result.success).toBe(false);
    });

    it("❌ should reject empty items array", () => {
      const result = CreateOrderSchema.safeParse({
        ...validOrder,
        items: [],
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject too many items (> 50)", () => {
      const manyItems = Array(51).fill({ productId: "prod-1", quantity: 1, price: 10 });
      const result = CreateOrderSchema.safeParse({
        ...validOrder,
        items: manyItems,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid payment method", () => {
      const result = CreateOrderSchema.safeParse({
        ...validOrder,
        paymentMethod: "bitcoin",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should accept all valid payment methods", () => {
      const methods = ["credit_card", "debit_card", "pix", "boleto"] as const;
      methods.forEach((method) => {
        const result = CreateOrderSchema.safeParse({
          ...validOrder,
          paymentMethod: method,
        });
        expect(result.success).toBe(true);
      });
    });

    it("❌ should reject notes too long", () => {
      const result = CreateOrderSchema.safeParse({
        ...validOrder,
        notes: "x".repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject extra fields (strict mode)", () => {
      const result = CreateOrderSchema.safeParse({
        ...validOrder,
        unknownField: "value",
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================
  // UpdateOrderStatusSchema Tests
  // =========================================
  describe("UpdateOrderStatusSchema", () => {
    it("✅ should validate status update", () => {
      const result = UpdateOrderStatusSchema.safeParse({
        status: "confirmed",
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate status update with all options", () => {
      const result = UpdateOrderStatusSchema.safeParse({
        status: "shipped",
        notes: "Package sent via Correios",
        notifyCustomer: true,
        trackingCode: "BR123456789",
        estimatedDeliveryDate: "2026-01-10T10:00:00Z",
      });
      expect(result.success).toBe(true);
    });

    it("✅ should default notifyCustomer to true", () => {
      const result = UpdateOrderStatusSchema.safeParse({
        status: "confirmed",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.notifyCustomer).toBe(true);
      }
    });

    it("❌ should reject invalid status", () => {
      const result = UpdateOrderStatusSchema.safeParse({
        status: "invalid_status",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should accept all valid statuses", () => {
      const statuses = [
        "pending", "confirmed", "preparing", "ready_for_pickup",
        "out_for_delivery", "shipped", "delivered", "cancelled", "refunded"
      ];
      statuses.forEach((status) => {
        const result = UpdateOrderStatusSchema.safeParse({ status });
        expect(result.success).toBe(true);
      });
    });

    it("❌ should reject invalid date format", () => {
      const result = UpdateOrderStatusSchema.safeParse({
        status: "shipped",
        estimatedDeliveryDate: "2026/01/10",
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================
  // CancelOrderSchema Tests
  // =========================================
  describe("CancelOrderSchema", () => {
    it("✅ should validate cancellation with reason", () => {
      const result = CancelOrderSchema.safeParse({
        reason: "Customer requested cancellation",
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate cancellation with all fields", () => {
      const result = CancelOrderSchema.safeParse({
        reason: "Out of stock - product unavailable",
        cancelledBy: "pharmacy",
        refundRequested: true,
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject reason too short", () => {
      const result = CancelOrderSchema.safeParse({
        reason: "No",
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject reason too long", () => {
      const result = CancelOrderSchema.safeParse({
        reason: "x".repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid cancelledBy", () => {
      const result = CancelOrderSchema.safeParse({
        reason: "Valid reason here",
        cancelledBy: "unknown",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should accept all valid cancelledBy values", () => {
      const values = ["customer", "pharmacy", "admin", "system"];
      values.forEach((value) => {
        const result = CancelOrderSchema.safeParse({
          reason: "Valid reason here",
          cancelledBy: value,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  // =========================================
  // RequestRefundSchema Tests
  // =========================================
  describe("RequestRefundSchema", () => {
    it("✅ should validate refund request", () => {
      const result = RequestRefundSchema.safeParse({
        reason: "Product arrived damaged and not usable",
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate partial refund", () => {
      const result = RequestRefundSchema.safeParse({
        reason: "One item was damaged during shipping",
        amount: 29.99,
        refundMethod: "store_credit",
        itemsToRefund: [{ productId: "prod-1", quantity: 1 }],
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject reason too short", () => {
      const result = RequestRefundSchema.safeParse({
        reason: "Broken",
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject zero amount", () => {
      const result = RequestRefundSchema.safeParse({
        reason: "Valid refund reason here",
        amount: 0,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid refund method", () => {
      const result = RequestRefundSchema.safeParse({
        reason: "Valid refund reason here",
        refundMethod: "cash",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should default refundMethod to original_payment", () => {
      const result = RequestRefundSchema.safeParse({
        reason: "Valid refund reason here",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.refundMethod).toBe("original_payment");
      }
    });
  });

  // =========================================
  // OrderQuerySchema Tests
  // =========================================
  describe("OrderQuerySchema", () => {
    it("✅ should validate empty query (use defaults)", () => {
      const result = OrderQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
        expect(result.data.sortBy).toBe("createdAt");
        expect(result.data.sortOrder).toBe("desc");
      }
    });

    it("✅ should validate complete query", () => {
      const result = OrderQuerySchema.safeParse({
        customerId: "customer-123",
        pharmacyId: "pharmacy-456",
        status: "pending",
        paymentStatus: "paid",
        startDate: "2026-01-01T00:00:00Z",
        endDate: "2026-01-31T23:59:59Z",
        minTotal: 50,
        maxTotal: 500,
        limit: 50,
        offset: 100,
        sortBy: "total",
        sortOrder: "asc",
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject limit > 100", () => {
      const result = OrderQuerySchema.safeParse({
        limit: 101,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject negative offset", () => {
      const result = OrderQuerySchema.safeParse({
        offset: -1,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid sortBy", () => {
      const result = OrderQuerySchema.safeParse({
        sortBy: "invalidField",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should coerce string numbers", () => {
      const result = OrderQuerySchema.safeParse({
        limit: "50",
        offset: "10",
        minTotal: "100.50",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(10);
        expect(result.data.minTotal).toBe(100.5);
      }
    });
  });

  // =========================================
  // validateSchema Helper Tests
  // =========================================
  describe("validateSchema Helper", () => {
    it("✅ should return validated data on success", () => {
      const data = {
        status: "confirmed",
        notifyCustomer: true,
      };
      const result = validateSchema(UpdateOrderStatusSchema, data);
      expect(result.status).toBe("confirmed");
    });

    it("❌ should throw on validation error", () => {
      const data = {
        status: "invalid",
      };
      expect(() => validateSchema(UpdateOrderStatusSchema, data)).toThrow();
    });

    it("❌ should throw with details on validation error", () => {
      const data = {
        status: "invalid",
      };
      try {
        validateSchema(UpdateOrderStatusSchema, data);
      } catch (error: any) {
        expect(error.code).toBe("VALIDATION_ERROR");
        expect(error.details).toBeDefined();
        expect(Array.isArray(error.details)).toBe(true);
      }
    });
  });
});
