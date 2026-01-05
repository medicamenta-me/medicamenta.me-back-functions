/**
 * 🔐 Admin Middleware
 * 
 * Middleware para validação de acesso administrativo.
 * Verifica se o usuário tem permissões de admin.
 * 
 * @module middleware/admin
 * @version 2.0.0
 */

import { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { ApiError } from "../utils/api-error";

/**
 * Roles de administrador
 */
export type AdminRole = "super_admin" | "admin" | "moderator" | "support";

/**
 * Interface do usuário admin na request
 */
export interface AdminUser {
  uid: string;
  email: string;
  role: AdminRole;
  permissions: string[];
  partnerId?: string;
}

/**
 * Extend Express Request para incluir admin info
 */
declare global {
  namespace Express {
    interface Request {
      admin?: AdminUser;
    }
  }
}

const getDb = () => admin.firestore();

/**
 * Middleware que exige autenticação de admin
 * 
 * @example
 * router.use(adminOnly);
 * 
 * @example
 * router.post("/approve", adminOnly, approvePharmacy);
 */
export async function adminOnly(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new ApiError(401, "UNAUTHORIZED", "Missing authorization header");
    }

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid authorization format");
    }

    // Verify Firebase ID token
    let decodedToken: admin.auth.DecodedIdToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (_error) {
      throw new ApiError(401, "INVALID_TOKEN", "Invalid or expired token");
    }

    // Check if user is admin in Firestore
    const adminDoc = await getDb()
      .collection("admins")
      .doc(decodedToken.uid)
      .get();

    if (!adminDoc.exists) {
      throw new ApiError(403, "FORBIDDEN", "Access denied. Admin privileges required.");
    }

    const adminData = adminDoc.data()!;

    // Check if admin is active
    if (adminData.status !== "active") {
      throw new ApiError(403, "ACCOUNT_SUSPENDED", "Admin account is suspended");
    }

    // Set admin info on request
    req.admin = {
      uid: decodedToken.uid,
      email: decodedToken.email || adminData.email,
      role: adminData.role as AdminRole,
      permissions: adminData.permissions || [],
      partnerId: adminData.partnerId,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware factory que exige uma role específica
 * 
 * @example
 * router.delete("/user/:id", requireRole("super_admin"), deleteUser);
 */
export function requireRole(...allowedRoles: AdminRole[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // First ensure admin authentication
      if (!req.admin) {
        await adminOnly(req, res, () => {});
      }

      if (!req.admin) {
        throw new ApiError(403, "FORBIDDEN", "Access denied");
      }

      // Check role
      if (!allowedRoles.includes(req.admin.role)) {
        throw new ApiError(
          403,
          "INSUFFICIENT_PERMISSIONS",
          `This action requires one of the following roles: ${allowedRoles.join(", ")}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware factory que exige uma permissão específica
 * 
 * @example
 * router.post("/refund", requirePermission("process_refunds"), processRefund);
 */
export function requirePermission(...requiredPermissions: string[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // First ensure admin authentication
      if (!req.admin) {
        await adminOnly(req, res, () => {});
      }

      if (!req.admin) {
        throw new ApiError(403, "FORBIDDEN", "Access denied");
      }

      // Super admins have all permissions
      if (req.admin.role === "super_admin") {
        return next();
      }

      // Check permissions
      const hasAllPermissions = requiredPermissions.every((permission) =>
        req.admin!.permissions.includes(permission)
      );

      if (!hasAllPermissions) {
        throw new ApiError(
          403,
          "INSUFFICIENT_PERMISSIONS",
          `This action requires the following permissions: ${requiredPermissions.join(", ")}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Lista de permissões disponíveis
 */
export const ADMIN_PERMISSIONS = {
  // Orders
  VIEW_ORDERS: "view_orders",
  MANAGE_ORDERS: "manage_orders",
  CANCEL_ORDERS: "cancel_orders",
  PROCESS_REFUNDS: "process_refunds",
  
  // Pharmacies
  VIEW_PHARMACIES: "view_pharmacies",
  APPROVE_PHARMACIES: "approve_pharmacies",
  SUSPEND_PHARMACIES: "suspend_pharmacies",
  
  // Products
  VIEW_PRODUCTS: "view_products",
  MANAGE_PRODUCTS: "manage_products",
  
  // Users
  VIEW_USERS: "view_users",
  MANAGE_USERS: "manage_users",
  
  // Financial
  VIEW_FINANCIAL: "view_financial",
  MANAGE_FINANCIAL: "manage_financial",
  
  // Audit
  VIEW_AUDIT: "view_audit",
  
  // System
  MANAGE_SYSTEM: "manage_system",
} as const;
