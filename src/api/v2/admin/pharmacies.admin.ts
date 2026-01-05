/**
 * 🏥 Admin Pharmacies Routes - API v2
 * 
 * Endpoints administrativos para gerenciamento de farmácias.
 * 
 * @module api/v2/admin/pharmacies
 * @version 2.0.0
 */

import { Router, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { ApiError } from "../../utils/api-error";
import { validateBody, validateQuery } from "../../middleware/validation";
import { 
  PharmacySearchSchema,
  ApprovePharmacySchema,
  SuspendPharmacySchema,
  RejectPharmacySchema,
  type ApprovePharmacyInput,
  type SuspendPharmacyInput,
  type RejectPharmacyInput,
} from "../schemas";
import { AuditService, AuditAction } from "../../services/audit.service";

const router = Router();
const getDb = () => admin.firestore();
const audit = new AuditService();

/**
 * GET /v2/admin/pharmacies
 * List all pharmacies (admin view)
 */
router.get("/", validateQuery(PharmacySearchSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = (req as any).validatedQuery;
    let firestoreQuery: admin.firestore.Query = getDb().collection("pharmacies");

    // Apply filters
    if (query.status) {
      firestoreQuery = firestoreQuery.where("status", "==", query.status);
    }
    if (query.city) {
      firestoreQuery = firestoreQuery.where("address.city", "==", query.city);
    }
    if (query.state) {
      firestoreQuery = firestoreQuery.where("address.state", "==", query.state);
    }
    if (query.hasDelivery !== undefined) {
      firestoreQuery = firestoreQuery.where("hasDelivery", "==", query.hasDelivery);
    }

    // Sorting and pagination
    firestoreQuery = firestoreQuery
      .orderBy(query.sortBy, query.sortOrder)
      .limit(query.limit)
      .offset(query.offset);

    const snapshot = await firestoreQuery.get();
    
    // Get total count
    const countSnapshot = await getDb().collection("pharmacies").count().get();
    const totalCount = countSnapshot.data().count;

    // Get pending count for dashboard
    const pendingSnapshot = await getDb()
      .collection("pharmacies")
      .where("status", "==", "pending")
      .count()
      .get();
    const pendingCount = pendingSnapshot.data().count;

    let pharmacies = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Client-side text search
    if (query.q) {
      const searchLower = String(query.q).toLowerCase();
      pharmacies = pharmacies.filter((p: any) =>
        p.name?.toLowerCase().includes(searchLower) ||
        p.cnpj?.includes(searchLower) ||
        p.email?.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      data: pharmacies,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: totalCount,
        hasMore: query.offset + pharmacies.length < totalCount,
      },
      stats: {
        pendingApproval: pendingCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/admin/pharmacies/pending
 * List pharmacies pending approval
 */
router.get("/pending", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const snapshot = await getDb()
      .collection("pharmacies")
      .where("status", "==", "pending")
      .orderBy("createdAt", "asc") // Oldest first
      .limit(Number(limit))
      .offset(Number(offset))
      .get();

    const pharmacies = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      data: pharmacies,
      total: pharmacies.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/admin/pharmacies/stats
 * Get pharmacy statistics
 */
router.get("/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      totalSnapshot,
      activeSnapshot,
      pendingSnapshot,
      suspendedSnapshot,
    ] = await Promise.all([
      getDb().collection("pharmacies").count().get(),
      getDb().collection("pharmacies").where("status", "==", "active").count().get(),
      getDb().collection("pharmacies").where("status", "==", "pending").count().get(),
      getDb().collection("pharmacies").where("status", "==", "suspended").count().get(),
    ]);

    res.json({
      total: totalSnapshot.data().count,
      active: activeSnapshot.data().count,
      pending: pendingSnapshot.data().count,
      suspended: suspendedSnapshot.data().count,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/admin/pharmacies/:id
 * Get pharmacy details (admin view)
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const pharmacyDoc = await getDb().collection("pharmacies").doc(id).get();

    if (!pharmacyDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Pharmacy not found");
    }

    const pharmacy = pharmacyDoc.data()!;

    // Get related data
    const [productsCount, ordersCount, recentOrders] = await Promise.all([
      getDb().collection("products").where("pharmacyId", "==", id).count().get(),
      getDb().collection("orders").where("pharmacyId", "==", id).count().get(),
      getDb()
        .collection("orders")
        .where("pharmacyId", "==", id)
        .orderBy("createdAt", "desc")
        .limit(5)
        .get(),
    ]);

    res.json({
      id: pharmacyDoc.id,
      ...pharmacy,
      stats: {
        totalProducts: productsCount.data().count,
        totalOrders: ordersCount.data().count,
      },
      recentOrders: recentOrders.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v2/admin/pharmacies/:id/approve
 * Approve pharmacy registration
 */
router.post(
  "/:id/approve",
  validateBody(ApprovePharmacySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body: ApprovePharmacyInput = req.body;
      const adminUser = req.admin!;

      const pharmacyRef = getDb().collection("pharmacies").doc(id);
      const pharmacyDoc = await pharmacyRef.get();

      if (!pharmacyDoc.exists) {
        throw new ApiError(404, "NOT_FOUND", "Pharmacy not found");
      }

      const pharmacy = pharmacyDoc.data()!;

      if (pharmacy.status === "active") {
        throw new ApiError(400, "ALREADY_APPROVED", "Pharmacy is already approved");
      }

      // Update pharmacy status
      await pharmacyRef.update({
        status: "active",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: adminUser.uid,
        approvalNotes: body.notes || null,
        reviewedDocuments: body.reviewedDocuments || [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: "active",
          previousStatus: pharmacy.status,
          timestamp: new Date().toISOString(),
          changedBy: adminUser.uid,
          changedByEmail: adminUser.email,
          notes: body.notes,
        }),
      });

      // Audit log
      await audit.log({
        action: AuditAction.PHARMACY_APPROVED,
        adminId: adminUser.uid,
        adminEmail: adminUser.email,
        targetType: "pharmacy",
        targetId: id,
        details: {
          pharmacyName: pharmacy.name,
          previousStatus: pharmacy.status,
          notes: body.notes,
        },
      });

      // TODO: Send notification email to pharmacy

      res.json({
        success: true,
        message: "Pharmacy approved successfully",
        pharmacyId: id,
        pharmacyName: pharmacy.name,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /v2/admin/pharmacies/:id/suspend
 * Suspend pharmacy
 */
router.post(
  "/:id/suspend",
  validateBody(SuspendPharmacySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body: SuspendPharmacyInput = req.body;
      const adminUser = req.admin!;

      const pharmacyRef = getDb().collection("pharmacies").doc(id);
      const pharmacyDoc = await pharmacyRef.get();

      if (!pharmacyDoc.exists) {
        throw new ApiError(404, "NOT_FOUND", "Pharmacy not found");
      }

      const pharmacy = pharmacyDoc.data()!;

      if (pharmacy.status === "suspended") {
        throw new ApiError(400, "ALREADY_SUSPENDED", "Pharmacy is already suspended");
      }

      // Update pharmacy status
      const updateData: any = {
        status: "suspended",
        suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
        suspendedBy: adminUser.uid,
        suspendReason: body.reason,
        suspendDuration: body.duration,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: "suspended",
          previousStatus: pharmacy.status,
          timestamp: new Date().toISOString(),
          changedBy: adminUser.uid,
          changedByEmail: adminUser.email,
          reason: body.reason,
          duration: body.duration,
        }),
      };

      if (body.duration === "temporary" && body.endDate) {
        updateData.suspendEndDate = new Date(body.endDate);
      }

      await pharmacyRef.update(updateData);

      // Audit log
      await audit.log({
        action: AuditAction.PHARMACY_SUSPENDED,
        adminId: adminUser.uid,
        adminEmail: adminUser.email,
        targetType: "pharmacy",
        targetId: id,
        details: {
          pharmacyName: pharmacy.name,
          previousStatus: pharmacy.status,
          reason: body.reason,
          duration: body.duration,
        },
      });

      // TODO: Send notification email to pharmacy if notifyPharmacy

      res.json({
        success: true,
        message: "Pharmacy suspended successfully",
        pharmacyId: id,
        pharmacyName: pharmacy.name,
        duration: body.duration,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /v2/admin/pharmacies/:id/reject
 * Reject pharmacy registration
 */
router.post(
  "/:id/reject",
  validateBody(RejectPharmacySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body: RejectPharmacyInput = req.body;
      const adminUser = req.admin!;

      const pharmacyRef = getDb().collection("pharmacies").doc(id);
      const pharmacyDoc = await pharmacyRef.get();

      if (!pharmacyDoc.exists) {
        throw new ApiError(404, "NOT_FOUND", "Pharmacy not found");
      }

      const pharmacy = pharmacyDoc.data()!;

      if (pharmacy.status !== "pending") {
        throw new ApiError(400, "INVALID_STATUS", "Can only reject pending pharmacies");
      }

      // Update pharmacy status
      await pharmacyRef.update({
        status: "rejected",
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectedBy: adminUser.uid,
        rejectReason: body.reason,
        canReapply: body.canReapply,
        reapplyAfterDate: body.canReapply 
          ? new Date(Date.now() + body.reapplyAfterDays * 24 * 60 * 60 * 1000) 
          : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: "rejected",
          previousStatus: pharmacy.status,
          timestamp: new Date().toISOString(),
          changedBy: adminUser.uid,
          changedByEmail: adminUser.email,
          reason: body.reason,
        }),
      });

      // Audit log
      await audit.log({
        action: AuditAction.PHARMACY_REJECTED,
        adminId: adminUser.uid,
        adminEmail: adminUser.email,
        targetType: "pharmacy",
        targetId: id,
        details: {
          pharmacyName: pharmacy.name,
          reason: body.reason,
          canReapply: body.canReapply,
        },
      });

      // TODO: Send notification email to pharmacy

      res.json({
        success: true,
        message: "Pharmacy registration rejected",
        pharmacyId: id,
        pharmacyName: pharmacy.name,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /v2/admin/pharmacies/:id/reactivate
 * Reactivate suspended pharmacy
 */
router.post("/:id/reactivate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const adminUser = req.admin!;

    const pharmacyRef = getDb().collection("pharmacies").doc(id);
    const pharmacyDoc = await pharmacyRef.get();

    if (!pharmacyDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Pharmacy not found");
    }

    const pharmacy = pharmacyDoc.data()!;

    if (pharmacy.status !== "suspended") {
      throw new ApiError(400, "INVALID_STATUS", "Can only reactivate suspended pharmacies");
    }

    // Update pharmacy status
    await pharmacyRef.update({
      status: "active",
      reactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
      reactivatedBy: adminUser.uid,
      reactivationNotes: notes || null,
      suspendEndDate: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      statusHistory: admin.firestore.FieldValue.arrayUnion({
        status: "active",
        previousStatus: "suspended",
        timestamp: new Date().toISOString(),
        changedBy: adminUser.uid,
        changedByEmail: adminUser.email,
        notes: notes || "Reactivated",
      }),
    });

    // Audit log
    await audit.log({
      action: AuditAction.PHARMACY_APPROVED, // Reusing as "reactivated"
      adminId: adminUser.uid,
      adminEmail: adminUser.email,
      targetType: "pharmacy",
      targetId: id,
      details: {
        pharmacyName: pharmacy.name,
        previousStatus: "suspended",
        action: "reactivated",
        notes,
      },
    });

    res.json({
      success: true,
      message: "Pharmacy reactivated successfully",
      pharmacyId: id,
      pharmacyName: pharmacy.name,
    });
  } catch (error) {
    next(error);
  }
});

export const pharmaciesAdminRouter = router;
