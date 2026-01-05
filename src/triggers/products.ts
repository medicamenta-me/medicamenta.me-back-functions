/**
 * Product Triggers - Firestore Cloud Functions
 *
 * Triggers para eventos de produtos:
 * - onProductCreated: Registra criação de produto
 * - onProductUpdated: Detecta mudanças de preço/estoque
 * - onProductDeleted: Registra remoção de produto
 *
 * LGPD Compliance: Logs sem dados sensíveis
 * SOLID: Single Responsibility por trigger
 *
 * @module triggers/products
 * @version 1.0.0
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  eventLogService,
  EventType,
  EventSeverity,
  EventCategory,
} from "../api/services/event-log.service";

/**
 * Dados do produto no Firestore
 */
export interface ProductData {
  name: string;
  description?: string;
  pharmacyId: string;
  price: number;
  originalPrice?: number;
  stock: number;
  sku?: string;
  barcode?: string;
  category?: string;
  active: boolean;
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
  requiresPrescription?: boolean;
  manufacturer?: string;
}

/**
 * Resultado do processamento do trigger
 */
export interface TriggerResult {
  success: boolean;
  productId: string;
  action: string;
  timestamp: Date;
  error?: string;
}

/**
 * Trigger: onProductCreated
 *
 * Executado quando um novo produto é criado.
 * Responsabilidades:
 * 1. Registrar evento no Event Log
 * 2. Atualizar contagem de produtos da farmácia
 */
export const onProductCreated = functions
  .region("us-central1")
  .runWith({
    timeoutSeconds: 60,
    memory: "256MB",
    maxInstances: 100,
  })
  .firestore.document("products/{productId}")
  .onCreate(async (snapshot, context): Promise<TriggerResult> => {
    const productId = context.params.productId;
    const startTime = Date.now();

    console.log(`[ProductTrigger] 🆕 Product created: ${productId}`);

    try {
      const productData = snapshot.data() as ProductData;

      // Validação básica
      if (!productData.name || !productData.pharmacyId) {
        console.error("[ProductTrigger] ❌ Invalid product data: missing name or pharmacyId");
        return {
          success: false,
          productId,
          action: "onCreate",
          timestamp: new Date(),
          error: "Invalid product data",
        };
      }

      // 1. Registrar no Event Log
      await eventLogService.logProductEvent(
        EventType.PRODUCT_CREATED,
        productId,
        productData.pharmacyId,
        `Novo produto criado: ${productData.name}`,
        {
          name: productData.name,
          price: productData.price,
          stock: productData.stock,
          category: productData.category,
          active: productData.active,
          requiresPrescription: productData.requiresPrescription,
        }
      );

      // 2. Atualizar contagem de produtos da farmácia
      await updatePharmacyProductCount(productData.pharmacyId, 1);

      const duration = Date.now() - startTime;
      console.log(
        `[ProductTrigger] ✅ Product ${productId} created | Duration: ${duration}ms`
      );

      return {
        success: true,
        productId,
        action: "onCreate",
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[ProductTrigger] ❌ Error processing product ${productId}: ${errorMessage}`);

      await eventLogService.log({
        type: EventType.SYSTEM_ERROR,
        category: EventCategory.PRODUCT,
        severity: EventSeverity.ERROR,
        targetId: productId,
        targetType: "product",
        description: `Erro ao processar criação de produto: ${errorMessage}`,
        metadata: { error: errorMessage },
        actorType: "system",
      });

      return {
        success: false,
        productId,
        action: "onCreate",
        timestamp: new Date(),
        error: errorMessage,
      };
    }
  });

/**
 * Trigger: onProductUpdated
 *
 * Executado quando um produto é atualizado.
 * Responsabilidades:
 * 1. Detectar mudança de preço e registrar
 * 2. Detectar mudança de estoque e registrar
 * 3. Notificar se produto ficou sem estoque
 */
export const onProductUpdated = functions
  .region("us-central1")
  .runWith({
    timeoutSeconds: 60,
    memory: "256MB",
    maxInstances: 100,
  })
  .firestore.document("products/{productId}")
  .onUpdate(async (change, context): Promise<TriggerResult> => {
    const productId = context.params.productId;
    const startTime = Date.now();

    const beforeData = change.before.data() as ProductData;
    const afterData = change.after.data() as ProductData;

    console.log(`[ProductTrigger] 🔄 Product updated: ${productId}`);

    try {
      const changes: string[] = [];

      // Verificar mudança de preço
      if (beforeData.price !== afterData.price) {
        changes.push("price");
        await handlePriceChange(productId, beforeData, afterData);
      }

      // Verificar mudança de estoque
      if (beforeData.stock !== afterData.stock) {
        changes.push("stock");
        await handleStockChange(productId, beforeData, afterData);
      }

      // Verificar mudança de status ativo
      if (beforeData.active !== afterData.active) {
        changes.push("active");
        await handleActiveChange(productId, beforeData, afterData);
      }

      // Se não houve mudanças significativas, apenas log genérico
      if (changes.length === 0) {
        await eventLogService.logProductEvent(
          EventType.PRODUCT_UPDATED,
          productId,
          afterData.pharmacyId,
          `Produto atualizado: ${afterData.name}`,
          {
            name: afterData.name,
            changes: ["metadata"],
          }
        );
      }

      const duration = Date.now() - startTime;
      console.log(
        `[ProductTrigger] ✅ Product ${productId} updated | ` +
        `Changes: ${changes.join(", ") || "metadata"} | Duration: ${duration}ms`
      );

      return {
        success: true,
        productId,
        action: "onUpdate",
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[ProductTrigger] ❌ Error processing product update ${productId}: ${errorMessage}`);

      await eventLogService.log({
        type: EventType.SYSTEM_ERROR,
        category: EventCategory.PRODUCT,
        severity: EventSeverity.ERROR,
        targetId: productId,
        targetType: "product",
        description: `Erro ao processar atualização de produto: ${errorMessage}`,
        metadata: { error: errorMessage },
        actorType: "system",
      });

      return {
        success: false,
        productId,
        action: "onUpdate",
        timestamp: new Date(),
        error: errorMessage,
      };
    }
  });

