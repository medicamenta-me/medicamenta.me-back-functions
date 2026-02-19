/**
 * Pharmacy Triggers - Firestore Cloud Functions
 *
 * Triggers para eventos de farmácias:
 * - onPharmacyApproved: Notifica farmácia, ativa conta
 * - onPharmacyStatusUpdated: Registra mudanças de status
 *
 * LGPD Compliance: Logs sem dados sensíveis
 * SOLID: Single Responsibility por trigger
 *
 * @module triggers/pharmacies
 * @version 1.0.0
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { REGION } from "../shared/config/region";
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
 * Status válidos de farmácia
 */
export enum PharmacyStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  SUSPENDED = "suspended",
  INACTIVE = "inactive",
}

/**
 * Dados da farmácia no Firestore
 */
export interface PharmacyData {
  name: string;
  email: string;
  status: PharmacyStatus;
  ownerId: string;
  cnpj?: string;
  phone?: string;
  address?: PharmacyAddress;
  createdAt?: admin.firestore.Timestamp;
  updatedAt?: admin.firestore.Timestamp;
  approvedAt?: admin.firestore.Timestamp;
  approvedBy?: string;
  rejectionReason?: string;
  suspensionReason?: string;
  fcmTokens?: string[];
}

interface PharmacyAddress {
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
  pharmacyId: string;
  action: string;
  timestamp: Date;
  error?: string;
}

/**
 * Trigger: onPharmacyCreated
 *
 * Executado quando uma nova farmácia é registrada.
 * Responsabilidades:
 * 1. Registrar evento no Event Log
 * 2. Notificar administradores para revisão
 */
