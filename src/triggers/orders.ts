/**
 * Order Triggers - Firestore Cloud Functions
 *
 * Triggers para eventos de pedidos:
 * - onOrderCreated: Notifica farmácia, atualiza estatísticas
 * - onOrderStatusUpdated: Notifica usuário, registra histórico
 *
 * LGPD Compliance: Logs sem dados sensíveis
 * SOLID: Single Responsibility por trigger
 *
 * @module triggers/orders
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
import {
  auditService,
  AuditAction,
} from "../api/services/audit.service";

/**
 * Status válidos de pedido
 */
export enum OrderStatus {
  PENDING = "pending",
  CONFIRMED = "confirmed",
  PROCESSING = "processing",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
}

/**
 * Dados do pedido no Firestore
 */
export interface OrderData {
  userId: string;
  pharmacyId: string;
  status: OrderStatus;
  total: number;
  items: OrderItem[];
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
  shippingAddress?: ShippingAddress;
  paymentMethod?: string;
  paymentStatus?: string;
  notes?: string;
}

interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

interface ShippingAddress {
  street: string;
  number: string;
  city: string;
  state: string;
  zipCode: string;
}

/**
 * Resultado do processamento do trigger
 */
export interface TriggerResult {
  success: boolean;
  orderId: string;
  action: string;
  timestamp: Date;
  error?: string;
}

/**
 * Trigger: onOrderCreated
 *
 * Executado quando um novo pedido é criado no Firestore.
 * Responsabilidades:
 * 1. Registrar evento no Event Log
 * 2. Registrar no Audit Log
 * 3. Enviar notificação FCM para farmácia
 * 4. Atualizar estatísticas da farmácia
 */
