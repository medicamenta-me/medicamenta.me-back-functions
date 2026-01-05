/**
 * 🛒 Orders Routes - API v2
 * 
 * Gerenciamento de pedidos do Marketplace
 */

import { Router, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { ApiError } from "../utils/api-error";

const router = Router();
const getDb = () => admin.firestore();

// Interfaces
interface CreateOrderRequest {
  customerId: string;
  pharmacyId: string;
  items: OrderItem[];
  shippingAddress: Address;
  billingAddress?: Address;
  paymentMethod: "credit_card" | "debit_card" | "pix" | "boleto";
  couponCode?: string;
  prescriptionId?: string;
  notes?: string;
}

interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

interface Address {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

/**
 * POST /v2/orders
 * Create new order
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const orderData: CreateOrderRequest = req.body;

    // Validation
    if (!orderData.customerId || !orderData.pharmacyId || !orderData.items || orderData.items.length === 0) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "customerId, pharmacyId, and items are required"
      );
    }

    // Verify pharmacy exists
    const pharmacyRef = getDb().collection("pharmacies").doc(orderData.pharmacyId);
    const pharmacyDoc = await pharmacyRef.get();

    if (!pharmacyDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Pharmacy not found");
    }

    const pharmacy = pharmacyDoc.data()!;
    if (pharmacy.status !== "active") {
      throw new ApiError(400, "PHARMACY_INACTIVE", "Pharmacy is not active");
    }

    // Verify products and calculate totals
    let subtotal = 0;
    const itemsWithDetails = await Promise.all(
      orderData.items.map(async (item) => {
        const productRef = getDb().collection("products").doc(item.productId);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
          throw new ApiError(404, "NOT_FOUND", `Product ${item.productId} not found`);
        }

        const product = productDoc.data()!;

        // Check stock
        if (product.stock < item.quantity) {
          throw new ApiError(
            400,
            "OUT_OF_STOCK",
            `Product ${product.name} is out of stock`
          );
        }

        // Check if product requires prescription
        if (product.requiresPrescription && !orderData.prescriptionId) {
          throw new ApiError(
            400,
            "PRESCRIPTION_REQUIRED",
            `Product ${product.name} requires prescription`
          );
        }

        const itemTotal = item.quantity * item.price;
        subtotal += itemTotal;

        return {
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: item.price,
          total: itemTotal,
        };
      })
    );

    // Apply coupon if provided
    let discount = 0;
    if (orderData.couponCode) {
      const couponRef = getDb().collection("coupons").doc(orderData.couponCode);
      const couponDoc = await couponRef.get();

      if (couponDoc.exists) {
        const coupon = couponDoc.data()!;
        if (coupon.active && new Date(coupon.expiresAt) > new Date()) {
          if (coupon.minValue && subtotal < coupon.minValue) {
            throw new ApiError(
              400,
              "MIN_VALUE_NOT_MET",
              `Minimum order value for coupon is ${coupon.minValue}`
            );
          }

          discount = coupon.type === "percentage"
            ? (subtotal * coupon.value) / 100
            : coupon.value;

          // Apply max discount limit
          if (coupon.maxDiscount) {
            discount = Math.min(discount, coupon.maxDiscount);
          }
        }
      }
    }

    // Calculate shipping
    const shippingCost = pharmacy.freeShipping && subtotal >= pharmacy.freeShippingMinValue
      ? 0
      : pharmacy.shippingCost || 10;

    const total = subtotal - discount + shippingCost;

    // Create order
    const order = {
      partnerId,
      customerId: orderData.customerId,
      pharmacyId: orderData.pharmacyId,
      pharmacyName: pharmacy.name,
      items: itemsWithDetails,
      subtotal,
      discount,
      shippingCost,
      total,
      status: "pending",
      paymentMethod: orderData.paymentMethod,
      paymentStatus: "pending",
      shippingAddress: orderData.shippingAddress,
      billingAddress: orderData.billingAddress || orderData.shippingAddress,
      couponCode: orderData.couponCode || null,
      prescriptionId: orderData.prescriptionId || null,
      notes: orderData.notes || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      statusHistory: [
        {
          status: "pending",
          timestamp: new Date().toISOString(),
          notes: "Order created",
        },
      ],
    };

    const docRef = await getDb().collection("orders").add(order);

    // Update product stocks
    await Promise.all(
      orderData.items.map(async (item) => {
        const productRef = getDb().collection("products").doc(item.productId);
        await productRef.update({
          stock: admin.firestore.FieldValue.increment(-item.quantity),
          soldCount: admin.firestore.FieldValue.increment(item.quantity),
        });
      })
    );

    res.status(201).json({
      id: docRef.id,
      ...order,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/orders
 * List orders with filters
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const {
      customerId,
      pharmacyId,
      status,
      paymentStatus,
      startDate,
      endDate,
      limit = 20,
      offset = 0,
    } = req.query;

    let query = getDb().collection("orders").where("partnerId", "==", partnerId);

    if (customerId) {
      query = query.where("customerId", "==", customerId);
    }

    if (pharmacyId) {
      query = query.where("pharmacyId", "==", pharmacyId);
    }

    if (status) {
      query = query.where("status", "==", status);
    }

    if (paymentStatus) {
      query = query.where("paymentStatus", "==", paymentStatus);
    }

    if (startDate) {
      query = query.where("createdAt", ">=", new Date(String(startDate)));
    }

    if (endDate) {
      query = query.where("createdAt", "<=", new Date(String(endDate)));
    }

    query = query
      .orderBy("createdAt", "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    const snapshot = await query.get();

    const orders = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      data: orders,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: orders.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/orders/:id
 * Get order by ID
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const orderRef = getDb().collection("orders").doc(id);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Order not found");
    }

    const order = orderDoc.data()!;

    if (order.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    res.json({
      id: orderDoc.id,
      ...order,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /v2/orders/:id/status
 * Update order status
 */
router.patch("/:id/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      throw new ApiError(400, "VALIDATION_ERROR", "status is required");
    }

    const validStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      throw new ApiError(400, "INVALID_STATUS", `Status must be one of: ${validStatuses.join(", ")}`);
    }

    const orderRef = getDb().collection("orders").doc(id);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Order not found");
    }

    const order = orderDoc.data()!;

    if (order.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    // Validate status transition
    const currentStatus = order.status;
    if (currentStatus === "delivered" || currentStatus === "cancelled") {
      throw new ApiError(400, "INVALID_TRANSITION", "Cannot update completed or cancelled order");
    }

    // Update order
    const statusEntry = {
      status,
      timestamp: new Date().toISOString(),
      notes: notes || null,
    };

    await orderRef.update({
      status,
      statusHistory: admin.firestore.FieldValue.arrayUnion(statusEntry),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updatedDoc = await orderRef.get();

    res.json({
      id: updatedDoc.id,
      ...updatedDoc.data(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v2/orders/:id/cancel
 * Cancel order
 */
router.post("/:id/cancel", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;
    const { reason } = req.body;

    const orderRef = getDb().collection("orders").doc(id);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Order not found");
    }

    const order = orderDoc.data()!;

    if (order.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    // Can only cancel if not shipped
    if (order.status === "shipped" || order.status === "delivered") {
      throw new ApiError(400, "CANNOT_CANCEL", "Cannot cancel shipped or delivered order");
    }

    if (order.status === "cancelled") {
      throw new ApiError(400, "ALREADY_CANCELLED", "Order is already cancelled");
    }

    // Restore product stocks
    await Promise.all(
      order.items.map(async (item: any) => {
        const productRef = getDb().collection("products").doc(item.productId);
        await productRef.update({
          stock: admin.firestore.FieldValue.increment(item.quantity),
          soldCount: admin.firestore.FieldValue.increment(-item.quantity),
        });
      })
    );

    const statusEntry = {
      status: "cancelled",
      timestamp: new Date().toISOString(),
      notes: reason || "Cancelled by user",
    };

    await orderRef.update({
      status: "cancelled",
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      cancelReason: reason || null,
      statusHistory: admin.firestore.FieldValue.arrayUnion(statusEntry),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v2/orders/:id/refund
 * Request refund
 */
router.post("/:id/refund", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;
    const { reason, amount } = req.body;

    if (!reason) {
      throw new ApiError(400, "VALIDATION_ERROR", "reason is required");
    }

    const orderRef = getDb().collection("orders").doc(id);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Order not found");
    }

    const order = orderDoc.data()!;

    if (order.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    if (order.paymentStatus !== "paid") {
      throw new ApiError(400, "CANNOT_REFUND", "Can only refund paid orders");
    }

    // Create refund request
    const refund = {
      orderId: id,
      customerId: order.customerId,
      pharmacyId: order.pharmacyId,
      amount: amount || order.total,
      reason,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const refundRef = await getDb().collection("refunds").add(refund);

    res.status(201).json({
      id: refundRef.id,
      ...refund,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export const ordersRouter = router;
