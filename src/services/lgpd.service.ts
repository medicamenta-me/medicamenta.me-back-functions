/**
 * LGPD Compliance Service
 * 
 * Implementa os direitos do titular de dados conforme Lei 13.709/2018:
 * - Art. 18, I: Confirmação de existência de tratamento
 * - Art. 18, II: Acesso aos dados
 * - Art. 18, III: Correção de dados incompletos
 * - Art. 18, IV: Anonimização, bloqueio ou eliminação
 * - Art. 18, V: Portabilidade dos dados
 * - Art. 18, VI: Eliminação dos dados
 * - Art. 18, VII: Informação sobre compartilhamento
 * - Art. 18, VIII: Possibilidade de não fornecer consentimento
 * - Art. 18, IX: Revogação do consentimento
 * 
 * @module services/lgpd
 */

import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { createLogger, Logger } from "../utils/structured-logger";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Tipos de solicitação do titular de dados
 */
export type DataSubjectRequestType = 
  | "access"        // Acesso aos dados (Art. 18, II)
  | "rectification" // Correção de dados (Art. 18, III)
  | "deletion"      // Eliminação (Art. 18, VI)
  | "portability"   // Portabilidade (Art. 18, V)
  | "restriction"   // Bloqueio (Art. 18, IV)
  | "objection";    // Oposição ao tratamento

/**
 * Status da solicitação
 */
export type DataSubjectRequestStatus = 
  | "pending"     // Aguardando processamento
  | "processing"  // Em processamento
  | "completed"   // Concluída
  | "rejected"    // Rejeitada (com justificativa legal)
  | "expired";    // Expirada (prazo legal esgotado)

/**
 * Solicitação do titular de dados
 */