/**
 * Trigger: onProductDeleted
 *
 * Executado quando um produto é removido.
 * Responsabilidades:
 * 1. Registrar evento no Event Log
 * 2. Atualizar contagem de produtos da farmácia
 */
export const onProductDeleted = functions
  .region("us-central1")
  .runWith({
    timeoutSeconds: 60,
    memory: "256MB",
    maxInstances: 50,
  })
  .firestore.document("products/{productId}")
  .onDelete(async (snapshot, context): Promise<TriggerResult> => {
    const productId = context.params.productId;
    const startTime = Date.now();

    console.log(`[ProductTrigger] 🗑️ Product deleted: ${productId}`);

    try {
      const productData = snapshot.data() as ProductData;

      // 1. Registrar no Event Log
      await eventLogService.logProductEvent(
        EventType.PRODUCT_DELETED,
        productId,
        productData.pharmacyId,
        `Produto removido: ${productData.name}`,
        {
          name: productData.name,
          price: productData.price,
          stock: productData.stock,
        }
      );

      // 2. Atualizar contagem de produtos da farmácia
      await updatePharmacyProductCount(productData.pharmacyId, -1);

      const duration = Date.now() - startTime;
      console.log(
        `[ProductTrigger] ✅ Product ${productId} deletion processed | Duration: ${duration}ms`
      );

      return {
        success: true,
        productId,
        action: "onDelete",
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[ProductTrigger] ❌ Error processing product deletion ${productId}: ${errorMessage}`);

      await eventLogService.log({
        type: EventType.SYSTEM_ERROR,
        category: EventCategory.PRODUCT,
        severity: EventSeverity.ERROR,
        targetId: productId,
        targetType: "product",
        description: `Erro ao processar remoção de produto: ${errorMessage}`,
        metadata: { error: errorMessage },
        actorType: "system",
      });

      return {
        success: false,
        productId,
        action: "onDelete",
        timestamp: new Date(),
        error: errorMessage,
      };
    }
  });

/**
 * Manipula mudança de preço
 */
async function handlePriceChange(
  productId: string,
  beforeData: ProductData,
  afterData: ProductData
): Promise<void> {
  const priceChange = afterData.price - beforeData.price;
  const percentChange = ((priceChange / beforeData.price) * 100).toFixed(2);

  // Determinar severidade baseada na magnitude da mudança
  const severity =
    Math.abs(Number(percentChange)) > 20
      ? EventSeverity.WARNING
      : EventSeverity.INFO;

  await eventLogService.log({
    type: EventType.PRODUCT_PRICE_CHANGED,
    category: EventCategory.PRODUCT,
    severity,
    targetId: productId,
    targetType: "product",
    description: `Preço alterado: R$ ${beforeData.price.toFixed(2)} → ` +
      `R$ ${afterData.price.toFixed(2)} (${percentChange}%)`,  
    metadata: {
      pharmacyId: afterData.pharmacyId,
      productName: afterData.name,
      previousPrice: beforeData.price,
      newPrice: afterData.price,
      priceChange,
      percentChange: Number(percentChange),
    },
    actorId: afterData.pharmacyId,
    actorType: "pharmacy",
  });

  console.log(
    `[ProductTrigger] 💰 Price changed for ${productId}: ` +
    `R$ ${beforeData.price} → R$ ${afterData.price} (${percentChange}%)`
  );

  // Se queda de preço significativa, pode notificar usuários interessados
  if (Number(percentChange) < -10) {
    await notifyPriceDropToWishlistUsers(productId, afterData, Number(percentChange));
  }
}

/**
 * Manipula mudança de estoque
 */
async function handleStockChange(
  productId: string,
  beforeData: ProductData,
  afterData: ProductData
): Promise<void> {
  const stockChange = afterData.stock - beforeData.stock;

  await eventLogService.log({
    type: EventType.PRODUCT_STOCK_UPDATED,
    category: EventCategory.PRODUCT,
    severity: afterData.stock === 0 ? EventSeverity.WARNING : EventSeverity.INFO,
    targetId: productId,
    targetType: "product",
    description: `Estoque alterado: ${beforeData.stock} → ${afterData.stock} ` +
      `(${stockChange > 0 ? "+" : ""}${stockChange})`,  
    metadata: {
      pharmacyId: afterData.pharmacyId,
      productName: afterData.name,
      previousStock: beforeData.stock,
      newStock: afterData.stock,
      stockChange,
    },
    actorId: afterData.pharmacyId,
    actorType: "pharmacy",
  });

  console.log(
    `[ProductTrigger] 📦 Stock changed for ${productId}: ${beforeData.stock} → ${afterData.stock}`
  );

  // Se estoque zerou, notificar farmácia
  if (afterData.stock === 0 && beforeData.stock > 0) {
    await notifyPharmacyOutOfStock(afterData);
  }

  // Se estoque reabastecido, notificar usuários interessados
  if (beforeData.stock === 0 && afterData.stock > 0) {
    await notifyBackInStock(productId, afterData);
  }
}

/**
 * Manipula mudança de status ativo
 */
async function handleActiveChange(
  productId: string,
  beforeData: ProductData,
  afterData: ProductData
): Promise<void> {
  await eventLogService.logProductEvent(
    EventType.PRODUCT_UPDATED,
    productId,
    afterData.pharmacyId,
    `Produto ${afterData.active ? "ativado" : "desativado"}: ${afterData.name}`,
    {
      name: afterData.name,
      previousActive: beforeData.active,
      newActive: afterData.active,
    }
  );

  // Atualizar contagem de produtos ativos
  const db = admin.firestore();
  await db
    .collection("pharmacies")
    .doc(afterData.pharmacyId)
    .update({
      "stats.activeProducts": admin.firestore.FieldValue.increment(
        afterData.active ? 1 : -1
      ),
    });

  console.log(
    `[ProductTrigger] ${afterData.active ? "✅" : "⬛"} Product ${productId} ` +
    `${afterData.active ? "activated" : "deactivated"}`
  );
}

/**
 * Atualiza contagem de produtos da farmácia
 */
async function updatePharmacyProductCount(
  pharmacyId: string,
  increment: number
): Promise<void> {
  try {
    const db = admin.firestore();

    await db
      .collection("pharmacies")
      .doc(pharmacyId)
      .update({
        "stats.totalProducts": admin.firestore.FieldValue.increment(increment),
        "stats.activeProducts": admin.firestore.FieldValue.increment(increment),
      });

    console.log(
      `[ProductTrigger] 📊 Updated product count for pharmacy ${pharmacyId}: ${increment > 0 ? "+" : ""}${increment}`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[ProductTrigger] Stats update error: ${errorMessage}`);
  }
}

/**
 * Notifica farmácia sobre produto sem estoque
 */
async function notifyPharmacyOutOfStock(productData: ProductData): Promise<void> {
  try {
    const db = admin.firestore();

    // Buscar tokens FCM da farmácia
    const pharmacyDoc = await db
      .collection("pharmacies")
      .doc(productData.pharmacyId)
      .get();

    if (!pharmacyDoc.exists) {
      return;
    }

    const pharmacyDataDoc = pharmacyDoc.data();
    const fcmTokens = pharmacyDataDoc?.fcmTokens as string[] | undefined;

    if (!fcmTokens || fcmTokens.length === 0) {
      return;
    }

    const message: admin.messaging.MulticastMessage = {
      tokens: fcmTokens,
      notification: {
        title: "⚠️ Produto Sem Estoque",
        body: `${productData.name} está sem estoque`,
      },
      data: {
        type: "OUT_OF_STOCK",
        productName: productData.name,
        pharmacyId: productData.pharmacyId,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "inventory_alerts",
          sound: "default",
        },
      },
    };

    await admin.messaging().sendEachForMulticast(message);

    console.log(`[ProductTrigger] 📱 Out of stock notification sent for ${productData.name}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[ProductTrigger] Out of stock notification error: ${errorMessage}`);
  }
}