export const onOrderCreated = functions
  .region("us-central1")
  .runWith({
    timeoutSeconds: 60,
    memory: "256MB",
    maxInstances: 100,
  })
  .firestore.document("orders/{orderId}")
  .onCreate(async (snapshot, context): Promise<TriggerResult> => {
    const orderId = context.params.orderId;
    const startTime = Date.now();

    console.log(`[OrderTrigger] 🆕 Order created: ${orderId}`);

    try {
      const orderData = snapshot.data() as OrderData;

      // Validação básica
      if (!orderData.userId || !orderData.pharmacyId) {
        console.error("[OrderTrigger] ❌ Invalid order data: missing userId or pharmacyId");
        return {
          success: false,
          orderId,
          action: "onCreate",
          timestamp: new Date(),
          error: "Invalid order data",
        };
      }

      // 1. Registrar no Event Log
      await eventLogService.logOrderEvent(
        EventType.ORDER_CREATED,
        orderId,
        `Novo pedido criado - Total: R$ ${orderData.total?.toFixed(2) || "0.00"}`,
        {
          pharmacyId: orderData.pharmacyId,
          itemCount: orderData.items?.length || 0,
          total: orderData.total,
          status: orderData.status,
        },
        orderData.userId,
        "user"
      );

      // 2. Registrar no Audit Log
      await auditService.log({
        action: AuditAction.ORDER_CREATED,
        targetId: orderId,
        targetType: "order",
        adminId: orderData.userId,
        adminEmail: "system@medicamenta.me",
        details: {
          pharmacyId: orderData.pharmacyId,
          itemCount: orderData.items?.length || 0,
          total: orderData.total,
        },
      });

      // 3. Enviar notificação FCM para farmácia
      await sendPharmacyNotification(orderId, orderData);

      // 4. Atualizar estatísticas da farmácia
      await updatePharmacyStats(orderData.pharmacyId, orderData.total);

      const duration = Date.now() - startTime;
      console.log(
        `[OrderTrigger] ✅ Order ${orderId} processed | Duration: ${duration}ms`
      );

      return {
        success: true,
        orderId,
        action: "onCreate",
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[OrderTrigger] ❌ Error processing order ${orderId}: ${errorMessage}`);

      // Registrar erro no Event Log
      await eventLogService.log({
        type: EventType.SYSTEM_ERROR,
        category: EventCategory.ORDER,
        severity: EventSeverity.ERROR,
        targetId: orderId,
        targetType: "order",
        description: `Erro ao processar pedido: ${errorMessage}`,
        metadata: { error: errorMessage },
        actorType: "system",
      });

      return {
        success: false,
        orderId,
        action: "onCreate",
        timestamp: new Date(),
        error: errorMessage,
      };
    }
  });

/**
 * Trigger: onOrderStatusUpdated
 *
 * Executado quando o status de um pedido é alterado.
 * Responsabilidades:
 * 1. Registrar mudança de status no Event Log
 * 2. Registrar no Audit Log
 * 3. Enviar notificação FCM para usuário
 * 4. Atualizar estatísticas se necessário
 */
export const onOrderStatusUpdated = functions
  .region("us-central1")
  .runWith({
    timeoutSeconds: 60,
    memory: "256MB",
    maxInstances: 100,
  })
  .firestore.document("orders/{orderId}")
  .onUpdate(async (change, context): Promise<TriggerResult> => {
    const orderId = context.params.orderId;
    const startTime = Date.now();

    const beforeData = change.before.data() as OrderData;
    const afterData = change.after.data() as OrderData;

    // Verificar se houve mudança de status
    if (beforeData.status === afterData.status) {
      console.log(`[OrderTrigger] ℹ️ Order ${orderId} updated but status unchanged`);
      return {
        success: true,
        orderId,
        action: "onUpdate",
        timestamp: new Date(),
      };
    }

    const previousStatus = beforeData.status;
    const newStatus = afterData.status;

    console.log(
      `[OrderTrigger] 🔄 Order status changed: ${orderId} | ${previousStatus} → ${newStatus}`
    );

    try {
      // Determinar tipo de evento e severidade
      const { eventType } = getEventTypeForStatus(newStatus);

      // 1. Registrar no Event Log
      await eventLogService.logOrderEvent(
        eventType,
        orderId,
        `Status alterado: ${previousStatus} → ${newStatus}`,
        {
          previousStatus,
          newStatus,
          pharmacyId: afterData.pharmacyId,
          userId: afterData.userId,
        },
        afterData.pharmacyId,
        "pharmacy"
      );

      // 2. Registrar no Audit Log
      await auditService.log({
        action: AuditAction.ORDER_STATUS_CHANGED,
        targetId: orderId,
        targetType: "order",
        adminId: afterData.pharmacyId,
        adminEmail: "system@medicamenta.me",
        details: {
          previousStatus,
          newStatus,
          userId: afterData.userId,
        },
      });

      // 3. Enviar notificação FCM para usuário
      await sendUserNotification(orderId, afterData, previousStatus, newStatus);

      // 4. Atualizar estatísticas se pedido foi completado ou cancelado
      if (newStatus === OrderStatus.DELIVERED) {
        await incrementPharmacyCompletedOrders(afterData.pharmacyId);
      } else if (newStatus === OrderStatus.CANCELLED) {
        await incrementPharmacyCancelledOrders(afterData.pharmacyId);
      }

      const duration = Date.now() - startTime;
      console.log(
        `[OrderTrigger] ✅ Status update processed for ${orderId} | Duration: ${duration}ms`
      );

      return {
        success: true,
        orderId,
        action: "onUpdate",
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[OrderTrigger] ❌ Error processing status update for ${orderId}: ${errorMessage}`
      );

      // Registrar erro
      await eventLogService.log({
        type: EventType.SYSTEM_ERROR,
        category: EventCategory.ORDER,
        severity: EventSeverity.ERROR,
        targetId: orderId,
        targetType: "order",
        description: `Erro ao processar mudança de status: ${errorMessage}`,
        metadata: { error: errorMessage, previousStatus, newStatus },
        actorType: "system",
      });

      return {
        success: false,
        orderId,
        action: "onUpdate",
        timestamp: new Date(),
        error: errorMessage,
      };
    }
  });

/**
 * Envia notificação FCM para farmácia sobre novo pedido
 */
