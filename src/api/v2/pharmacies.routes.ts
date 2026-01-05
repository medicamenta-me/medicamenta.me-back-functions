/**
 * 🏥 Pharmacies Routes - API v2
 * 
 * Gerenciamento de farmácias do Marketplace
 */

import { Router, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { ApiError } from "../utils/api-error";

const router = Router();
const getDb = () => admin.firestore();

/**
 * GET /v2/pharmacies
 * List pharmacies
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const {
      status,
      city,
      state,
      hasDelivery,
      limit = 20,
      offset = 0,
    } = req.query;

    let query = getDb().collection("pharmacies").where("partnerId", "==", partnerId);

    if (status) {
      query = query.where("status", "==", status);
    }

    if (city) {
      query = query.where("address.city", "==", city);
    }

    if (state) {
      query = query.where("address.state", "==", state);
    }

    if (hasDelivery === "true") {
      query = query.where("hasDelivery", "==", true);
    }

    query = query
      .orderBy("createdAt", "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    const snapshot = await query.get();

    const pharmacies = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      data: pharmacies,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: pharmacies.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/pharmacies/nearby
 * Find nearby pharmacies
 * Note: Must be before /:id to avoid "nearby" being matched as ID
 */
router.get("/nearby", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { lat, lng, radius = 5, limit = 10 } = req.query;

    if (!lat || !lng) {
      throw new ApiError(400, "VALIDATION_ERROR", "lat and lng are required");
    }

    // Get all active pharmacies
    const snapshot = await getDb()
      .collection("pharmacies")
      .where("partnerId", "==", partnerId)
      .where("status", "==", "active")
      .get();

    const userLat = Number(lat);
    const userLng = Number(lng);
    const radiusKm = Number(radius);

    // Filter by distance (Haversine formula)
    const pharmaciesWithDistance = snapshot.docs
      .map((doc) => {
        const pharmacy = doc.data();
        const pharmLat = pharmacy.address?.latitude;
        const pharmLng = pharmacy.address?.longitude;

        if (!pharmLat || !pharmLng) return null;

        const distance = calculateDistance(userLat, userLng, pharmLat, pharmLng);

        return {
          id: doc.id,
          ...pharmacy,
          distance,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null && p.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, Number(limit));

    res.json({
      data: pharmaciesWithDistance,
      total: pharmaciesWithDistance.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/pharmacies/:id
 * Get pharmacy by ID
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const pharmacyRef = getDb().collection("pharmacies").doc(id);
    const pharmacyDoc = await pharmacyRef.get();

    if (!pharmacyDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Pharmacy not found");
    }

    const pharmacy = pharmacyDoc.data()!;

    if (pharmacy.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    res.json({
      id: pharmacyDoc.id,
      ...pharmacy,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v2/pharmacies
 * Register new pharmacy
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const {
      name,
      cnpj,
      email,
      phone,
      address,
      hasDelivery,
      deliveryRadius,
      shippingCost,
      freeShippingMinValue,
      workingHours,
    } = req.body;

    // Validation
    if (!name || !cnpj || !email || !address) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "name, cnpj, email, and address are required"
      );
    }

    // Check if CNPJ already exists
    const existingSnapshot = await getDb()
      .collection("pharmacies")
      .where("cnpj", "==", cnpj)
      .get();

    if (!existingSnapshot.empty) {
      throw new ApiError(400, "DUPLICATE_CNPJ", "CNPJ already registered");
    }

    // Create pharmacy
    const pharmacy = {
      partnerId,
      name,
      cnpj,
      email,
      phone: phone || null,
      address,
      hasDelivery: hasDelivery || false,
      deliveryRadius: deliveryRadius || null,
      shippingCost: shippingCost || 0,
      freeShippingMinValue: freeShippingMinValue || null,
      workingHours: workingHours || null,
      rating: 0,
      reviewCount: 0,
      totalOrders: 0,
      status: "pending", // Needs admin approval
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await getDb().collection("pharmacies").add(pharmacy);

    res.status(201).json({
      id: docRef.id,
      ...pharmacy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /v2/pharmacies/:id
 * Update pharmacy
 */
router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const pharmacyRef = getDb().collection("pharmacies").doc(id);
    const pharmacyDoc = await pharmacyRef.get();

    if (!pharmacyDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Pharmacy not found");
    }

    const pharmacy = pharmacyDoc.data()!;

    if (pharmacy.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    const allowedFields = [
      "name",
      "email",
      "phone",
      "address",
      "hasDelivery",
      "deliveryRadius",
      "shippingCost",
      "freeShippingMinValue",
      "workingHours",
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

    await pharmacyRef.update(updates);

    const updatedDoc = await pharmacyRef.get();

    res.json({
      id: updatedDoc.id,
      ...updatedDoc.data(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v2/pharmacies/:id/products
 * Get pharmacy products
 */
router.get("/:id/products", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;
    const { limit = 20, offset = 0, category, inStock } = req.query;

    // Verify pharmacy exists
    const pharmacyRef = getDb().collection("pharmacies").doc(id);
    const pharmacyDoc = await pharmacyRef.get();

    if (!pharmacyDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Pharmacy not found");
    }

    let query = getDb()
      .collection("products")
      .where("partnerId", "==", partnerId)
      .where("pharmacyId", "==", id);

    if (category) {
      query = query.where("category", "==", category);
    }

    if (inStock === "true") {
      query = query.where("stock", ">", 0);
    }

    query = query
      .orderBy("createdAt", "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    const snapshot = await query.get();

    const products = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

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
 * Helper: Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export const pharmaciesRouter = router;
