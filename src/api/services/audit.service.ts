/**
 * 📋 Audit Service
 * 
 * Serviço centralizado para logging de auditoria.
 * Registra todas as ações administrativas para rastreabilidade.
 * 
 * Segue princípios SOLID:
 * - Single Responsibility: Apenas gerencia audit logs
 * - Open/Closed: Extensível via novos AuditAction
 * 
 * @module services/audit
 * @version 2.0.0
 */

import * as admin from "firebase-admin";

const getDb = () => admin.firestore();

/**
 * Ações de auditoria disponíveis
 */
export enum AuditAction {
  // Orders
  ORDER_CREATED = "ORDER_CREATED",
  ORDER_STATUS_CHANGED = "ORDER_STATUS_CHANGED",
  ORDER_CANCELLED = "ORDER_CANCELLED",
  REFUND_REQUESTED = "REFUND_REQUESTED",
  REFUND_PROCESSED = "REFUND_PROCESSED",
  REFUND_REJECTED = "REFUND_REJECTED",
  
  // Pharmacies
  PHARMACY_CREATED = "PHARMACY_CREATED",
  PHARMACY_APPROVED = "PHARMACY_APPROVED",
  PHARMACY_SUSPENDED = "PHARMACY_SUSPENDED",
  PHARMACY_REJECTED = "PHARMACY_REJECTED",
  PHARMACY_UPDATED = "PHARMACY_UPDATED",
  
  // Products
  PRODUCT_CREATED = "PRODUCT_CREATED",
  PRODUCT_UPDATED = "PRODUCT_UPDATED",
  PRODUCT_DELETED = "PRODUCT_DELETED",
  STOCK_UPDATED = "STOCK_UPDATED",
  
  // Users
  USER_CREATED = "USER_CREATED",
  USER_UPDATED = "USER_UPDATED",
  USER_SUSPENDED = "USER_SUSPENDED",
  USER_DELETED = "USER_DELETED",
  ROLE_ASSIGNED = "ROLE_ASSIGNED",
  ROLE_REVOKED = "ROLE_REVOKED",
  
  // Financial
  PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
  PAYOUT_PROCESSED = "PAYOUT_PROCESSED",
  
  // System
  CONFIG_CHANGED = "CONFIG_CHANGED",
  API_KEY_CREATED = "API_KEY_CREATED",
  API_KEY_REVOKED = "API_KEY_REVOKED",
  SYSTEM_ERROR = "SYSTEM_ERROR",
}

/**
 * Tipo de alvo da ação
 */
export type AuditTargetType = 
  | "order" 
  | "pharmacy" 
  | "product" 
  | "user" 
  | "refund"
  | "payment"
  | "system"
  | "config";

/**
 * Interface para entrada de log de auditoria
 */
export interface AuditLogInput {
  action: AuditAction;
  adminId: string;
  adminEmail: string;
  targetType: AuditTargetType;
  targetId: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Interface para entrada de log salva
 */
export interface AuditLogEntry extends AuditLogInput {
  id: string;
  timestamp: FirebaseFirestore.Timestamp;
}

/**
 * Interface para filtros de busca
 */
export interface AuditSearchFilters {
  adminId?: string;
  adminEmail?: string;
  action?: AuditAction;
  targetType?: AuditTargetType;
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Serviço de Auditoria
 * 
 * @example
 * const audit = new AuditService();
 * await audit.log({
 *   action: AuditAction.ORDER_CANCELLED,
 *   adminId: "admin123",
 *   adminEmail: "admin@example.com",
 *   targetType: "order",
 *   targetId: "order456",
 *   details: { reason: "Customer request" }
 * });
 */
export class AuditService {
  private readonly collectionName = "audit_logs";

  /**
   * Registra uma ação no log de auditoria
   */
  async log(input: AuditLogInput): Promise<string> {
    const logEntry = {
      ...input,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: new Date().toISOString(), // String backup for queries
    };

    const docRef = await getDb().collection(this.collectionName).add(logEntry);
    
    return docRef.id;
  }