async function sendPharmacyNotification(
  orderId: string,
  orderData: OrderData
): Promise<void> {
  try {
    const db = admin.firestore();

    // Buscar tokens FCM da farmácia
    const pharmacyDoc = await db
      .collection("pharmacies")
      .doc(orderData.pharmacyId)
      .get();

    if (!pharmacyDoc.exists) {
      console.warn(
        `[OrderTrigger] Pharmacy ${orderData.pharmacyId} not found for notification`
      );
      return;
    }

    const pharmacyData = pharmacyDoc.data();
    const fcmTokens = pharmacyData?.fcmTokens as string[] | undefined;

    if (!fcmTokens || fcmTokens.length === 0) {
      console.log(
        `[OrderTrigger] No FCM tokens for pharmacy ${orderData.pharmacyId}`
      );
      return;
    }

    // Preparar mensagem
    const message: admin.messaging.MulticastMessage = {
      tokens: fcmTokens,
      notification: {
        title: "🆕 Novo Pedido!",
        body: `Pedido #${orderId.slice(-6)} - R$ ${orderData.total?.toFixed(2) || "0.00"}`,
      },
      data: {
        type: "NEW_ORDER",
        orderId,
        total: String(orderData.total || 0),
        itemCount: String(orderData.items?.length || 0),
      },
      android: {
        priority: "high",
        notification: {
          channelId: "orders",
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    // Enviar notificação
    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(
      "[OrderTrigger] 📱 Notification sent to pharmacy | " +
      `Success: ${response.successCount}, Failures: ${response.failureCount}`
    );

    // Remover tokens inválidos
    if (response.failureCount > 0) {
      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error?.code === "messaging/invalid-registration-token") {
          invalidTokens.push(fcmTokens[idx]);
        }
      });

      if (invalidTokens.length > 0) {
        await db
          .collection("pharmacies")
          .doc(orderData.pharmacyId)
          .update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
          });
        console.log(
          `[OrderTrigger] 🧹 Removed ${invalidTokens.length} invalid FCM tokens`
        );
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[OrderTrigger] FCM notification error: ${errorMessage}`);
    // Não re-throw - notificação é secundária
  }
}

/**
 * Envia notificação FCM para usuário sobre mudança de status
 */
async function sendUserNotification(
  orderId: string,
  orderData: OrderData,
  previousStatus: OrderStatus,
  newStatus: OrderStatus
): Promise<void> {
  try {
    const db = admin.firestore();

    // Buscar tokens FCM do usuário
    const userDoc = await db.collection("users").doc(orderData.userId).get();

    if (!userDoc.exists) {
      console.warn(`[OrderTrigger] User ${orderData.userId} not found for notification`);
      return;
    }

    const userData = userDoc.data();
    const fcmTokens = userData?.fcmTokens as string[] | undefined;

    if (!fcmTokens || fcmTokens.length === 0) {
      console.log(`[OrderTrigger] No FCM tokens for user ${orderData.userId}`);
      return;
    }

    // Mensagens personalizadas por status
    const statusMessages: Record<OrderStatus, { title: string; body: string }> = {
      [OrderStatus.PENDING]: {
        title: "📝 Pedido Pendente",
        body: "Seu pedido está aguardando confirmação",
      },
      [OrderStatus.CONFIRMED]: {
        title: "✅ Pedido Confirmado!",
        body: "A farmácia confirmou seu pedido",
      },
      [OrderStatus.PROCESSING]: {
        title: "📦 Preparando Pedido",
        body: "Seu pedido está sendo preparado",
      },
      [OrderStatus.SHIPPED]: {
        title: "🚚 Pedido Enviado!",
        body: "Seu pedido está a caminho",
      },
      [OrderStatus.DELIVERED]: {
        title: "🎉 Pedido Entregue!",
        body: "Seu pedido foi entregue com sucesso",
      },
      [OrderStatus.CANCELLED]: {
        title: "❌ Pedido Cancelado",
        body: "Seu pedido foi cancelado",
      },
      [OrderStatus.REFUNDED]: {
        title: "💰 Reembolso Processado",
        body: "O reembolso do seu pedido foi processado",
      },
    };

    const messageContent = statusMessages[newStatus] || {
      title: "📋 Atualização do Pedido",
      body: `Status atualizado para: ${newStatus}`,
    };

    const message: admin.messaging.MulticastMessage = {
      tokens: fcmTokens,
      notification: {
        title: messageContent.title,
        body: `${messageContent.body} - Pedido #${orderId.slice(-6)}`,
      },
      data: {
        type: "ORDER_STATUS_UPDATE",
        orderId,
        previousStatus,
        newStatus,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "orders",
          sound: "default",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(
      "[OrderTrigger] 📱 Notification sent to user | " +
      `Success: ${response.successCount}, Failures: ${response.failureCount}`
    );

    // Remover tokens inválidos
    if (response.failureCount > 0) {
      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error?.code === "messaging/invalid-registration-token") {
          invalidTokens.push(fcmTokens[idx]);
        }
      });

      if (invalidTokens.length > 0) {
        await db
          .collection("users")
          .doc(orderData.userId)
          .update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
          });
        console.log(
          `[OrderTrigger] 🧹 Removed ${invalidTokens.length} invalid user FCM tokens`
        );
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[OrderTrigger] User FCM notification error: ${errorMessage}`);
    // Não re-throw - notificação é secundária
  }
}

/**
 * Atualiza estatísticas da farmácia com novo pedido
 */
async function updatePharmacyStats(
  pharmacyId: string,
  orderTotal: number
): Promise<void> {
  try {
    const db = admin.firestore();

    await db
      .collection("pharmacies")
      .doc(pharmacyId)
      .update({
        "stats.totalOrders": admin.firestore.FieldValue.increment(1),
        "stats.totalRevenue": admin.firestore.FieldValue.increment(orderTotal || 0),
        "stats.pendingOrders": admin.firestore.FieldValue.increment(1),
        "stats.lastOrderAt": admin.firestore.FieldValue.serverTimestamp(),
      });

    console.log(`[OrderTrigger] 📊 Updated stats for pharmacy ${pharmacyId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[OrderTrigger] Stats update error: ${errorMessage}`);
    // Não re-throw - estatísticas são secundárias
  }
}

/**
 * Incrementa contador de pedidos completados
 */
async function incrementPharmacyCompletedOrders(pharmacyId: string): Promise<void> {
  try {
    const db = admin.firestore();

    await db
      .collection("pharmacies")
      .doc(pharmacyId)
      .update({
        "stats.completedOrders": admin.firestore.FieldValue.increment(1),
        "stats.pendingOrders": admin.firestore.FieldValue.increment(-1),
      });

    console.log(`[OrderTrigger] 📊 Incremented completed orders for ${pharmacyId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[OrderTrigger] Completed orders update error: ${errorMessage}`);
  }
}

/**
 * Incrementa contador de pedidos cancelados
 */
async function incrementPharmacyCancelledOrders(pharmacyId: string): Promise<void> {
  try {
    const db = admin.firestore();

    await db
      .collection("pharmacies")
      .doc(pharmacyId)
      .update({
        "stats.cancelledOrders": admin.firestore.FieldValue.increment(1),
        "stats.pendingOrders": admin.firestore.FieldValue.increment(-1),
      });

    console.log(`[OrderTrigger] 📊 Incremented cancelled orders for ${pharmacyId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[OrderTrigger] Cancelled orders update error: ${errorMessage}`);
  }
}

/**
 * Mapeia status para tipo de evento e severidade
 */
function getEventTypeForStatus(
  status: OrderStatus
): { eventType: EventType; severity: EventSeverity } {
  const mapping: Record<OrderStatus, { eventType: EventType; severity: EventSeverity }> = {
    [OrderStatus.PENDING]: {
      eventType: EventType.ORDER_STATUS_UPDATED,
      severity: EventSeverity.INFO,
    },
    [OrderStatus.CONFIRMED]: {
      eventType: EventType.ORDER_STATUS_UPDATED,
      severity: EventSeverity.INFO,
    },
    [OrderStatus.PROCESSING]: {
      eventType: EventType.ORDER_STATUS_UPDATED,
      severity: EventSeverity.INFO,
    },
    [OrderStatus.SHIPPED]: {
      eventType: EventType.ORDER_SHIPPED,
      severity: EventSeverity.INFO,
    },
    [OrderStatus.DELIVERED]: {
      eventType: EventType.ORDER_DELIVERED,
      severity: EventSeverity.INFO,
    },
    [OrderStatus.CANCELLED]: {
      eventType: EventType.ORDER_CANCELLED,
      severity: EventSeverity.WARNING,
    },
    [OrderStatus.REFUNDED]: {
      eventType: EventType.ORDER_STATUS_UPDATED,
      severity: EventSeverity.WARNING,
    },
  };

  return mapping[status] || {
    eventType: EventType.ORDER_STATUS_UPDATED,
    severity: EventSeverity.INFO,
  };
}
