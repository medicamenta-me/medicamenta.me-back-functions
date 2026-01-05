/**
 * Event Log Service
 *
 * Serviço para registro de eventos de sistema para auditoria,
 * rastreabilidade e análise de dados.
 *
 * LGPD Compliance: Dados sensíveis são mascarados/removidos
 * SOLID: Single Responsibility - apenas logging de eventos
 *
 * @module services/event-log
 * @version 1.0.0
 */

import * as admin from "firebase-admin";

/**
 * Tipos de eventos do sistema
 */
export enum EventType {
  // Order Events
  ORDER_CREATED = "ORDER_CREATED",
  ORDER_STATUS_UPDATED = "ORDER_STATUS_UPDATED",
  ORDER_CANCELLED = "ORDER_CANCELLED",
  ORDER_COMPLETED = "ORDER_COMPLETED",
  ORDER_PAYMENT_RECEIVED = "ORDER_PAYMENT_RECEIVED",
  ORDER_SHIPPED = "ORDER_SHIPPED",
  ORDER_DELIVERED = "ORDER_DELIVERED",

  // Pharmacy Events
  PHARMACY_REGISTERED = "PHARMACY_REGISTERED",
  PHARMACY_APPROVED = "PHARMACY_APPROVED",
  PHARMACY_REJECTED = "PHARMACY_REJECTED",
  PHARMACY_SUSPENDED = "PHARMACY_SUSPENDED",
  PHARMACY_REACTIVATED = "PHARMACY_REACTIVATED",
  PHARMACY_UPDATED = "PHARMACY_UPDATED",

  // Product Events
  PRODUCT_CREATED = "PRODUCT_CREATED",
  PRODUCT_UPDATED = "PRODUCT_UPDATED",
  PRODUCT_DELETED = "PRODUCT_DELETED",
  PRODUCT_STOCK_UPDATED = "PRODUCT_STOCK_UPDATED",
  PRODUCT_PRICE_CHANGED = "PRODUCT_PRICE_CHANGED",

  // User Events
  USER_REGISTERED = "USER_REGISTERED",
  USER_LOGIN = "USER_LOGIN",
  USER_PROFILE_UPDATED = "USER_PROFILE_UPDATED",

  // System Events
  SYSTEM_MAINTENANCE = "SYSTEM_MAINTENANCE",
  SYSTEM_ERROR = "SYSTEM_ERROR",
  SYSTEM_WARNING = "SYSTEM_WARNING",
}

/**
 * Severidade do evento
 */
export enum EventSeverity {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL",
}

/**
 * Categoria do evento
 */
export enum EventCategory {
  ORDER = "ORDER",
  PHARMACY = "PHARMACY",
  PRODUCT = "PRODUCT",
  USER = "USER",
  SYSTEM = "SYSTEM",
  PAYMENT = "PAYMENT",
  NOTIFICATION = "NOTIFICATION",
}

/**
 * Input para criação de evento
 */
export interface EventLogInput {
  type: EventType;
  category: EventCategory;
  severity: EventSeverity;
  targetId: string;
  targetType: string;
  description: string;
  metadata?: Record<string, unknown>;
  actorId?: string;
  actorType?: "user" | "pharmacy" | "admin" | "system";
  correlationId?: string;
  ipAddress?: string;
}

/**
 * Entrada de evento no Firestore
 */
export interface EventLogEntry extends EventLogInput {
  id: string;
  timestamp: Date;
  processedAt?: Date;
  version: string;
}

/**
 * Filtros para busca de eventos
 */
export interface EventLogFilter {
  type?: EventType;
  category?: EventCategory;
  severity?: EventSeverity;
  targetId?: string;
  targetType?: string;
  actorId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  correlationId?: string;
}

/**
 * Resultado agregado de eventos
 */
export interface EventAggregation {
  type: EventType;
  count: number;
  lastOccurrence: Date;
}

/**
 * EventLogService - Serviço de registro de eventos
 */
export class EventLogService {
  private readonly COLLECTION_NAME = "event_logs";
  private readonly VERSION = "1.0.0";
  private readonly MAX_BATCH_SIZE = 500;
  private readonly MAX_METADATA_SIZE = 10000; // 10KB max para metadata

