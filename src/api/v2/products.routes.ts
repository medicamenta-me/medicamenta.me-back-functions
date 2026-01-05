/**
 * 💊 Products Routes - API v2
 * 
 * Gerenciamento de produtos do Marketplace
 */

import { Router, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { ApiError } from "../utils/api-error";

const router = Router();
const getDb = () => admin.firestore();

/**
 * GET /v2/products
 * List and search products
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const {
      q, // search query
      category,
      pharmacyId,
      minPrice,
      maxPrice,
      inStock,
      requiresPrescription,
      sortBy = "createdAt",
      sortOrder = "desc",
      limit = 20,
      offset = 0,
    } = req.query;

    let query = getDb().collection("products").where("partnerId", "==", partnerId);

    // Filters
    if (category) {
      query = query.where("category", "==", category);
    }

    if (pharmacyId) {
      query = query.where("pharmacyId", "==", pharmacyId);
    }

    if (inStock === "true") {
      query = query.where("stock", ">", 0);
    }

    if (requiresPrescription === "true") {
      query = query.where("requiresPrescription", "==", true);
    } else if (requiresPrescription === "false") {
      query = query.where("requiresPrescription", "==", false);
    }

    // Sorting
    const validSortFields = ["createdAt", "price", "name", "rating"];
    const sortField = validSortFields.includes(String(sortBy)) ? String(sortBy) : "createdAt";
    query = query.orderBy(sortField, sortOrder === "asc" ? "asc" : "desc");

    query = query.limit(Number(limit)).offset(Number(offset));

    const snapshot = await query.get();

    let products = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Client-side text search (Firestore doesn't support full-text search)
    if (q) {
      const searchLower = String(q).toLowerCase();
      products = products.filter((p: any) =>
        p.name?.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower) ||
        p.activeIngredient?.toLowerCase().includes(searchLower)
      );
    }

    // Client-side price filter
    if (minPrice) {
      products = products.filter((p: any) => p.price >= Number(minPrice));
    }

    if (maxPrice) {
      products = products.filter((p: any) => p.price <= Number(maxPrice));
    }

    res.json({
      data: products,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: products.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/products/categories
 * List all categories
 * Note: This must be before /:id to avoid matching "categories" as an ID
 */
router.get("/categories", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Return predefined categories
    const categories = [
      { id: "analgesics", name: "Analgésicos" },
      { id: "antibiotics", name: "Antibióticos" },
      { id: "antiinflammatory", name: "Anti-inflamatórios" },
      { id: "vitamins", name: "Vitaminas" },
      { id: "supplements", name: "Suplementos" },
      { id: "skincare", name: "Dermocosméticos" },
      { id: "hygiene", name: "Higiene" },
      { id: "baby", name: "Bebês" },
      { id: "medical_devices", name: "Equipamentos Médicos" },
      { id: "first_aid", name: "Primeiros Socorros" },
    ];

    res.json({ data: categories });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/products/:id
 * Get product by ID
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const productRef = getDb().collection("products").doc(id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Product not found");
    }

    const product = productDoc.data()!;

    if (product.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    res.json({
      id: productDoc.id,
      ...product,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v2/products
 * Create new product (pharmacy only)
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const {
      pharmacyId,
      name,
      description,
      category,
      price,
      stock,
      requiresPrescription,
      activeIngredient,
      manufacturer,
      imageUrl,
      sku,
    } = req.body;

    // Validation
    if (!pharmacyId || !name || !category || price === undefined || stock === undefined) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "pharmacyId, name, category, price, and stock are required"
      );
    }

    // Verify pharmacy ownership
    const pharmacyRef = getDb().collection("pharmacies").doc(pharmacyId);
    const pharmacyDoc = await pharmacyRef.get();

    if (!pharmacyDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Pharmacy not found");
    }

    const pharmacy = pharmacyDoc.data()!;
    if (pharmacy.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied to this pharmacy");
    }

    // Create product
    const product = {
      partnerId,
      pharmacyId,
      pharmacyName: pharmacy.name,
      name,
      description: description || null,
      category,
      price: Number(price),
      stock: Number(stock),
      requiresPrescription: requiresPrescription || false,
      activeIngredient: activeIngredient || null,
      manufacturer: manufacturer || null,
      imageUrl: imageUrl || null,
      sku: sku || null,
      rating: 0,
      reviewCount: 0,
      soldCount: 0,
      status: "pending", // Needs admin approval
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await getDb().collection("products").add(product);

    res.status(201).json({
      id: docRef.id,
      ...product,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /v2/products/:id
 * Update product
 */
router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const productRef = getDb().collection("products").doc(id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Product not found");
    }

    const product = productDoc.data()!;

    if (product.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    const allowedFields = [
      "name",
      "description",
      "category",
      "price",
      "stock",
      "requiresPrescription",
      "activeIngredient",
      "manufacturer",
      "imageUrl",
      "sku",
    ];

    const updates: any = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "No valid fields to update");
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await productRef.update(updates);

    const updatedDoc = await productRef.get();

    res.json({
      id: updatedDoc.id,
      ...updatedDoc.data(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /v2/products/:id
 * Delete product
 */
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const productRef = getDb().collection("products").doc(id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Product not found");
    }

    const product = productDoc.data()!;

    if (product.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    // Soft delete
    await productRef.update({
      status: "deleted",
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /v2/products/:id/stock
 * Update product stock
 */
router.patch("/:id/stock", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;
    const { stock } = req.body;

    if (stock === undefined || stock < 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "Valid stock value is required");
    }

    const productRef = getDb().collection("products").doc(id);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Product not found");
    }

    const product = productDoc.data()!;

    if (product.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    await productRef.update({
      stock: Number(stock),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const updatedDoc = await productRef.get();

    res.json({
      id: updatedDoc.id,
      ...updatedDoc.data(),
    });
  } catch (error) {
    next(error);
  }
});

export const productsRouter = router;