export interface DataSubjectRequest {
  id: string;
  type: DataSubjectRequestType;
  userId: string;
  userEmail: string;
  requestedAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  status: DataSubjectRequestStatus;
  reason?: string;
  rejectionReason?: string;
  legalBasis?: string;
  processedBy?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Consentimento do usuário
 */
export interface UserConsent {
  userId: string;
  purposes: ConsentPurpose[];
  grantedAt: Date;
  expiresAt?: Date;
  ipAddress?: string;
  userAgent?: string;
  version: string;
  revoked: boolean;
  revokedAt?: Date;
}

/**
 * Propósitos de consentimento
 */
export interface ConsentPurpose {
  id: string;
  name: string;
  description: string;
  required: boolean;
  granted: boolean;
  grantedAt?: Date;
}

/**
 * Exportação de dados do usuário
 */
export interface UserDataExport {
  exportId: string;
  exportedAt: string;
  userId: string;
  format: "json" | "csv";
  data: {
    profile: Record<string, unknown>;
    medications: Record<string, unknown>[];
    prescriptions: Record<string, unknown>[];
    orders: Record<string, unknown>[];
    consents: UserConsent[];
    activityLog: Record<string, unknown>[];
  };
  checksum: string;
}

/**
 * Resultado de verificação de retenção
 */
export interface RetentionCheckResult {
  eligible: boolean;
  retentionUntil?: string;
  reason?: string;
  legalBasis?: string;
  dataCategories?: DataCategoryRetention[];
}

/**
 * Retenção por categoria de dados
 */
export interface DataCategoryRetention {
  category: string;
  retentionPeriodDays: number;
  legalBasis: string;
  canDelete: boolean;
}

/**
 * Propósitos de consentimento padrão
 */
export const DEFAULT_CONSENT_PURPOSES: Omit<ConsentPurpose, "granted" | "grantedAt">[] = [
  {
    id: "essential",
    name: "Funcionalidades Essenciais",
    description:
      "Necessário para o funcionamento básico da plataforma, incluindo autenticação e gestão de medicamentos.",
    required: true,
  },
  {
    id: "health_tracking",
    name: "Rastreamento de Saúde",
    description: "Permite registrar e acompanhar o histórico de uso de medicamentos e saúde.",
    required: false,
  },
  {
    id: "notifications",
    name: "Notificações e Lembretes",
    description: "Envia lembretes de medicamentos e notificações importantes.",
    required: false,
  },
  {
    id: "analytics",
    name: "Análise de Uso",
    description: "Coleta dados anônimos para melhorar a experiência do usuário.",
    required: false,
  },
  {
    id: "marketing",
    name: "Comunicações de Marketing",
    description: "Recebe ofertas e promoções de farmácias parceiras.",
    required: false,
  },
  {
    id: "third_party_sharing",
    name: "Compartilhamento com Terceiros",
    description: "Permite compartilhar dados com farmácias para processamento de pedidos.",
    required: false,
  },
];

/**
 * Períodos de retenção por categoria (em dias)
 * Baseado em legislação brasileira
 */
export const RETENTION_PERIODS: Record<string, DataCategoryRetention> = {
  // Dados médicos - 20 anos (Resolução CFM 1.821/2007)
  medical_records: {
    category: "medical_records",
    retentionPeriodDays: 20 * 365, // 20 anos
    legalBasis: "Resolução CFM 1.821/2007 - Prontuário médico",
    canDelete: false,
  },
  // Prescrições - 5 anos (Portaria SVS/MS 344/98)
  prescriptions: {
    category: "prescriptions",
    retentionPeriodDays: 5 * 365, // 5 anos
    legalBasis: "Portaria SVS/MS 344/98 - Receituário controlado",
    canDelete: false,
  },
  // Dados fiscais - 5 anos (CTN Art. 173)
  fiscal_records: {
    category: "fiscal_records",
    retentionPeriodDays: 5 * 365, // 5 anos
    legalBasis: "CTN Art. 173 - Decadência tributária",
    canDelete: false,
  },
  // Dados de pedidos - 5 anos (CDC Art. 27)
  orders: {
    category: "orders",
    retentionPeriodDays: 5 * 365, // 5 anos
    legalBasis: "CDC Art. 27 - Prescrição para reparação de danos",
    canDelete: false,
  },
  // Dados de perfil - Sem retenção obrigatória
  profile: {
    category: "profile",
    retentionPeriodDays: 0,
    legalBasis: "LGPD Art. 18, VI - Direito à eliminação",
    canDelete: true,
  },
  // Logs de auditoria - 6 meses (Marco Civil Art. 15)
  audit_logs: {
    category: "audit_logs",
    retentionPeriodDays: 180, // 6 meses
    legalBasis: "Marco Civil da Internet Art. 15",
    canDelete: false,
  },
};

/**
 * Campos sensíveis para mascaramento (LGPD Art. 5, II)
 */
const SENSITIVE_FIELDS = [
  "cpf", "cnpj", "rg", "ssn",
  "email", "phone", "telefone", "celular",
  "password", "senha", "token", "apiKey",
  "cardNumber", "cvv", "cvc", "pin",
  "address", "endereco", "cep", "zipCode",
  "birthDate", "dataNascimento", "dateOfBirth",
  "healthData", "prescriptionData", "medicationHistory",
  "bloodType", "allergies", "diseases",
  "bankAccount", "accountNumber", "routingNumber",
];

// ============================================================================
// LGPD SERVICE
// ============================================================================

/**
 * Serviço de conformidade LGPD
 */
export class LGPDService {
  private db: FirebaseFirestore.Firestore;
  private logger: Logger;
  private readonly REQUESTS_COLLECTION = "lgpd_requests";
  private readonly CONSENTS_COLLECTION = "user_consents";
  private readonly CURRENT_CONSENT_VERSION = "1.0.0";

  constructor() {
    this.db = admin.firestore();
    this.logger = createLogger("lgpd-service");
  }

  // ==========================================================================
  // DATA SUBJECT REQUESTS
  // ==========================================================================

  /**
   * Cria uma nova solicitação do titular de dados
   * Prazo legal: 15 dias (LGPD Art. 18, §4º)
   */
  async createRequest(
    type: DataSubjectRequestType,
    userId: string,
    userEmail: string,
    reason?: string
  ): Promise<DataSubjectRequest> {
    const requestId = crypto.randomUUID();
    const now = new Date();

    const request: DataSubjectRequest = {
      id: requestId,
      type,
      userId,
      userEmail,
      requestedAt: now,
      status: "pending",
      reason,
    };

    await this.db.collection(this.REQUESTS_COLLECTION).doc(requestId).set({
      ...request,
      requestedAt: admin.firestore.Timestamp.fromDate(now),
    });

    this.logger.audit("lgpd_request_created", "lgpd_request", requestId, {
      type,
      userId,
      userEmail: this.maskEmail(userEmail),
    });

    return request;
  }