  /**
   * Registra um evento no sistema
   */
  async log(input: EventLogInput): Promise<string> {
    const startTime = Date.now();

    try {
      // Validação
      this.validateInput(input);

      // Sanitização de metadata (LGPD)
      const sanitizedMetadata = this.sanitizeMetadata(input.metadata);

      const db = admin.firestore();
      const docRef = db.collection(this.COLLECTION_NAME).doc();

      const entry: Omit<EventLogEntry, "id"> = {
        ...input,
        metadata: sanitizedMetadata,
        timestamp: new Date(),
        version: this.VERSION,
      };

      await docRef.set(entry);

      const duration = Date.now() - startTime;
      console.log(
        `[EventLog] ✅ ${input.type} logged | Target: ${input.targetId} | Duration: ${duration}ms`
      );

      return docRef.id;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[EventLog] ❌ Error logging event: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Registra múltiplos eventos em batch
   */
  async logBatch(inputs: EventLogInput[]): Promise<string[]> {
    if (inputs.length === 0) {
      return [];
    }

    if (inputs.length > this.MAX_BATCH_SIZE) {
      throw new Error(
        `Batch size ${inputs.length} exceeds maximum ${this.MAX_BATCH_SIZE}`
      );
    }

    const startTime = Date.now();
    const db = admin.firestore();
    const batch = db.batch();
    const ids: string[] = [];

    for (const input of inputs) {
      this.validateInput(input);

      const docRef = db.collection(this.COLLECTION_NAME).doc();
      ids.push(docRef.id);

      const sanitizedMetadata = this.sanitizeMetadata(input.metadata);

      const entry: Omit<EventLogEntry, "id"> = {
        ...input,
        metadata: sanitizedMetadata,
        timestamp: new Date(),
        version: this.VERSION,
      };

      batch.set(docRef, entry);
    }

    await batch.commit();

    const duration = Date.now() - startTime;
    console.log(
      `[EventLog] ✅ Batch logged ${inputs.length} events | Duration: ${duration}ms`
    );

    return ids;
  }

  /**
   * Busca eventos com filtros
   */
  async search(filter: EventLogFilter): Promise<EventLogEntry[]> {
    const db = admin.firestore();
    let query: admin.firestore.Query = db.collection(this.COLLECTION_NAME);

    if (filter.type) {
      query = query.where("type", "==", filter.type);
    }

    if (filter.category) {
      query = query.where("category", "==", filter.category);
    }

    if (filter.severity) {
      query = query.where("severity", "==", filter.severity);
    }

    if (filter.targetId) {
      query = query.where("targetId", "==", filter.targetId);
    }

    if (filter.targetType) {
      query = query.where("targetType", "==", filter.targetType);
    }

    if (filter.actorId) {
      query = query.where("actorId", "==", filter.actorId);
    }

    if (filter.correlationId) {
      query = query.where("correlationId", "==", filter.correlationId);
    }

    if (filter.startDate) {
      query = query.where("timestamp", ">=", filter.startDate);
    }

    if (filter.endDate) {
      query = query.where("timestamp", "<=", filter.endDate);
    }

    query = query.orderBy("timestamp", "desc");

    if (filter.limit) {
      query = query.limit(filter.limit);
    } else {
      query = query.limit(100);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      timestamp: (doc.data().timestamp as admin.firestore.Timestamp).toDate(),
    })) as EventLogEntry[];
  }

  /**
   * Obtém histórico de eventos de um target específico
   */
  async getTargetHistory(
    targetId: string,
    targetType: string,
    limit: number = 50
  ): Promise<EventLogEntry[]> {
    return this.search({
      targetId,
      targetType,
      limit,
    });
  }

  /**
   * Obtém eventos por correlationId (para rastrear fluxos)
   */
  async getCorrelatedEvents(correlationId: string): Promise<EventLogEntry[]> {
    return this.search({
      correlationId,
      limit: 100,
    });
  }

  /**
   * Conta eventos por tipo em um período
   */
  async countByType(
    type: EventType,
    startDate?: Date,
    endDate?: Date
  ): Promise<number> {
    const db = admin.firestore();
    let query: admin.firestore.Query = db
      .collection(this.COLLECTION_NAME)
      .where("type", "==", type);

    if (startDate) {
      query = query.where("timestamp", ">=", startDate);
    }

    if (endDate) {
      query = query.where("timestamp", "<=", endDate);
    }

    const snapshot = await query.count().get();
    return snapshot.data().count;
  }

  /**
   * Obtém agregação de eventos por categoria
   */
  async getAggregationByCategory(
    category: EventCategory,
    startDate?: Date,
    endDate?: Date
  ): Promise<EventAggregation[]> {
    const events = await this.search({
      category,
      startDate,
      endDate,
      limit: 1000,
    });

    const aggregation = new Map<EventType, EventAggregation>();

    for (const event of events) {
      const existing = aggregation.get(event.type);
      if (existing) {
        existing.count++;
        if (event.timestamp > existing.lastOccurrence) {
          existing.lastOccurrence = event.timestamp;
        }
      } else {
        aggregation.set(event.type, {
          type: event.type,
          count: 1,
          lastOccurrence: event.timestamp,
        });
      }
    }

    return Array.from(aggregation.values());
  }

  /**
   * Obtém eventos críticos recentes
   */
  async getRecentCriticalEvents(
    hoursBack: number = 24
  ): Promise<EventLogEntry[]> {
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hoursBack);