  /**
   * Registra múltiplas ações em batch
   */
  async logBatch(inputs: AuditLogInput[]): Promise<string[]> {
    const batch = getDb().batch();
    const ids: string[] = [];

    for (const input of inputs) {
      const docRef = getDb().collection(this.collectionName).doc();
      ids.push(docRef.id);

      batch.set(docRef, {
        ...input,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: new Date().toISOString(),
      });
    }

    await batch.commit();
    return ids;
  }

  /**
   * Busca logs de auditoria com filtros
   */
  async search(filters: AuditSearchFilters): Promise<AuditLogEntry[]> {
    let query: admin.firestore.Query = getDb().collection(this.collectionName);

    if (filters.adminId) {
      query = query.where("adminId", "==", filters.adminId);
    }
    if (filters.adminEmail) {
      query = query.where("adminEmail", "==", filters.adminEmail);
    }
    if (filters.action) {
      query = query.where("action", "==", filters.action);
    }
    if (filters.targetType) {
      query = query.where("targetType", "==", filters.targetType);
    }
    if (filters.targetId) {
      query = query.where("targetId", "==", filters.targetId);
    }
    if (filters.startDate) {
      query = query.where("timestamp", ">=", filters.startDate);
    }
    if (filters.endDate) {
      query = query.where("timestamp", "<=", filters.endDate);
    }

    query = query
      .orderBy("timestamp", "desc")
      .limit(filters.limit || 50)
      .offset(filters.offset || 0);

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as AuditLogEntry[];
  }

  /**
   * Busca histórico de auditoria para um alvo específico
   */
  async getTargetHistory(
    targetType: AuditTargetType,
    targetId: string,
    limit = 50
  ): Promise<AuditLogEntry[]> {
    const snapshot = await getDb()
      .collection(this.collectionName)
      .where("targetType", "==", targetType)
      .where("targetId", "==", targetId)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as AuditLogEntry[];
  }

  /**
   * Busca ações de um admin específico
   */
  async getAdminHistory(adminId: string, limit = 50): Promise<AuditLogEntry[]> {
    const snapshot = await getDb()
      .collection(this.collectionName)
      .where("adminId", "==", adminId)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as AuditLogEntry[];
  }

  /**
   * Conta ações por tipo em um período
   */
  async countActionsByType(
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, number>> {
    const snapshot = await getDb()
      .collection(this.collectionName)
      .where("timestamp", ">=", startDate)
      .where("timestamp", "<=", endDate)
      .get();

    const counts: Record<string, number> = {};
    snapshot.docs.forEach((doc) => {
      const action = doc.data().action;
      counts[action] = (counts[action] || 0) + 1;
    });

    return counts;
  }

  /**
   * Busca ações críticas recentes (para alertas)
   */
  async getRecentCriticalActions(hoursAgo = 24): Promise<AuditLogEntry[]> {
    const criticalActions = [
      AuditAction.PHARMACY_SUSPENDED,
      AuditAction.USER_SUSPENDED,
      AuditAction.USER_DELETED,
      AuditAction.REFUND_PROCESSED,
      AuditAction.API_KEY_REVOKED,
      AuditAction.SYSTEM_ERROR,
    ];

    const startDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    const snapshot = await getDb()
      .collection(this.collectionName)
      .where("action", "in", criticalActions)
      .where("timestamp", ">=", startDate)
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as AuditLogEntry[];
  }

  /**
   * Obtém um log específico por ID
   */
  async getById(id: string): Promise<AuditLogEntry | null> {
    const doc = await getDb().collection(this.collectionName).doc(id).get();

    if (!doc.exists) {
      return null;
    }

    return {
      id: doc.id,
      ...doc.data(),
    } as AuditLogEntry;
  }

  /**
   * Helper para criar log de sistema (sem admin específico)
   */
  async logSystemAction(
    action: AuditAction,
    targetType: AuditTargetType,
    targetId: string,
    details?: Record<string, any>
  ): Promise<string> {
    return this.log({
      action,
      adminId: "SYSTEM",
      adminEmail: "system@medicamenta.me",
      targetType,
      targetId,
      details,
    });
  }
}

// Singleton instance
export const auditService = new AuditService();