export const onPharmacyCreated = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 60,
    memory: "256MB",
    maxInstances: 50,
  })
  .firestore.document("pharmacies/{pharmacyId}")
  .onCreate(async (snapshot, context): Promise<TriggerResult> => {
    const pharmacyId = context.params.pharmacyId;
    const startTime = Date.now();

    console.log(`[PharmacyTrigger] 🆕 Pharmacy registered: ${pharmacyId}`);

    try {
      const pharmacyData = snapshot.data() as PharmacyData;

      // Validação básica
      if (!pharmacyData.name || !pharmacyData.email) {
        console.error("[PharmacyTrigger] ❌ Invalid pharmacy data: missing name or email");
        return {
          success: false,
          pharmacyId,
          action: "onCreate",
          timestamp: new Date(),
          error: "Invalid pharmacy data",
        };
      }

      // 1. Registrar no Event Log
      await eventLogService.logPharmacyEvent(
        EventType.PHARMACY_REGISTERED,
        pharmacyId,
        `Nova farmácia registrada: ${pharmacyData.name}`,
        EventSeverity.INFO,
        {
          name: pharmacyData.name,
          city: pharmacyData.address?.city,
          state: pharmacyData.address?.state,
        }
      );

      // 2. Notificar administradores
      await notifyAdminsNewPharmacy(pharmacyId, pharmacyData);

      const duration = Date.now() - startTime;
      console.log(
        `[PharmacyTrigger] ✅ Pharmacy ${pharmacyId} registration processed | Duration: ${duration}ms`
      );

      return {
        success: true,
        pharmacyId,
        action: "onCreate",
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[PharmacyTrigger] ❌ Error processing pharmacy ${pharmacyId}: ${errorMessage}`);

      await eventLogService.log({
        type: EventType.SYSTEM_ERROR,
        category: EventCategory.PHARMACY,
        severity: EventSeverity.ERROR,
        targetId: pharmacyId,
        targetType: "pharmacy",
        description: `Erro ao processar registro de farmácia: ${errorMessage}`,
        metadata: { error: errorMessage },
        actorType: "system",
      });

      return {
        success: false,
        pharmacyId,
        action: "onCreate",
        timestamp: new Date(),
        error: errorMessage,
      };
    }
  });

/**
 * Trigger: onPharmacyStatusUpdated
 *
 * Executado quando o status de uma farmácia é alterado.
 * Responsabilidades:
 * 1. Registrar mudança de status no Event Log
 * 2. Registrar no Audit Log
 * 3. Enviar notificação FCM para farmácia
 * 4. Executar ações específicas por status
 */
export const onPharmacyStatusUpdated = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 60,
    memory: "256MB",
    maxInstances: 50,
  })
  .firestore.document("pharmacies/{pharmacyId}")
  .onUpdate(async (change, context): Promise<TriggerResult> => {
    const pharmacyId = context.params.pharmacyId;
    const startTime = Date.now();

    const beforeData = change.before.data() as PharmacyData;
    const afterData = change.after.data() as PharmacyData;

    // Verificar se houve mudança de status
    if (beforeData.status === afterData.status) {
      return {
        success: true,
        pharmacyId,
        action: "onUpdate",
        timestamp: new Date(),
      };
    }

    const previousStatus = beforeData.status;
    const newStatus = afterData.status;

    console.log(
      `[PharmacyTrigger] 🔄 Pharmacy status changed: ${pharmacyId} | ${previousStatus} → ${newStatus}`
    );

    try {
      // Determinar tipo de evento
      const eventType = getEventTypeForPharmacyStatus(newStatus);
      const severity = getSeverityForPharmacyStatus(newStatus);

      // 1. Registrar no Event Log
      await eventLogService.logPharmacyEvent(
        eventType,
        pharmacyId,
        `Status alterado: ${previousStatus} → ${newStatus}`,
        severity,
        {
          previousStatus,
          newStatus,
          approvedBy: afterData.approvedBy,
          rejectionReason: afterData.rejectionReason,
          suspensionReason: afterData.suspensionReason,
        },
        afterData.approvedBy
      );

      // 2. Registrar no Audit Log
      await auditService.log({
        action: getAuditActionForPharmacyStatus(newStatus),
        targetId: pharmacyId,
        targetType: "pharmacy",
        adminId: afterData.approvedBy || "system",
        adminEmail: "system@medicamenta.me",
        details: {
          previousStatus,
          newStatus,
          pharmacyName: afterData.name,
          reason: afterData.rejectionReason || afterData.suspensionReason,
        },
      });

      // 3. Enviar notificação FCM para farmácia
      await sendPharmacyStatusNotification(pharmacyId, afterData, newStatus);

      // 4. Executar ações específicas
      await executeStatusSpecificActions(pharmacyId, afterData, previousStatus, newStatus);

      const duration = Date.now() - startTime;
      console.log(
        `[PharmacyTrigger] ✅ Status update processed for ${pharmacyId} | Duration: ${duration}ms`
      );

      return {
        success: true,
        pharmacyId,
        action: "onUpdate",
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[PharmacyTrigger] ❌ Error processing status update for ${pharmacyId}: ${errorMessage}`
      );

      await eventLogService.log({
        type: EventType.SYSTEM_ERROR,
        category: EventCategory.PHARMACY,
        severity: EventSeverity.ERROR,
        targetId: pharmacyId,
        targetType: "pharmacy",
        description: `Erro ao processar mudança de status: ${errorMessage}`,
        metadata: { error: errorMessage, previousStatus, newStatus },
        actorType: "system",
      });

      return {
        success: false,
        pharmacyId,
        action: "onUpdate",
        timestamp: new Date(),
        error: errorMessage,
      };
    }
  });

/**
 * Notifica administradores sobre nova farmácia
 */