  /**
   * Processa uma solicitação do titular
   */
  async processRequest(
    requestId: string,
    adminId: string
  ): Promise<DataSubjectRequest> {
    const requestRef = this.db.collection(this.REQUESTS_COLLECTION).doc(requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      throw new Error(`Request ${requestId} not found`);
    }

    const request = requestDoc.data() as DataSubjectRequest;
    
    if (request.status !== "pending") {
      throw new Error(`Request ${requestId} is not pending`);
    }

    await requestRef.update({
      status: "processing",
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedBy: adminId,
    });

    this.logger.audit("lgpd_request_processing", "lgpd_request", requestId, {
      type: request.type,
      processedBy: adminId,
    });

    // Processar com base no tipo
    switch (request.type) {
    case "access":
      await this.handleAccessRequest(request);
      break;
    case "portability":
      await this.handlePortabilityRequest(request);
      break;
    case "deletion":
      await this.handleDeletionRequest(request);
      break;
    case "rectification":
      // Retorna para o admin completar manualmente
      break;
    case "restriction":
      await this.handleRestrictionRequest(request);
      break;
    case "objection":
      await this.handleObjectionRequest(request);
      break;
    }

    return { ...request, status: "processing" };
  }

  /**
   * Completa uma solicitação
   */
  async completeRequest(
    requestId: string,
    adminId: string,
    result?: Record<string, unknown>
  ): Promise<void> {
    const now = new Date();

    await this.db.collection(this.REQUESTS_COLLECTION).doc(requestId).update({
      status: "completed",
      completedAt: admin.firestore.Timestamp.fromDate(now),
      processedBy: adminId,
      metadata: result,
    });

    this.logger.audit("lgpd_request_completed", "lgpd_request", requestId, {
      completedBy: adminId,
    });
  }

  /**
   * Rejeita uma solicitação com justificativa legal
   */
  async rejectRequest(
    requestId: string,
    adminId: string,
    rejectionReason: string,
    legalBasis: string
  ): Promise<void> {
    await this.db.collection(this.REQUESTS_COLLECTION).doc(requestId).update({
      status: "rejected",
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedBy: adminId,
      rejectionReason,
      legalBasis,
    });

    this.logger.audit("lgpd_request_rejected", "lgpd_request", requestId, {
      rejectedBy: adminId,
      legalBasis,
    });
  }

