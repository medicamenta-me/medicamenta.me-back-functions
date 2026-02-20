/**
 * ApplicationError — Classe de erro tipada da plataforma.
 *
 * Estende Error nativo para carregar código estruturado do catálogo,
 * HTTP status, detalhes e requestId. Pode ser serializada para JSON
 * e convertida diretamente em resposta HTTP.
 *
 * @module shared/errors/app-error.class
 * @version 1.0.0
 * @since Sprint 3
 * @see PRD §27
 */

import { ErrorCode, AppError } from './error-codes';
import { getErrorCatalogEntry } from './error-catalog';

export class ApplicationError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;
  readonly timestamp: string;
  readonly requestId?: string;

  constructor(
    code: ErrorCode,
    details?: Record<string, unknown>,
    requestId?: string,
  ) {
    const entry = getErrorCatalogEntry(code);
    super(entry.message);
    this.name = 'ApplicationError';
    this.code = code;
    this.httpStatus = entry.httpStatus;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.requestId = requestId;
  }

  /** Serializa o erro para o formato AppError (JSON-safe). */
  toJSON(): AppError {
    return {
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId,
    };
  }

  /** Converte para objeto de resposta HTTP com status e body. */
  toResponse(): { status: number; body: AppError } {
    return {
      status: this.httpStatus,
      body: this.toJSON(),
    };
  }
}