/**
 * Notifica usuários interessados sobre queda de preço
 */
async function notifyPriceDropToWishlistUsers(
  productId: string,
  productData: ProductData,
  percentChange: number
): Promise<void> {
  try {
    const db = admin.firestore();

    // Buscar usuários que têm este produto na wishlist
    const wishlistSnapshot = await db
      .collection("wishlists")
      .where("productId", "==", productId)
      .where("notifyPriceDrops", "==", true)
      .limit(100)
      .get();

    if (wishlistSnapshot.empty) {
      return;
    }

    // Coletar tokens FCM dos usuários
    const userIds = wishlistSnapshot.docs.map((doc) => doc.data().userId);
    const uniqueUserIds = [...new Set(userIds)];

    const fcmTokens: string[] = [];
    for (const userId of uniqueUserIds) {
      const userDoc = await db.collection("users").doc(userId).get();
      const tokens = userDoc.data()?.fcmTokens as string[] | undefined;
      if (tokens) {
        fcmTokens.push(...tokens);
      }
    }

    if (fcmTokens.length === 0) {
      return;
    }

    const message: admin.messaging.MulticastMessage = {
      tokens: fcmTokens.slice(0, 500), // Limitar a 500 tokens por vez
      notification: {
        title: "🔥 Queda de Preço!",
        body: `${productData.name} está ${Math.abs(percentChange)}% mais barato!`,
      },
      data: {
        type: "PRICE_DROP",
        productId,
        productName: productData.name,
        newPrice: String(productData.price),
        percentChange: String(percentChange),
      },
      android: {
        priority: "normal",
        notification: {
          channelId: "promotions",
          sound: "default",
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(
      `[ProductTrigger] 📱 Price drop notification sent to ${response.successCount} users`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[ProductTrigger] Price drop notification error: ${errorMessage}`);
  }
}

/**
 * Notifica usuários interessados sobre produto de volta ao estoque
 */
async function notifyBackInStock(
  productId: string,
  productData: ProductData
): Promise<void> {
  try {
    const db = admin.firestore();

    // Buscar usuários que querem ser notificados sobre estoque
    const stockAlertsSnapshot = await db
      .collection("stock_alerts")
      .where("productId", "==", productId)
      .where("notified", "==", false)
      .limit(100)
      .get();

    if (stockAlertsSnapshot.empty) {
      return;
    }

    // Coletar tokens FCM e marcar alertas como notificados
    const fcmTokens: string[] = [];
    const batch = db.batch();

    for (const doc of stockAlertsSnapshot.docs) {
      const userId = doc.data().userId;
      const userDoc = await db.collection("users").doc(userId).get();
      const tokens = userDoc.data()?.fcmTokens as string[] | undefined;

      if (tokens) {
        fcmTokens.push(...tokens);
      }

      batch.update(doc.ref, { notified: true, notifiedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    await batch.commit();

    if (fcmTokens.length === 0) {
      return;
    }

    const message: admin.messaging.MulticastMessage = {
      tokens: fcmTokens.slice(0, 500),
      notification: {
        title: "✅ Produto Disponível!",
        body: `${productData.name} está de volta ao estoque`,
      },
      data: {
        type: "BACK_IN_STOCK",
        productId,
        productName: productData.name,
        price: String(productData.price),
      },
      android: {
        priority: "normal",
        notification: {
          channelId: "stock_alerts",
          sound: "default",
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(
      `[ProductTrigger] 📱 Back in stock notification sent to ${response.successCount} users`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[ProductTrigger] Back in stock notification error: ${errorMessage}`);
  }
}
