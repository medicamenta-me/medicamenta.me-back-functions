/**
 * Error Catalog — Medicamenta.me
 * Baseado no PRD §27 — Catálogo de Erros
 *
 * Define enums tipados para todos os códigos de erro da plataforma,
 * além de interfaces para representação estruturada de erros.
 *
 * @module shared/errors/error-codes
 * @version 1.0.0
 * @since Sprint 3
 */

/** §27.1 — Erros de autenticação e autorização */
export enum AuthErrorCode {
  EMAIL_ALREADY_REGISTERED = 'AUTH_001',
  PASSWORD_REQUIREMENTS_NOT_MET = 'AUTH_002',
  TOKEN_EXPIRED_OR_INVALID = 'AUTH_003',
  ACCOUNT_LOCKED = 'AUTH_004',
  EMAIL_NOT_VERIFIED = 'AUTH_005',
  SESSION_EXPIRED = 'AUTH_006',
  INSUFFICIENT_PERMISSIONS = 'AUTH_007',
}

/** §27.2 — Erros de medicamentos */
export enum MedErrorCode {
  MEDICATION_NOT_FOUND = 'MED_001',
  MEDICATION_NAME_REQUIRED = 'MED_002',
  INVALID_DOSAGE = 'MED_003',
  INVALID_FREQUENCY = 'MED_004',
  SCHEDULE_CONFLICT = 'MED_005',
  DRUG_INTERACTION_DETECTED = 'MED_006',
}

/** §27.8 — Erros de sistema */
export enum SysErrorCode {
  INTERNAL_SERVER_ERROR = 'SYS_001',
  SERVICE_UNAVAILABLE = 'SYS_002',
  RATE_LIMIT_EXCEEDED = 'SYS_003',
  PAYLOAD_TOO_LARGE = 'SYS_004',
  API_VERSION_NOT_SUPPORTED = 'SYS_005',
}

/** Union de todos os códigos de erro da plataforma */
export type ErrorCode = AuthErrorCode | MedErrorCode | SysErrorCode;

/** Representação serializada de um erro da aplicação */
export interface AppError {
  code: ErrorCode;
  message: string;
  httpStatus: number;
  details?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
}

/** Entrada do catálogo de erros com mensagens para dev e usuário */
export interface ErrorCatalogEntry {
  code: ErrorCode;
  message: string;
  httpStatus: number;
  description: string;
  userMessage: string;
}
