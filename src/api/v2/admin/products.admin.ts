/**
 * 💊 Admin Products Routes - API v2
 * 
 * Endpoints administrativos para gerenciamento de produtos.
 * 
 * @module api/v2/admin/products
 * @version 2.0.0
 */

import { Router, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { ApiError } from "../../utils/api-error";
import { validateBody, validateQuery } from "../../middleware/validation";
import { 
  ProductSearchSchema,
  UpdateProductSchema,
  BulkUpdateProductsSchema,
  type UpdateProductInput,
  type BulkUpdateProductsInput,
} from "../schemas";
import { AuditService, AuditAction } from "../../services/audit.service";

const router = Router();
const getDb = () => admin.firestore();
const audit = new AuditService();

/**
 * GET /v2/admin/products
 * List all products (admin view)
 */
router.get("/", validateQuery(ProductSearchSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = (req as any).validatedQuery;
    let firestoreQuery: admin.firestore.Query = getDb().collection("products");

    // Apply filters
    if (query.category) {
      firestoreQuery = firestoreQuery.where("category", "==", query.category);
    }
    if (query.pharmacyId) {
      firestoreQuery = firestoreQuery.where("pharmacyId", "==", query.pharmacyId);
    }
    if (query.inStock !== undefined) {
      if (query.inStock) {
        firestoreQuery = firestoreQuery.where("stock", ">", 0);
      } else {
        firestoreQuery = firestoreQuery.where("stock", "==", 0);
      }
    }
    if (query.requiresPrescription !== undefined) {
      firestoreQuery = firestoreQuery.where("requiresPrescription", "==", query.requiresPrescription);
    }

    // Sorting and pagination
    firestoreQuery = firestoreQuery
      .orderBy(query.sortBy, query.sortOrder)
      .limit(query.limit)
      .offset(query.offset);

    const snapshot = await firestoreQuery.get();
    
    // Get total count
    const countSnapshot = await getDb().collection("products").count().get();
    const totalCount = countSnapshot.data().count;

    let products = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Client-side text search and price filters
    if (query.q) {
      const searchLower = String(query.q).toLowerCase();
      products = products.filter((p: any) =>
        p.name?.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower) ||
        p.activeIngredient?.toLowerCase().includes(searchLower) ||
        p.sku?.toLowerCase().includes(searchLower)
      );
    }
    if (query.minPrice !== undefined) {
      products = products.filter((p: any) => p.price >= query.minPrice);
    }
    if (query.maxPrice !== undefined) {
      products = products.filter((p: any) => p.price <= query.maxPrice);
    }
    if (query.manufacturer) {
      const mfgLower = String(query.manufacturer).toLowerCase();
      products = products.filter((p: any) => 
        p.manufacturer?.toLowerCase().includes(mfgLower)
      );
    }

    res.json({
      data: products,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: totalCount,
        hasMore: query.offset + products.length < totalCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/admin/products/stats
 * Get product statistics
 */
router.get("/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      totalSnapshot,
      activeSnapshot,
      outOfStockSnapshot,
      prescriptionSnapshot,
    ] = await Promise.all([
      getDb().collection("products").count().get(),
      getDb().collection("products").where("stock", ">", 0).count().get(),
      getDb().collection("products").where("stock", "==", 0).count().get(),
      getDb().collection("products").where("requiresPrescription", "==", true).count().get(),
    ]);

    // Get category breakdown
    const allProducts = await getDb().collection("products").select("category").get();
    const categoryCount: Record<string, number> = {};
    allProducts.docs.forEach(doc => {
      const cat = doc.data().category || "other";
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    res.json({
      total: totalSnapshot.data().count,
      inStock: activeSnapshot.data().count,
      outOfStock: outOfStockSnapshot.data().count,
      requiresPrescription: prescriptionSnapshot.data().count,
      byCategory: categoryCount,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/admin/products/low-stock
 * List products with low stock
 */
router.get("/low-stock", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { threshold = 10, limit = 50 } = req.query;

    const snapshot = await getDb()
      .collection("products")
      .where("stock", "<=", Number(threshold))
      .where("stock", ">", 0)
      .orderBy("stock", "asc")
      .limit(Number(limit))
      .get();

    const products = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      data: products,
      total: products.length,
      threshold: Number(threshold),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/admin/products/:id
 * Get product details (admin view)
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const productDoc = await getDb().collection("products").doc(id).get();

    if (!productDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Product not found");
    }

    const product = productDoc.data()!;

    // Get pharmacy info
    const pharmacyDoc = await getDb()
      .collection("pharmacies")
      .doc(product.pharmacyId)
      .get();

    // Get recent orders containing this product
    const recentOrders = await getDb()
      .collection("orders")
      .where("items", "array-contains", { productId: id })
      .orderBy("createdAt", "desc")
      .limit(10)
      .get()
      .catch(() => ({ docs: [] })); // Fallback if index doesn't exist

    res.json({
      id: productDoc.id,
      ...product,
      pharmacy: pharmacyDoc.exists ? { id: pharmacyDoc.id, ...pharmacyDoc.data() } : null,
      recentOrders: recentOrders.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /v2/admin/products/bulk
 * Bulk update products
 * NOTE: Esta rota DEVE vir antes de /:id para evitar conflitos
 */
router.patch(
  "/bulk",
  validateBody(BulkUpdateProductsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body: BulkUpdateProductsInput = req.body;
      const adminUser = req.admin!;

      const batch = getDb().batch();
      const results: { id: string; success: boolean; error?: string }[] = [];

      for (const productId of body.productIds) {
        const productRef = getDb().collection("products").doc(productId);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
          results.push({ id: productId, success: false, error: "Not found" });
          continue;
        }

        batch.update(productRef, {
          ...body.updates,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdatedBy: adminUser.uid,
        });

        results.push({ id: productId, success: true });
      }

      await batch.commit();

      // Audit log
      await audit.log({
        action: AuditAction.PRODUCT_UPDATED,
        adminId: adminUser.uid,
        adminEmail: adminUser.email,
        targetType: "product",
        targetId: "bulk",
        details: {
          productIds: body.productIds,
          updates: body.updates,
          successCount: results.filter(r => r.success).length,
          failCount: results.filter(r => !r.success).length,
        },
      });

      res.json({
        success: true,
        results,
        summary: {
          total: body.productIds.length,
          success: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /v2/admin/products/:id
 * Update product (admin)
 */
router.patch(
  "/:id",
  validateBody(UpdateProductSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const body: UpdateProductInput = req.body;
      const adminUser = req.admin!;

      const productRef = getDb().collection("products").doc(id);
      const productDoc = await productRef.get();

      if (!productDoc.exists) {
        throw new ApiError(404, "NOT_FOUND", "Product not found");
      }

      const product = productDoc.data()!;

      // Update product
      const updateData = {
        ...body,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdatedBy: adminUser.uid,
      };

      await productRef.update(updateData);

      // Audit log
      await audit.log({
        action: AuditAction.PRODUCT_UPDATED,
        adminId: adminUser.uid,
        adminEmail: adminUser.email,
        targetType: "product",
        targetId: id,
        details: {
          productName: product.name,
          changes: Object.keys(body),
        },
      });

      const updatedDoc = await productRef.get();

      res.json({
        success: true,
        product: {
          id: updatedDoc.id,
          ...updatedDoc.data(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /v2/admin/products/:id
 * Delete product (admin)
 */
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const adminUser = req.admin!;

    const productRef = getDb().collection("products").doc(id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Product not found");
    }

    const product = productDoc.data()!;

    // Soft delete - just mark as inactive
    await productRef.update({
      status: "discontinued",
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: adminUser.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Audit log
    await audit.log({
      action: AuditAction.PRODUCT_DELETED,
      adminId: adminUser.uid,
      adminEmail: adminUser.email,
      targetType: "product",
      targetId: id,
      details: {
        productName: product.name,
        pharmacyId: product.pharmacyId,
      },
    });

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

export const productsAdminRouter = router;