async function notifyAdminsNewPharmacy(
  pharmacyId: string,
  pharmacyData: PharmacyData
): Promise<void> {
  try {
    const db = admin.firestore();

    // Buscar administradores com permissão de aprovar farmácias
    const adminsSnapshot = await db
      .collection("admins")
      .where("role", "in", ["super_admin", "pharmacy_admin"])
      .where("active", "==", true)
      .get();

    if (adminsSnapshot.empty) {
      console.log("[PharmacyTrigger] No admins found to notify");
      return;
    }

    // Coletar tokens FCM
    const fcmTokens: string[] = [];
    adminsSnapshot.docs.forEach((doc) => {
      const tokens = doc.data().fcmTokens as string[] | undefined;
      if (tokens) {
        fcmTokens.push(...tokens);
      }
    });

    if (fcmTokens.length === 0) {
      console.log("[PharmacyTrigger] No FCM tokens for admins");
      return;
    }

    // Enviar notificação
    const message: admin.messaging.MulticastMessage = {
      tokens: fcmTokens,
      notification: {
        title: "🏥 Nova Farmácia Registrada",
        body: `${pharmacyData.name} - Aguardando aprovação`,
      },
      data: {
        type: "NEW_PHARMACY_APPROVAL",
        pharmacyId,
        pharmacyName: pharmacyData.name,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "admin_alerts",
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
      "[PharmacyTrigger] 📱 Admin notification sent | " +
      `Success: ${response.successCount}, Failures: ${response.failureCount}`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[PharmacyTrigger] Admin notification error: ${errorMessage}`);
  }
}

/**
 * Envia notificação para farmácia sobre mudança de status
 */
async function sendPharmacyStatusNotification(
  pharmacyId: string,
  pharmacyData: PharmacyData,
  newStatus: PharmacyStatus
): Promise<void> {
  try {
    const fcmTokens = pharmacyData.fcmTokens;

    if (!fcmTokens || fcmTokens.length === 0) {
      console.log(`[PharmacyTrigger] No FCM tokens for pharmacy ${pharmacyId}`);
      return;
    }

    // Mensagens personalizadas por status
    const statusMessages: Record<PharmacyStatus, { title: string; body: string }> = {
      [PharmacyStatus.PENDING]: {
        title: "📝 Cadastro em Análise",
        body: "Seu cadastro está sendo analisado",
      },
      [PharmacyStatus.APPROVED]: {
        title: "🎉 Farmácia Aprovada!",
        body: "Parabéns! Sua farmácia foi aprovada e já pode operar",
      },
      [PharmacyStatus.REJECTED]: {
        title: "❌ Cadastro Rejeitado",
        body: pharmacyData.rejectionReason || "Seu cadastro foi rejeitado",
      },
      [PharmacyStatus.SUSPENDED]: {
        title: "⚠️ Farmácia Suspensa",
        body: pharmacyData.suspensionReason || "Sua farmácia foi suspensa",
      },
      [PharmacyStatus.INACTIVE]: {
        title: "💤 Farmácia Inativa",
        body: "Sua farmácia está inativa",
      },
    };

    const messageContent = statusMessages[newStatus] || {
      title: "📋 Atualização de Status",
      body: `Status atualizado para: ${newStatus}`,
    };

    const message: admin.messaging.MulticastMessage = {
      tokens: fcmTokens,
      notification: {
        title: messageContent.title,
        body: messageContent.body,
      },
      data: {
        type: "PHARMACY_STATUS_UPDATE",
        pharmacyId,
        newStatus,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "pharmacy_status",
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

    const db = admin.firestore();
    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(
      "[PharmacyTrigger] 📱 Pharmacy notification sent | " +
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
          .doc(pharmacyId)
          .update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
          });
        console.log(
          `[PharmacyTrigger] 🧹 Removed ${invalidTokens.length} invalid FCM tokens`
        );
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[PharmacyTrigger] Pharmacy notification error: ${errorMessage}`);
  }
}

/**
 * Executa ações específicas baseadas no novo status
 */
async function executeStatusSpecificActions(
  pharmacyId: string,
  pharmacyData: PharmacyData,
  previousStatus: PharmacyStatus,
  newStatus: PharmacyStatus
): Promise<void> {
  const db = admin.firestore();

  try {
    switch (newStatus) {
    case PharmacyStatus.APPROVED:
      // Ativar produtos da farmácia
      await activatePharmacyProducts(pharmacyId);

      // Enviar email de boas-vindas (criar documento para trigger de email)
      await db.collection("mail_queue").add({
        to: pharmacyData.email,
        template: "pharmacy_approved",
        data: {
          pharmacyName: pharmacyData.name,
          pharmacyId,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[PharmacyTrigger] ✅ Pharmacy ${pharmacyId} activated`);
      break;

    case PharmacyStatus.SUSPENDED:
      // Desativar produtos da farmácia
      await deactivatePharmacyProducts(pharmacyId);

      // Cancelar pedidos pendentes
      await cancelPendingOrders(pharmacyId);

      console.log(`[PharmacyTrigger] ⚠️ Pharmacy ${pharmacyId} suspended`);
      break;

    case PharmacyStatus.REJECTED:
      // Enviar email de rejeição
      await db.collection("mail_queue").add({
        to: pharmacyData.email,
        template: "pharmacy_rejected",
        data: {
          pharmacyName: pharmacyData.name,
          reason: pharmacyData.rejectionReason,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[PharmacyTrigger] ❌ Pharmacy ${pharmacyId} rejected`);
      break;

    default:
      console.log(`[PharmacyTrigger] ℹ️ No specific action for status: ${newStatus}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[PharmacyTrigger] Status action error: ${errorMessage}`);
  }
}

/**
 * Ativa todos os produtos de uma farmácia
 */
async function activatePharmacyProducts(pharmacyId: string): Promise<void> {
  const db = admin.firestore();

  const productsSnapshot = await db
    .collection("products")
    .where("pharmacyId", "==", pharmacyId)
    .where("active", "==", false)
    .get();

  if (productsSnapshot.empty) {
    return;
  }

  const batch = db.batch();

  productsSnapshot.docs.forEach((doc) => {
    batch.update(doc.ref, { active: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });

  await batch.commit();

  console.log(`[PharmacyTrigger] ✅ Activated ${productsSnapshot.size} products for pharmacy ${pharmacyId}`);
}

/**
 * Desativa todos os produtos de uma farmácia
 */
async function deactivatePharmacyProducts(pharmacyId: string): Promise<void> {
  const db = admin.firestore();

  const productsSnapshot = await db
    .collection("products")
    .where("pharmacyId", "==", pharmacyId)
    .where("active", "==", true)
    .get();

  if (productsSnapshot.empty) {
    return;
  }

  const batch = db.batch();

  productsSnapshot.docs.forEach((doc) => {
    batch.update(doc.ref, { active: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  });

  await batch.commit();

  console.log(`[PharmacyTrigger] ⚠️ Deactivated ${productsSnapshot.size} products for pharmacy ${pharmacyId}`);
}

/**
 * Cancela pedidos pendentes de uma farmácia
 */
async function cancelPendingOrders(pharmacyId: string): Promise<void> {
  const db = admin.firestore();

  const ordersSnapshot = await db
    .collection("orders")
    .where("pharmacyId", "==", pharmacyId)
    .where("status", "in", ["pending", "confirmed", "processing"])
    .get();

  if (ordersSnapshot.empty) {
    return;
  }

  const batch = db.batch();

  ordersSnapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      status: "cancelled",
      cancellationReason: "Farmácia suspensa",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();

  console.log(`[PharmacyTrigger] ❌ Cancelled ${ordersSnapshot.size} pending orders for pharmacy ${pharmacyId}`);
}

/**
 * Mapeia status para tipo de evento
 */
function getEventTypeForPharmacyStatus(status: PharmacyStatus): EventType {
  const mapping: Record<PharmacyStatus, EventType> = {
    [PharmacyStatus.PENDING]: EventType.PHARMACY_REGISTERED,
    [PharmacyStatus.APPROVED]: EventType.PHARMACY_APPROVED,
    [PharmacyStatus.REJECTED]: EventType.PHARMACY_REJECTED,
    [PharmacyStatus.SUSPENDED]: EventType.PHARMACY_SUSPENDED,
    [PharmacyStatus.INACTIVE]: EventType.PHARMACY_UPDATED,
  };

  return mapping[status] || EventType.PHARMACY_UPDATED;
}

/**
 * Mapeia status para severidade
 */
function getSeverityForPharmacyStatus(status: PharmacyStatus): EventSeverity {
  const mapping: Record<PharmacyStatus, EventSeverity> = {
    [PharmacyStatus.PENDING]: EventSeverity.INFO,
    [PharmacyStatus.APPROVED]: EventSeverity.INFO,
    [PharmacyStatus.REJECTED]: EventSeverity.WARNING,
    [PharmacyStatus.SUSPENDED]: EventSeverity.WARNING,
    [PharmacyStatus.INACTIVE]: EventSeverity.INFO,
  };

  return mapping[status] || EventSeverity.INFO;
}

/**
 * Mapeia status para ação de auditoria
 */
function getAuditActionForPharmacyStatus(status: PharmacyStatus): AuditAction {
  const mapping: Record<PharmacyStatus, AuditAction> = {
    [PharmacyStatus.PENDING]: AuditAction.PHARMACY_APPROVED, // Fallback
    [PharmacyStatus.APPROVED]: AuditAction.PHARMACY_APPROVED,
    [PharmacyStatus.REJECTED]: AuditAction.PHARMACY_APPROVED, // Use existing action
    [PharmacyStatus.SUSPENDED]: AuditAction.PHARMACY_APPROVED, // Use existing action
    [PharmacyStatus.INACTIVE]: AuditAction.PHARMACY_APPROVED, // Use existing action
  };

  return mapping[status] || AuditAction.PHARMACY_APPROVED;
}