  /**
   * Lista solicitações por status
   */
  async getRequestsByStatus(
    status: DataSubjectRequestStatus,
    limit = 50
  ): Promise<DataSubjectRequest[]> {
    const snapshot = await this.db
      .collection(this.REQUESTS_COLLECTION)
      .where("status", "==", status)
      .orderBy("requestedAt", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        requestedAt: data.requestedAt?.toDate(),
        processedAt: data.processedAt?.toDate(),
        completedAt: data.completedAt?.toDate(),
      } as DataSubjectRequest;
    });
  }

  // ==========================================================================
  // CONSENT MANAGEMENT
  // ==========================================================================

  /**
   * Registra consentimento do usuário
   */
  async recordConsent(
    userId: string,
    purposes: Array<{ id: string; granted: boolean }>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<UserConsent> {
    const now = new Date();
    
    const consentPurposes: ConsentPurpose[] = DEFAULT_CONSENT_PURPOSES.map(p => {
      const userChoice = purposes.find(up => up.id === p.id);
      return {
        ...p,
        granted: p.required || (userChoice?.granted ?? false),
        grantedAt: (p.required || userChoice?.granted) ? now : undefined,
      };
    });

    const consent: UserConsent = {
      userId,
      purposes: consentPurposes,
      grantedAt: now,
      ipAddress: ipAddress ? this.hashIp(ipAddress) : undefined,
      userAgent,
      version: this.CURRENT_CONSENT_VERSION,
      revoked: false,
    };

    await this.db.collection(this.CONSENTS_COLLECTION).doc(userId).set({
      ...consent,
      grantedAt: admin.firestore.Timestamp.fromDate(now),
    });

    this.logger.audit("consent_recorded", "user_consent", userId, {
      purposes: consentPurposes.filter(p => p.granted).map(p => p.id),
      version: this.CURRENT_CONSENT_VERSION,
    });

    return consent;
  }

  /**
   * Atualiza consentimento específico
   */
  async updateConsent(
    userId: string,
    purposeId: string,
    granted: boolean
  ): Promise<void> {
    const consentRef = this.db.collection(this.CONSENTS_COLLECTION).doc(userId);
    const consentDoc = await consentRef.get();

    if (!consentDoc.exists) {
      throw new Error(`Consent for user ${userId} not found`);
    }

    const consent = consentDoc.data() as UserConsent;
    const purposeIndex = consent.purposes.findIndex(p => p.id === purposeId);

    if (purposeIndex === -1) {
      throw new Error(`Purpose ${purposeId} not found`);
    }

    const purpose = consent.purposes[purposeIndex];
    
    if (purpose.required && !granted) {
      throw new Error(`Cannot revoke required consent: ${purposeId}`);
    }

    consent.purposes[purposeIndex] = {
      ...purpose,
      granted,
      grantedAt: granted ? new Date() : undefined,
    };

    await consentRef.update({
      purposes: consent.purposes,
    });

    this.logger.audit("consent_updated", "user_consent", userId, {
      purposeId,
      granted,
    });
  }

  /**
   * Revoga todos os consentimentos não obrigatórios
   */
  async revokeAllConsents(userId: string): Promise<void> {
    const consentRef = this.db.collection(this.CONSENTS_COLLECTION).doc(userId);
    const consentDoc = await consentRef.get();

    if (!consentDoc.exists) {
      return;
    }

    const consent = consentDoc.data() as UserConsent;
    const updatedPurposes = consent.purposes.map(p => ({
      ...p,
      granted: p.required, // Mantém apenas os obrigatórios
      grantedAt: p.required ? p.grantedAt : undefined,
    }));

    await consentRef.update({
      purposes: updatedPurposes,
      revoked: true,
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    this.logger.audit("consent_revoked", "user_consent", userId, {
      revokedPurposes: consent.purposes.filter(p => !p.required).map(p => p.id),
    });
  }

  /**
   * Verifica se usuário tem consentimento para propósito específico
   */
  async hasConsent(userId: string, purposeId: string): Promise<boolean> {
    const consentDoc = await this.db
      .collection(this.CONSENTS_COLLECTION)
      .doc(userId)
      .get();

    if (!consentDoc.exists) {
      return false;
    }

    const consent = consentDoc.data() as UserConsent;
    
    if (consent.revoked) {
      return false;
    }

    const purpose = consent.purposes.find(p => p.id === purposeId);
    return purpose?.granted ?? false;
  }

  /**
   * Obtém consentimentos do usuário
   */
  async getUserConsent(userId: string): Promise<UserConsent | null> {
    const consentDoc = await this.db
      .collection(this.CONSENTS_COLLECTION)
      .doc(userId)
      .get();

    if (!consentDoc.exists) {
      return null;
    }

    const data = consentDoc.data()!;
    return {
      ...data,
      grantedAt: data.grantedAt?.toDate(),
      revokedAt: data.revokedAt?.toDate(),
    } as UserConsent;
  }

  // ==========================================================================
  // DATA EXPORT (PORTABILITY)
  // ==========================================================================

  /**
   * Exporta todos os dados do usuário
   * LGPD Art. 18, V - Direito à portabilidade
   */
  async exportUserData(userId: string): Promise<UserDataExport> {
    const exportId = crypto.randomUUID();
    const startTime = Date.now();

    this.logger.info("data_export_started", "Starting data export for user", {
      userId,
      exportId,
    });

    const [
      profile,
      medications,
      prescriptions,
      orders,
      consents,
      auditLogs
    ] = await Promise.all([
      this.getUserProfile(userId),
      this.getUserMedications(userId),
      this.getUserPrescriptions(userId),
      this.getUserOrders(userId),
      this.getUserConsent(userId),
      this.getUserAuditLogs(userId),
    ]);

    const exportData: UserDataExport = {
      exportId,
      exportedAt: new Date().toISOString(),
      userId,
      format: "json",
      data: {
        profile: this.anonymizeForExport(profile),
        medications: medications.map(m => this.anonymizeForExport(m)),
        prescriptions: prescriptions.map(p => this.anonymizeForExport(p)),
        orders: orders.map(o => this.anonymizeForExport(o)),
        consents: consents ? [consents] : [],
        activityLog: auditLogs,
      },
      checksum: "", // Will be calculated
    };

    // Calculate checksum for integrity verification
    exportData.checksum = this.calculateChecksum(exportData.data);

    const durationMs = Date.now() - startTime;
    this.logger.audit("data_export_completed", "user_data", userId, {
      exportId,
      durationMs,
      recordCount: {
        medications: medications.length,
        prescriptions: prescriptions.length,
        orders: orders.length,
        auditLogs: auditLogs.length,
      },
    });

    return exportData;
  }

  // ==========================================================================
  // DATA DELETION (RIGHT TO BE FORGOTTEN)
  // ==========================================================================

  /**
   * Verifica período de retenção legal
   */
  async checkRetentionPeriod(userId: string): Promise<RetentionCheckResult> {
    const categories: DataCategoryRetention[] = [];
    let latestRetention: Date | null = null;
    let blockingCategory: string | null = null;

    // Verificar cada categoria
    for (const [key, retention] of Object.entries(RETENTION_PERIODS)) {
      const hasData = await this.hasDataInCategory(userId, key);
      
      if (hasData && !retention.canDelete) {
        const oldestRecord = await this.getOldestRecordDate(userId, key);
        
        if (oldestRecord) {
          const retentionEnd = new Date(oldestRecord);
          retentionEnd.setDate(retentionEnd.getDate() + retention.retentionPeriodDays);

          if (retentionEnd > new Date()) {
            categories.push(retention);
            
            if (!latestRetention || retentionEnd > latestRetention) {
              latestRetention = retentionEnd;
              blockingCategory = key;
            }
          }
        }
      }
    }

    if (latestRetention) {
      return {
        eligible: false,
        retentionUntil: latestRetention.toISOString(),
        reason: `Dados retidos por obrigação legal até ${latestRetention.toLocaleDateString("pt-BR")}`,
        legalBasis: RETENTION_PERIODS[blockingCategory!].legalBasis,
        dataCategories: categories,
      };
    }

    return {
      eligible: true,
      dataCategories: Object.values(RETENTION_PERIODS).filter(r => r.canDelete),
    };
  }

  /**
   * Exclui/anonimiza dados do usuário
   * LGPD Art. 18, VI - Direito à eliminação
   */
  async deleteUserData(userId: string, force = false): Promise<void> {
    const startTime = Date.now();

    // Verificar período de retenção
    const retentionCheck = await this.checkRetentionPeriod(userId);

    if (!retentionCheck.eligible && !force) {
      throw new Error(retentionCheck.reason!);
    }

    this.logger.warn("data_deletion_started", "Starting data deletion for user", {
      userId,
      force,
      retentionCheck: retentionCheck.eligible,
    });

    // Anonimizar dados que podem ser anonimizados
    await Promise.all([
      this.anonymizeUserProfile(userId),
      this.anonymizeUserMedications(userId),
      this.anonymizeUserContacts(userId),
    ]);

    // Soft delete - marcar como excluído
    await this.db.collection("users").doc(userId).update({
      deleted: true,
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      email: `deleted_${userId}@anonymized.local`,
      displayName: "Usuário Excluído",
      phone: null,
      cpf: null,
      address: null,
    });

    // Revogar consentimentos
    await this.revokeAllConsents(userId);

    const durationMs = Date.now() - startTime;
    this.logger.audit("data_deletion_completed", "user_data", userId, {
      durationMs,
      force,
      anonymizedCategories: ["profile", "medications", "contacts"],
    });
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  private async handleAccessRequest(request: DataSubjectRequest): Promise<void> {
    // Gera export e notifica usuário
    const exportData = await this.exportUserData(request.userId);
    
    await this.db.collection(this.REQUESTS_COLLECTION).doc(request.id).update({
      metadata: {
        exportId: exportData.exportId,
        exportedAt: exportData.exportedAt,
        checksum: exportData.checksum,
      },
    });
  }

  private async handlePortabilityRequest(request: DataSubjectRequest): Promise<void> {
    await this.handleAccessRequest(request);
  }

  private async handleDeletionRequest(request: DataSubjectRequest): Promise<void> {
    const retentionCheck = await this.checkRetentionPeriod(request.userId);

    if (!retentionCheck.eligible) {
      await this.rejectRequest(
        request.id,
        "system",
        retentionCheck.reason!,
        retentionCheck.legalBasis!
      );
      return;
    }

    await this.deleteUserData(request.userId);
  }

  private async handleRestrictionRequest(request: DataSubjectRequest): Promise<void> {
    // Bloqueia processamento de dados não essenciais
    await this.revokeAllConsents(request.userId);
    
    await this.db.collection("users").doc(request.userId).update({
      dataProcessingRestricted: true,
      restrictedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  private async handleObjectionRequest(request: DataSubjectRequest): Promise<void> {
    // Similar a restrição, mas pode envolver mais revisão
    await this.handleRestrictionRequest(request);
  }

  private async getUserProfile(userId: string): Promise<Record<string, unknown>> {
    const doc = await this.db.collection("users").doc(userId).get();
    return doc.exists ? (doc.data() as Record<string, unknown>) : {};
  }

  private async getUserMedications(userId: string): Promise<Record<string, unknown>[]> {
    const snapshot = await this.db
      .collection("medications")
      .where("userId", "==", userId)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  private async getUserPrescriptions(userId: string): Promise<Record<string, unknown>[]> {
    const snapshot = await this.db
      .collection("prescriptions")
      .where("userId", "==", userId)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  private async getUserOrders(userId: string): Promise<Record<string, unknown>[]> {
    const snapshot = await this.db
      .collection("orders")
      .where("customerId", "==", userId)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  private async getUserAuditLogs(userId: string): Promise<Record<string, unknown>[]> {
    const snapshot = await this.db
      .collection("audit_logs")
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .limit(1000)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  private async hasDataInCategory(userId: string, category: string): Promise<boolean> {
    const collectionMap: Record<string, string> = {
      medical_records: "medications",
      prescriptions: "prescriptions",
      orders: "orders",
      audit_logs: "audit_logs",
      profile: "users",
    };

    const collection = collectionMap[category];
    if (!collection) return false;

    if (category === "profile") {
      const doc = await this.db.collection(collection).doc(userId).get();
      return doc.exists;
    }

    const snapshot = await this.db
      .collection(collection)
      .where("userId", "==", userId)
      .limit(1)
      .get();
    return !snapshot.empty;
  }

  private async getOldestRecordDate(userId: string, category: string): Promise<Date | null> {
    const collectionMap: Record<string, string> = {
      medical_records: "medications",
      prescriptions: "prescriptions",
      orders: "orders",
      audit_logs: "audit_logs",
    };

    const collection = collectionMap[category];
    if (!collection) return null;

    const snapshot = await this.db
      .collection(collection)
      .where("userId", "==", userId)
      .orderBy("createdAt", "asc")
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const data = snapshot.docs[0].data();
    return data.createdAt?.toDate() ?? null;
  }

  private async anonymizeUserProfile(userId: string): Promise<void> {
    await this.db.collection("users").doc(userId).update({
      displayName: "Usuário Anônimo",
      email: `anon_${this.hashString(userId)}@anonymized.local`,
      phone: null,
      cpf: null,
      address: null,
      birthDate: null,
      photoURL: null,
    });
  }

  private async anonymizeUserMedications(userId: string): Promise<void> {
    const snapshot = await this.db
      .collection("medications")
      .where("userId", "==", userId)
      .get();

    const batch = this.db.batch();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        notes: null,
        prescribedBy: null,
        pharmacy: null,
      });
    });
    await batch.commit();
  }

  private async anonymizeUserContacts(userId: string): Promise<void> {
    const snapshot = await this.db
      .collection("contacts")
      .where("userId", "==", userId)
      .get();

    const batch = this.db.batch();
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        name: "Contato Anônimo",
        phone: null,
        email: null,
        address: null,
      });
    });
    await batch.commit();
  }

  private anonymizeForExport(data: Record<string, unknown>): Record<string, unknown> {
    const result = { ...data };
    
    for (const field of SENSITIVE_FIELDS) {
      if (result[field]) {
        // Mantém dados para portabilidade, mas marca como sensível
        result[`${field}_SENSITIVE`] = true;
      }
    }

    // Remove tokens e senhas completamente
    delete result.password;
    delete result.token;
    delete result.apiKey;
    delete result.refreshToken;

    return result;
  }

  private calculateChecksum(data: unknown): string {
    const json = JSON.stringify(data);
    return crypto.createHash("sha256").update(json).digest("hex");
  }

  private hashString(str: string): string {
    return crypto.createHash("sha256").update(str).digest("hex").slice(0, 12);
  }

  private hashIp(ip: string): string {
    return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    const maskedLocal = local.length > 2 
      ? `${local[0]}***${local[local.length - 1]}`
      : "***";
    return `${maskedLocal}@${domain}`;
  }
}

// Export singleton instance
export const lgpdService = new LGPDService();
