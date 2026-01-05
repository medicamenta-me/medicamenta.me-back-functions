/**
 * 🛒 Admin Orders Routes - API v2
 * 
 * Endpoints administrativos para gerenciamento de pedidos.
 * 
 * @module api/v2/admin/orders
 * @version 2.0.0
 */

import { Router, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { ApiError } from "../../utils/api-error";
import { validateBody, validateQuery } from "../../middleware/validation";
import { 
  UpdateOrderStatusSchema,
  CancelOrderSchema,
  RequestRefundSchema,
  OrderQuerySchema,
  type UpdateOrderStatusInput,
  type CancelOrderInput,
  type RequestRefundInput,
} from "../schemas";
import { AuditService, AuditAction } from "../../services/audit.service";

const router = Router();
const getDb = () => admin.firestore();
const audit = new AuditService();

/**
 * GET /v2/admin/orders
 * List all orders (admin view - no partner filter)
 */
router.get("/", validateQuery(OrderQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = (req as any).validatedQuery;
    let firestoreQuery: admin.firestore.Query = getDb().collection("orders");

    // Apply filters
    if (query.customerId) {
      firestoreQuery = firestoreQuery.where("customerId", "==", query.customerId);
    }
    if (query.pharmacyId) {
      firestoreQuery = firestoreQuery.where("pharmacyId", "==", query.pharmacyId);
    }
    if (query.status) {
      firestoreQuery = firestoreQuery.where("status", "==", query.status);
    }
    if (query.paymentStatus) {
      firestoreQuery = firestoreQuery.where("paymentStatus", "==", query.paymentStatus);
    }
    if (query.startDate) {
      firestoreQuery = firestoreQuery.where("createdAt", ">=", new Date(query.startDate));
    }
    if (query.endDate) {
      firestoreQuery = firestoreQuery.where("createdAt", "<=", new Date(query.endDate));
    }

    // Sorting and pagination
    firestoreQuery = firestoreQuery
      .orderBy(query.sortBy, query.sortOrder)
      .limit(query.limit)
      .offset(query.offset);

    const snapshot = await firestoreQuery.get();
    
    // Get total count (for pagination)
    const countSnapshot = await getDb().collection("orders").count().get();
    const totalCount = countSnapshot.data().count;

    const orders = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Apply client-side filters for total range
    let filteredOrders = orders;
    if (query.minTotal) {
      filteredOrders = filteredOrders.filter((o: any) => o.total >= query.minTotal);
    }
    if (query.maxTotal) {
      filteredOrders = filteredOrders.filter((o: any) => o.total <= query.maxTotal);
    }

    res.json({
      data: filteredOrders,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: totalCount,
        hasMore: query.offset + orders.length < totalCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/admin/orders/stats
 * Get order statistics (dashboard)
 */
router.get("/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { period = "today" } = req.query;
    
    let startDate: Date;
    const now = new Date();
    
    switch (period) {
    case "today":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    // Get orders in period
    const ordersSnapshot = await getDb()
      .collection("orders")
      .where("createdAt", ">=", startDate)
      .get();

    const orders = ordersSnapshot.docs.map(doc => doc.data());

    // Calculate stats
    const stats = {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum: number, o: any) => sum + (o.total || 0), 0),
      averageOrderValue: orders.length > 0 
        ? orders.reduce((sum: number, o: any) => sum + (o.total || 0), 0) / orders.length 
        : 0,
      ordersByStatus: {
        pending: orders.filter((o: any) => o.status === "pending").length,
        confirmed: orders.filter((o: any) => o.status === "confirmed").length,
        preparing: orders.filter((o: any) => o.status === "preparing").length,
        shipped: orders.filter((o: any) => o.status === "shipped").length,
        delivered: orders.filter((o: any) => o.status === "delivered").length,
        cancelled: orders.filter((o: any) => o.status === "cancelled").length,
      },
      ordersByPaymentStatus: {
        pending: orders.filter((o: any) => o.paymentStatus === "pending").length,
        paid: orders.filter((o: any) => o.paymentStatus === "paid").length,
        failed: orders.filter((o: any) => o.paymentStatus === "failed").length,
        refunded: orders.filter((o: any) => o.paymentStatus === "refunded").length,
      },
      period: String(period),
      periodStart: startDate.toISOString(),
      periodEnd: now.toISOString(),
    };

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/admin/orders/:id
 * Get order details (admin view)
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const orderDoc = await getDb().collection("orders").doc(id).get();

    if (!orderDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Order not found");
    }

    const order = orderDoc.data()!;

    // Fetch related data
    const [customerDoc, pharmacyDoc] = await Promise.all([
      getDb().collection("customers").doc(order.customerId).get(),
      getDb().collection("pharmacies").doc(order.pharmacyId).get(),
    ]);

    res.json({
      id: orderDoc.id,
      ...order,
      customer: customerDoc.exists ? { id: customerDoc.id, ...customerDoc.data() } : null,
      pharmacy: pharmacyDoc.exists ? { id: pharmacyDoc.id, ...pharmacyDoc.data() } : null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /v2/admin/orders/:id/status
 * Update order status (admin)
 */
router.patch(
  "/:id/status",
  validateBody(UpdateOrderStatusSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body: UpdateOrderStatusInput = req.body;
      const adminUser = req.admin!;

      const orderRef = getDb().collection("orders").doc(id);
      const orderDoc = await orderRef.get();

      if (!orderDoc.exists) {
        throw new ApiError(404, "NOT_FOUND", "Order not found");
      }

      const order = orderDoc.data()!;
      const previousStatus = order.status;

      // Create status history entry
      const statusEntry = {
        status: body.status,
        previousStatus,
        timestamp: new Date().toISOString(),
        notes: body.notes || null,
        updatedBy: adminUser.uid,
        updatedByEmail: adminUser.email,
      };

      // Update order
      const updateData: any = {
        status: body.status,
        statusHistory: admin.firestore.FieldValue.arrayUnion(statusEntry),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdatedBy: adminUser.uid,
      };

      if (body.trackingCode) {
        updateData.trackingCode = body.trackingCode;
      }
      if (body.estimatedDeliveryDate) {
        updateData.estimatedDeliveryDate = new Date(body.estimatedDeliveryDate);
      }

      await orderRef.update(updateData);

      // Audit log
      await audit.log({
        action: AuditAction.ORDER_STATUS_CHANGED,
        adminId: adminUser.uid,
        adminEmail: adminUser.email,
        targetType: "order",
        targetId: id,
        details: {
          previousStatus,
          newStatus: body.status,
          notes: body.notes,
        },
      });

      // TODO: Send notification to customer if notifyCustomer is true

      const updatedDoc = await orderRef.get();

      res.json({
        success: true,
        order: {
          id: updatedDoc.id,
          ...updatedDoc.data(),
        },
        previousStatus,
        newStatus: body.status,
        notificationSent: body.notifyCustomer,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /v2/admin/orders/:id/cancel
 * Cancel order (admin)
 */
router.post(
  "/:id/cancel",
  validateBody(CancelOrderSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body: CancelOrderInput = req.body;
      const adminUser = req.admin!;

      const orderRef = getDb().collection("orders").doc(id);
      const orderDoc = await orderRef.get();

      if (!orderDoc.exists) {
        throw new ApiError(404, "NOT_FOUND", "Order not found");
      }

      const order = orderDoc.data()!;

      if (order.status === "cancelled") {
        throw new ApiError(400, "ALREADY_CANCELLED", "Order is already cancelled");
      }

      if (order.status === "delivered") {
        throw new ApiError(400, "CANNOT_CANCEL", "Cannot cancel delivered order");
      }

      // Restore product stocks
      const batch = getDb().batch();
      
      for (const item of order.items) {
        const productRef = getDb().collection("products").doc(item.productId);
        batch.update(productRef, {
          stock: admin.firestore.FieldValue.increment(item.quantity),
          soldCount: admin.firestore.FieldValue.increment(-item.quantity),
        });
      }

      // Update order
      const statusEntry = {
        status: "cancelled",
        previousStatus: order.status,
        timestamp: new Date().toISOString(),
        notes: body.reason,
        cancelledBy: body.cancelledBy || "admin",
        updatedBy: adminUser.uid,
        updatedByEmail: adminUser.email,
      };

      batch.update(orderRef, {
        status: "cancelled",
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelReason: body.reason,
        cancelledBy: body.cancelledBy || "admin",
        refundRequested: body.refundRequested,
        statusHistory: admin.firestore.FieldValue.arrayUnion(statusEntry),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdatedBy: adminUser.uid,
      });

      await batch.commit();

      // Audit log
      await audit.log({
        action: AuditAction.ORDER_CANCELLED,
        adminId: adminUser.uid,
        adminEmail: adminUser.email,
        targetType: "order",
        targetId: id,
        details: {
          reason: body.reason,
          cancelledBy: body.cancelledBy || "admin",
          refundRequested: body.refundRequested,
          previousStatus: order.status,
        },
      });

      res.json({
        success: true,
        message: "Order cancelled successfully",
        refundRequested: body.refundRequested,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /v2/admin/orders/:id/refund
 * Process refund (admin)
 */
router.post(
  "/:id/refund",
  validateBody(RequestRefundSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body: RequestRefundInput = req.body;
      const adminUser = req.admin!;

      const orderRef = getDb().collection("orders").doc(id);
      const orderDoc = await orderRef.get();

      if (!orderDoc.exists) {
        throw new ApiError(404, "NOT_FOUND", "Order not found");
      }

      const order = orderDoc.data()!;

      if (order.paymentStatus !== "paid") {
        throw new ApiError(400, "CANNOT_REFUND", "Can only refund paid orders");
      }

      // Create refund record
      const refundAmount = body.amount || order.total;
      const isPartialRefund = body.amount && body.amount < order.total;

      const refund = {
        orderId: id,
        customerId: order.customerId,
        pharmacyId: order.pharmacyId,
        amount: refundAmount,
        originalOrderTotal: order.total,
        isPartialRefund,
        reason: body.reason,
        refundMethod: body.refundMethod,
        itemsToRefund: body.itemsToRefund || null,
        status: "pending",
        requestedBy: adminUser.uid,
        requestedByEmail: adminUser.email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const refundRef = await getDb().collection("refunds").add(refund);

      // Update order
      await orderRef.update({
        refundId: refundRef.id,
        refundStatus: "pending",
        refundAmount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdatedBy: adminUser.uid,
      });

      // Audit log
      await audit.log({
        action: AuditAction.REFUND_PROCESSED,
        adminId: adminUser.uid,
        adminEmail: adminUser.email,
        targetType: "order",
        targetId: id,
        details: {
          refundId: refundRef.id,
          amount: refundAmount,
          reason: body.reason,
          isPartialRefund,
        },
      });

      res.status(201).json({
        success: true,
        refund: {
          id: refundRef.id,
          ...refund,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export const ordersAdminRouter = router;
