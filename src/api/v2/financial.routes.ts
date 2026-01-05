/**
 * 💰 Financial Routes - API v2
 * 
 * Gerenciamento financeiro centralizado
 */

import { Router, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { ApiError } from "../utils/api-error";

const router = Router();
const getDb = () => admin.firestore();

/**
 * GET /v2/financial/subscriptions
 * List subscriptions
 */
router.get("/subscriptions", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { userId, status, limit = 20, offset = 0 } = req.query;

    let query = getDb().collection("subscriptions").where("partnerId", "==", partnerId);

    if (userId) {
      query = query.where("userId", "==", userId);
    }

    if (status) {
      query = query.where("status", "==", status);
    }

    query = query
      .orderBy("createdAt", "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    const snapshot = await query.get();

    const subscriptions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      data: subscriptions,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: subscriptions.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/financial/subscriptions/:id
 * Get subscription by ID
 */
router.get("/subscriptions/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const subscriptionRef = getDb().collection("subscriptions").doc(id);
    const subscriptionDoc = await subscriptionRef.get();

    if (!subscriptionDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Subscription not found");
    }

    const subscription = subscriptionDoc.data()!;

    if (subscription.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    res.json({
      id: subscriptionDoc.id,
      ...subscription,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/financial/invoices
 * List invoices
 */
router.get("/invoices", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { userId, status, startDate, endDate, limit = 20, offset = 0 } = req.query;

    let query = getDb().collection("invoices").where("partnerId", "==", partnerId);

    if (userId) {
      query = query.where("userId", "==", userId);
    }

    if (status) {
      query = query.where("status", "==", status);
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

    const invoices = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      data: invoices,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: invoices.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/financial/refunds
 * List refunds
 */
router.get("/refunds", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { orderId, status, limit = 20, offset = 0 } = req.query;

    let query = getDb().collection("refunds").where("partnerId", "==", partnerId);

    if (orderId) {
      query = query.where("orderId", "==", orderId);
    }

    if (status) {
      query = query.where("status", "==", status);
    }

    query = query
      .orderBy("createdAt", "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    const snapshot = await query.get();

    const refunds = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      data: refunds,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: refunds.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v2/financial/refunds/:id/approve
 * Approve refund (admin only)
 */
router.post("/refunds/:id/approve", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;
    const { notes } = req.body;

    const refundRef = getDb().collection("refunds").doc(id);
    const refundDoc = await refundRef.get();

    if (!refundDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Refund not found");
    }

    const refund = refundDoc.data()!;

    if (refund.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    if (refund.status !== "pending") {
      throw new ApiError(400, "INVALID_STATUS", "Only pending refunds can be approved");
    }

    await refundRef.update({
      status: "approved",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: (req as any).userId || "admin",
      notes: notes || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update order
    if (refund.orderId) {
      await getDb().collection("orders").doc(refund.orderId).update({
        paymentStatus: "refunded",
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v2/financial/refunds/:id/reject
 * Reject refund (admin only)
 */
router.post("/refunds/:id/reject", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      throw new ApiError(400, "VALIDATION_ERROR", "reason is required");
    }

    const refundRef = getDb().collection("refunds").doc(id);
    const refundDoc = await refundRef.get();

    if (!refundDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Refund not found");
    }

    const refund = refundDoc.data()!;

    if (refund.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    if (refund.status !== "pending") {
      throw new ApiError(400, "INVALID_STATUS", "Only pending refunds can be rejected");
    }

    await refundRef.update({
      status: "rejected",
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectedBy: (req as any).userId || "admin",
      rejectionReason: reason,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/financial/stats
 * Financial statistics
 */
router.get("/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { startDate, endDate } = req.query;

    const now = new Date();
    const start = startDate ? new Date(String(startDate)) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(String(endDate)) : now;

    // Get orders
    const ordersSnapshot = await getDb()
      .collection("orders")
      .where("partnerId", "==", partnerId)
      .where("createdAt", ">=", start)
      .where("createdAt", "<=", end)
      .get();

    const orders = ordersSnapshot.docs.map((doc) => doc.data());

    // Calculate stats
    const totalOrders = orders.length;
    const completedOrders = orders.filter((o: any) => o.status === "delivered").length;
    const totalRevenue = orders
      .filter((o: any) => o.paymentStatus === "paid")
      .reduce((sum: number, o: any) => sum + (o.total || 0), 0);

    // Get subscriptions
    const subscriptionsSnapshot = await getDb()
      .collection("subscriptions")
      .where("partnerId", "==", partnerId)
      .where("status", "==", "active")
      .get();

    const activeSubscriptions = subscriptionsSnapshot.size;

    // Get refunds
    const refundsSnapshot = await getDb()
      .collection("refunds")
      .where("partnerId", "==", partnerId)
      .where("createdAt", ">=", start)
      .where("createdAt", "<=", end)
      .get();

    const refunds = refundsSnapshot.docs.map((doc) => doc.data());
    const totalRefunds = refunds.reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

    res.json({
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      stats: {
        totalOrders,
        completedOrders,
        totalRevenue,
        activeSubscriptions,
        totalRefunds,
        netRevenue: totalRevenue - totalRefunds,
      },
    });
  } catch (error) {
    next(error);
  }
});

export const financialRouter = router;