    return this.search({
      severity: EventSeverity.CRITICAL,
      startDate,
      limit: 100,
    });
  }

  /**
   * Obtém eventos de erro recentes
   */
  async getRecentErrors(hoursBack: number = 24): Promise<EventLogEntry[]> {
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hoursBack);

    return this.search({
      severity: EventSeverity.ERROR,
      startDate,
      limit: 100,
    });
  }

  /**
   * Registra evento de sistema
   */
  async logSystemEvent(
    type: EventType,
    description: string,
    severity: EventSeverity = EventSeverity.INFO,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    return this.log({
      type,
      category: EventCategory.SYSTEM,
      severity,
      targetId: "system",
      targetType: "system",
      description,
      metadata,
      actorType: "system",
    });
  }

  /**
   * Registra evento de ordem
   */
  async logOrderEvent(
    type: EventType,
    orderId: string,
    description: string,
    metadata?: Record<string, unknown>,
    actorId?: string,
    actorType?: "user" | "pharmacy" | "admin" | "system"
  ): Promise<string> {
    return this.log({
      type,
      category: EventCategory.ORDER,
      severity: EventSeverity.INFO,
      targetId: orderId,
      targetType: "order",
      description,
      metadata,
      actorId,
      actorType,
    });
  }

  /**
   * Registra evento de farmácia
   */
  async logPharmacyEvent(
    type: EventType,
    pharmacyId: string,
    description: string,
    severity: EventSeverity = EventSeverity.INFO,
    metadata?: Record<string, unknown>,
    actorId?: string
  ): Promise<string> {
    return this.log({
      type,
      category: EventCategory.PHARMACY,
      severity,
      targetId: pharmacyId,
      targetType: "pharmacy",
      description,
      metadata,
      actorId,
      actorType: actorId ? "admin" : "system",
    });
  }

  /**
   * Registra evento de produto
   */
  async logProductEvent(
    type: EventType,
    productId: string,
    pharmacyId: string,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    return this.log({
      type,
      category: EventCategory.PRODUCT,
      severity: EventSeverity.INFO,
      targetId: productId,
      targetType: "product",
      description,
      metadata: {
        ...metadata,
        pharmacyId,
      },
      actorId: pharmacyId,
      actorType: "pharmacy",
    });
  }

  /**
   * Valida input de evento
   */
  private validateInput(input: EventLogInput): void {
    if (!input.type) {
      throw new Error("Event type is required");
    }

    if (!input.category) {
      throw new Error("Event category is required");
    }

    if (!input.severity) {
      throw new Error("Event severity is required");
    }

    if (!input.targetId) {
      throw new Error("Target ID is required");
    }

    if (!input.targetType) {
      throw new Error("Target type is required");
    }

    if (!input.description) {
      throw new Error("Event description is required");
    }

    if (input.description.length > 1000) {
      throw new Error("Description exceeds maximum length of 1000 characters");
    }
  }

  /**
   * Sanitiza metadata removendo dados sensíveis (LGPD)
   */
  private sanitizeMetadata(
    metadata?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!metadata) {
      return undefined;
    }

    // Lista de campos sensíveis a serem removidos/mascarados
    const sensitiveFields = [
      "password",
      "senha",
      "token",
      "accessToken",
      "refreshToken",
      "cpf",
      "cnpj",
      "creditCard",
      "cartao",
      "cvv",
      "securityCode",
      "pin",
    ];

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(metadata)) {
      const lowerKey = key.toLowerCase();

      // Remove campos sensíveis
      if (sensitiveFields.some((field) => lowerKey.includes(field))) {
        sanitized[key] = "[REDACTED]";
      }
      // Mascara emails
      else if (lowerKey.includes("email") && typeof value === "string") {
        sanitized[key] = this.maskEmail(value);
      }
      // Mascara telefones
      else if (lowerKey.includes("phone") && typeof value === "string") {
        sanitized[key] = this.maskPhone(value);
      }
      // Recursivamente sanitiza objetos aninhados
      else if (typeof value === "object" && value !== null) {
        sanitized[key] = this.sanitizeMetadata(
          value as Record<string, unknown>
        );
      } else {
        sanitized[key] = value;
      }
    }

    // Verifica tamanho máximo
    const jsonSize = JSON.stringify(sanitized).length;
    if (jsonSize > this.MAX_METADATA_SIZE) {
      console.warn(
        `[EventLog] Metadata size ${jsonSize} exceeds limit, truncating`
      );
      return { truncated: true, originalSize: jsonSize };
    }

    return sanitized;
  }

  /**
   * Mascara email para LGPD
   */
  private maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!domain) return "***@***";

    const maskedLocal =
      local.length > 2 ? local[0] + "***" + local[local.length - 1] : "***";

    return `${maskedLocal}@${domain}`;
  }

  /**
   * Mascara telefone para LGPD
   */
  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 4) return "****";

    return (
      digits.slice(0, 2) + "***" + digits.slice(-2)
    );
  }
}

// Singleton export
export const eventLogService = new EventLogService();
