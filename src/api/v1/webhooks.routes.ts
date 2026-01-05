/**
 * 🔔 Webhooks Routes
 * 
 * Manage webhook subscriptions
 */

import { Router, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { ApiError } from "../utils/api-error";
import crypto from "crypto";

const router = Router();
const getDb = () => admin.firestore();

/**
 * POST /v1/webhooks
 * Create webhook subscription
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { url, events, secret } = req.body;

    if (!url || !events || !Array.isArray(events)) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "url and events (array) are required"
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new ApiError(400, "INVALID_URL", "Invalid webhook URL");
    }

    // Validate events
    const validEvents = [
      "patient.created",
      "patient.updated",
      "patient.deleted",
      "medication.created",
      "medication.updated",
      "medication.deleted",
      "dose.taken",
      "dose.missed",
      "dose.skipped",
      "adherence.low",
      "stock.low",
    ];

    const invalidEvents = events.filter((e: string) => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      throw new ApiError(
        400,
        "INVALID_EVENTS",
        `Invalid events: ${invalidEvents.join(", ")}`,
        { validEvents }
      );
    }

    // Generate secret if not provided
    const webhookSecret = secret || generateWebhookSecret();

    const webhook = {
      partnerId,
      url,
      events,
      secret: webhookSecret,
      status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      stats: {
        totalDeliveries: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        lastDelivery: null,
      },
    };

    const docRef = await getDb().collection("webhooks").add(webhook);

    res.status(201).json({
      id: docRef.id,
      ...webhook,
      secret: webhookSecret,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/webhooks
 * List webhooks
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;

    const snapshot = await getDb().collection("webhooks")
      .where("partnerId", "==", partnerId)
      .get();

    const webhooks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Don't expose secret in list
      secret: "***",
    }));

    res.json({
      data: webhooks,
      total: webhooks.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/webhooks/:id
 * Get webhook by ID
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const webhookRef = getDb().collection("webhooks").doc(id);
    const webhookDoc = await webhookRef.get();

    if (!webhookDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Webhook not found");
    }

    const webhook = webhookDoc.data()!;

    if (webhook.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    res.json({
      id: webhookDoc.id,
      ...webhook,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /v1/webhooks/:id
 * Delete webhook
 */
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const webhookRef = getDb().collection("webhooks").doc(id);
    const webhookDoc = await webhookRef.get();

    if (!webhookDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Webhook not found");
    }

    const webhook = webhookDoc.data()!;

    if (webhook.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    await webhookRef.delete();

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /v1/webhooks/:id/test
 * Test webhook delivery
 */
router.post("/:id/test", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = (req as any).partnerId;
    const { id } = req.params;

    const webhookRef = getDb().collection("webhooks").doc(id);
    const webhookDoc = await webhookRef.get();

    if (!webhookDoc.exists) {
      throw new ApiError(404, "NOT_FOUND", "Webhook not found");
    }

    const webhook = webhookDoc.data()!;

    if (webhook.partnerId !== partnerId) {
      throw new ApiError(403, "FORBIDDEN", "Access denied");
    }

    // Send test payload
    const testPayload = {
      event: "webhook.test",
      timestamp: new Date().toISOString(),
      data: {
        message: "This is a test webhook delivery",
        webhookId: id,
      },
    };

    const result = await deliverWebhook(webhook.url, webhook.secret, testPayload);

    res.json({
      success: result.success,
      statusCode: result.statusCode,
      message: result.success ? "Test webhook delivered successfully" : "Test webhook delivery failed",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper: Generate webhook secret
 */
function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString("hex")}`;
}

/**
 * Helper: Deliver webhook
 */
async function deliverWebhook(
  url: string,
  secret: string,
  payload: any
): Promise<{ success: boolean; statusCode?: number }> {
  try {
    const timestamp = Date.now();
    const body = JSON.stringify(payload);
    
    // Generate signature
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `t=${timestamp},v1=${signature}`,
        "X-Webhook-ID": payload.webhookId || "test",
        "User-Agent": "Medicamenta-Webhooks/1.0",
      },
      body,
    });

    return {
      success: response.ok,
      statusCode: response.status,
    };
  } catch (error) {
    console.error("Webhook delivery failed:", error);
    return { success: false };
  }
}

export const webhooksRouter = router;
