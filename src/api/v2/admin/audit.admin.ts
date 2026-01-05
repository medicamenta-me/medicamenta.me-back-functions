/**
 * 📋 Admin Audit Routes - API v2
 * 
 * Endpoints administrativos para visualização de logs de auditoria.
 * 
 * @module api/v2/admin/audit
 * @version 2.0.0
 */

import { Router, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { z } from "zod";
import { ApiError } from "../../utils/api-error";
import { validateQuery } from "../../middleware/validation";
import { requireRole, ADMIN_PERMISSIONS, requirePermission } from "../../middleware/admin";

const router = Router();
const getDb = () => admin.firestore();

// ============================================
// Query Schemas
// ============================================

const AuditQuerySchema = z.object({
  adminId: z.string().optional(),
  adminEmail: z.string().optional(),
  action: z.string().optional(),
  targetType: z.enum(["order", "pharmacy", "product", "user", "system"]).optional(),
  targetId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const ExportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  adminId: z.string().optional(),
  action: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
});

// ============================================
// Routes
// ============================================

/**
 * GET /v2/admin/audit
 * List audit logs
 */
router.get(
  "/",
  requirePermission(ADMIN_PERMISSIONS.VIEW_AUDIT),
  validateQuery(AuditQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = (req as any).validatedQuery;
      let firestoreQuery: admin.firestore.Query = getDb().collection("audit_logs");

      // Apply filters
      if (query.adminId) {
        firestoreQuery = firestoreQuery.where("adminId", "==", query.adminId);
      }
      if (query.adminEmail) {
        firestoreQuery = firestoreQuery.where("adminEmail", "==", query.adminEmail);
      }
      if (query.action) {
        firestoreQuery = firestoreQuery.where("action", "==", query.action);
      }
      if (query.targetType) {
        firestoreQuery = firestoreQuery.where("targetType", "==", query.targetType);
      }
      if (query.targetId) {
        firestoreQuery = firestoreQuery.where("targetId", "==", query.targetId);
      }
      if (query.startDate) {
        firestoreQuery = firestoreQuery.where("timestamp", ">=", new Date(query.startDate));
      }
      if (query.endDate) {
        firestoreQuery = firestoreQuery.where("timestamp", "<=", new Date(query.endDate));
      }

      // Sorting and pagination
      firestoreQuery = firestoreQuery
        .orderBy("timestamp", query.sortOrder)
        .limit(query.limit)
        .offset(query.offset);

      const snapshot = await firestoreQuery.get();

      // Get total count
      const countSnapshot = await getDb().collection("audit_logs").count().get();
      const totalCount = countSnapshot.data().count;

      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json({
        data: logs,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: totalCount,
          hasMore: query.offset + logs.length < totalCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /v2/admin/audit/stats
 * Get audit statistics
 */
router.get(
  "/stats",
  requirePermission(ADMIN_PERMISSIONS.VIEW_AUDIT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { period = "week" } = req.query;

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
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      const snapshot = await getDb()
        .collection("audit_logs")
        .where("timestamp", ">=", startDate)
        .get();

      const logs = snapshot.docs.map(doc => doc.data());

      // Calculate stats
      const actionCounts: Record<string, number> = {};
      const targetTypeCounts: Record<string, number> = {};
      const adminCounts: Record<string, number> = {};

      logs.forEach((log: any) => {
        actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
        targetTypeCounts[log.targetType] = (targetTypeCounts[log.targetType] || 0) + 1;
        if (log.adminEmail) {
          adminCounts[log.adminEmail] = (adminCounts[log.adminEmail] || 0) + 1;
        }
      });

      res.json({
        period: String(period),
        periodStart: startDate.toISOString(),
        periodEnd: now.toISOString(),
        totalActions: logs.length,
        byAction: actionCounts,
        byTargetType: targetTypeCounts,
        byAdmin: adminCounts,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /v2/admin/audit/actions
 * List available audit actions
 */
router.get("/actions", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const actions = [
      // Orders
      { code: "ORDER_CREATED", category: "orders", description: "New order created" },
      { code: "ORDER_STATUS_CHANGED", category: "orders", description: "Order status updated" },
      { code: "ORDER_CANCELLED", category: "orders", description: "Order cancelled" },
      { code: "REFUND_PROCESSED", category: "orders", description: "Refund processed" },
      
      // Pharmacies
      { code: "PHARMACY_APPROVED", category: "pharmacies", description: "Pharmacy approved" },
      { code: "PHARMACY_SUSPENDED", category: "pharmacies", description: "Pharmacy suspended" },
      { code: "PHARMACY_REJECTED", category: "pharmacies", description: "Pharmacy rejected" },
      
      // Products
      { code: "PRODUCT_CREATED", category: "products", description: "Product created" },
      { code: "PRODUCT_UPDATED", category: "products", description: "Product updated" },
      { code: "PRODUCT_DELETED", category: "products", description: "Product deleted" },
      
      // Users
      { code: "USER_CREATED", category: "users", description: "User created" },
      { code: "USER_UPDATED", category: "users", description: "User updated" },
      { code: "USER_SUSPENDED", category: "users", description: "User suspended" },
      { code: "ROLE_ASSIGNED", category: "users", description: "Role assigned" },
      { code: "ROLE_REVOKED", category: "users", description: "Role revoked" },
    ];

    res.json({ actions });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/admin/audit/export
 * Export audit logs
 */
router.get(
  "/export",
  requireRole("super_admin", "admin"),
  validateQuery(ExportQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = (req as any).validatedQuery;
      let firestoreQuery: admin.firestore.Query = getDb().collection("audit_logs");

      // Apply filters
      if (query.adminId) {
        firestoreQuery = firestoreQuery.where("adminId", "==", query.adminId);
      }
      if (query.action) {
        firestoreQuery = firestoreQuery.where("action", "==", query.action);
      }
      if (query.startDate) {
        firestoreQuery = firestoreQuery.where("timestamp", ">=", new Date(query.startDate));
      }
      if (query.endDate) {
        firestoreQuery = firestoreQuery.where("timestamp", "<=", new Date(query.endDate));
      }

      firestoreQuery = firestoreQuery
        .orderBy("timestamp", "desc")
        .limit(query.limit);

      const snapshot = await firestoreQuery.get();

      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.()?.toISOString() || doc.data().timestamp,
      }));

      if (query.format === "csv") {
        // Generate CSV
        const headers = ["id", "timestamp", "action", "adminId", "adminEmail", "targetType", "targetId"];
        const csvRows = [headers.join(",")];

        logs.forEach((log: any) => {
          const row = headers.map(h => {
            const value = log[h];
            if (value === undefined || value === null) return "";
            const strValue = String(value);
            // Escape quotes and wrap in quotes if contains comma
            if (strValue.includes(",") || strValue.includes("\"")) {
              return `"${strValue.replace(/"/g, "\"\"")}"`;
            }
            return strValue;
          });
          csvRows.push(row.join(","));
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=audit-logs-${Date.now()}.csv`);
        res.send(csvRows.join("\n"));
      } else {
        // JSON format
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename=audit-logs-${Date.now()}.json`);
        res.json({
          exportedAt: new Date().toISOString(),
          total: logs.length,
          data: logs,
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /v2/admin/audit/:id
 * Get single audit log entry
 */
router.get(
  "/:id",
  requirePermission(ADMIN_PERMISSIONS.VIEW_AUDIT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const auditDoc = await getDb().collection("audit_logs").doc(id).get();

      if (!auditDoc.exists) {
        throw new ApiError(404, "NOT_FOUND", "Audit log not found");
      }

      res.json({
        id: auditDoc.id,
        ...auditDoc.data(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /v2/admin/audit/target/:type/:id
 * Get all audit logs for a specific target (order, pharmacy, etc.)
 */
router.get(
  "/target/:type/:id",
  requirePermission(ADMIN_PERMISSIONS.VIEW_AUDIT),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, id } = req.params;
      const { limit = 50 } = req.query;

      const snapshot = await getDb()
        .collection("audit_logs")
        .where("targetType", "==", type)
        .where("targetId", "==", id)
        .orderBy("timestamp", "desc")
        .limit(Number(limit))
        .get();

      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json({
        targetType: type,
        targetId: id,
        total: logs.length,
        data: logs,
      });
    } catch (error) {
      next(error);
    }
  }
);

export const auditAdminRouter = router;
