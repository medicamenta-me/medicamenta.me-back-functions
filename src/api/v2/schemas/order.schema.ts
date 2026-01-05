/**
 * 🛒 Order Validation Schemas - Zod
 * 
 * Esquemas de validação para todas as operações de pedidos.
 * Segue princípios SOLID (Single Responsibility) e Clean Code.
 * 
 * @module schemas/order
 * @version 2.0.0
 */

import { z } from "zod";

// ============================================
// Enums
// ============================================

export const OrderStatusEnum = z.enum([
  "pending",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "out_for_delivery",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

export const PaymentMethodEnum = z.enum([
  "credit_card",
  "debit_card",
  "pix",
  "boleto",
]);

export const PaymentStatusEnum = z.enum([
  "pending",
  "processing",
  "paid",
  "failed",
  "refunded",
  "cancelled",
]);

// ============================================
// Sub-schemas (Reusable Components)
// ============================================

/**
 * Endereço - Schema reutilizável
 */
export const AddressSchema = z.object({
  street: z.string()
    .min(3, "Street must have at least 3 characters")
    .max(200, "Street must have at most 200 characters"),
  number: z.string()
    .min(1, "Number is required")
    .max(20, "Number must have at most 20 characters"),
  complement: z.string()
    .max(100, "Complement must have at most 100 characters")
    .optional(),
  neighborhood: z.string()
    .min(2, "Neighborhood must have at least 2 characters")
    .max(100, "Neighborhood must have at most 100 characters"),
  city: z.string()
    .min(2, "City must have at least 2 characters")
    .max(100, "City must have at most 100 characters"),
  state: z.string()
    .length(2, "State must be exactly 2 characters (UF)"),
  zipCode: z.string()
    .regex(/^\d{5}-?\d{3}$/, "Invalid ZIP code format (XXXXX-XXX or XXXXXXXX)"),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

/**
 * Item do pedido
 */
export const OrderItemSchema = z.object({
  productId: z.string()
    .min(1, "Product ID is required")
    .max(128, "Product ID too long"),
  quantity: z.number()
    .int("Quantity must be an integer")
    .min(1, "Quantity must be at least 1")
    .max(100, "Quantity must be at most 100"),
  price: z.number()
    .min(0.01, "Price must be greater than 0")
    .max(999999.99, "Price too high"),
});

// ============================================
// Create Order Schema
// ============================================

/**
 * Schema para criação de pedido
 * POST /v2/orders
 */
export const CreateOrderSchema = z.object({
  // Required fields
  customerId: z.string()
    .min(1, "Customer ID is required")
    .max(128, "Customer ID too long"),
  pharmacyId: z.string()
    .min(1, "Pharmacy ID is required")
    .max(128, "Pharmacy ID too long"),
  items: z.array(OrderItemSchema)
    .min(1, "At least one item is required")
    .max(50, "Maximum 50 items per order"),
  shippingAddress: AddressSchema,
  paymentMethod: PaymentMethodEnum,

  // Optional fields
  billingAddress: AddressSchema.optional(),
  couponCode: z.string()
    .max(50, "Coupon code too long")
    .optional(),
  prescriptionId: z.string()
    .max(128, "Prescription ID too long")
    .optional(),
  notes: z.string()
    .max(500, "Notes must have at most 500 characters")
    .optional(),
  
  // Delivery preferences
  deliveryInstructions: z.string()
    .max(300, "Delivery instructions too long")
    .optional(),
  preferredDeliveryDate: z.string()
    .datetime({ message: "Invalid date format" })
    .optional(),
  leaveAtDoor: z.boolean().optional(),
}).strict();

// ============================================
// Update Order Status Schema
// ============================================

/**
 * Schema para atualização de status
 * PATCH /v2/orders/:id/status
 */
export const UpdateOrderStatusSchema = z.object({
  status: OrderStatusEnum,
  notes: z.string()
    .max(500, "Notes must have at most 500 characters")
    .optional(),
  notifyCustomer: z.boolean().default(true),
  trackingCode: z.string()
    .max(100, "Tracking code too long")
    .optional(),
  estimatedDeliveryDate: z.string()
    .datetime({ message: "Invalid date format" })
    .optional(),
}).strict();

// ============================================
// Cancel Order Schema
// ============================================

/**
 * Schema para cancelamento de pedido
 * POST /v2/orders/:id/cancel
 */
export const CancelOrderSchema = z.object({
  reason: z.string()
    .min(5, "Reason must have at least 5 characters")
    .max(500, "Reason must have at most 500 characters"),
  cancelledBy: z.enum(["customer", "pharmacy", "admin", "system"]).optional(),
  refundRequested: z.boolean().default(false),
}).strict();

// ============================================
// Request Refund Schema
// ============================================

/**
 * Schema para solicitação de reembolso
 * POST /v2/orders/:id/refund
 */
export const RequestRefundSchema = z.object({
  reason: z.string()
    .min(10, "Reason must have at least 10 characters")
    .max(500, "Reason must have at most 500 characters"),
  amount: z.number()
    .min(0.01, "Amount must be greater than 0")
    .optional(), // If not provided, full refund
  refundMethod: z.enum(["original_payment", "store_credit", "bank_transfer"]).default("original_payment"),
  itemsToRefund: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
  })).optional(), // For partial refunds
}).strict();

// ============================================
// Query Parameters Schema
// ============================================

/**
 * Schema para parâmetros de busca de pedidos
 * GET /v2/orders
 */
export const OrderQuerySchema = z.object({
  customerId: z.string().optional(),
  pharmacyId: z.string().optional(),
  status: OrderStatusEnum.optional(),
  paymentStatus: PaymentStatusEnum.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  minTotal: z.coerce.number().min(0).optional(),
  maxTotal: z.coerce.number().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum(["createdAt", "updatedAt", "total", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ============================================
// Type Exports
// ============================================

export type Address = z.infer<typeof AddressSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
export type CancelOrderInput = z.infer<typeof CancelOrderSchema>;
export type RequestRefundInput = z.infer<typeof RequestRefundSchema>;
export type OrderQueryParams = z.infer<typeof OrderQuerySchema>;
export type OrderStatus = z.infer<typeof OrderStatusEnum>;
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;
export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;

// ============================================
// Validation Helper
// ============================================

/**
 * Valida dados usando um schema Zod
 * @throws ApiError se validação falhar
 */
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const errors = result.error.issues.map(e => ({
      field: e.path.join("."),
      message: e.message,
    }));
    
    throw {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: errors,
    };
  }
  
  return result.data;
}
