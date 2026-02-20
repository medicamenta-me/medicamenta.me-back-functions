/**
 * Error Catalog — Medicamenta.me
 * Catálogo completo de erros com mensagens, HTTP status e factory functions.
 *
 * @module shared/errors/error-catalog
 * @version 1.0.0
 * @since Sprint 3
 * @see PRD §27
 */

import {
  AuthErrorCode,
  MedErrorCode,
  SysErrorCode,
  ErrorCode,
  AppError,
  ErrorCatalogEntry,
} from "./error-codes";

/** §27.1 — Catálogo de erros de autenticação */
const AUTH_ERRORS: Record<AuthErrorCode, ErrorCatalogEntry> = {
  [AuthErrorCode.EMAIL_ALREADY_REGISTERED]: {
    code: AuthErrorCode.EMAIL_ALREADY_REGISTERED,
    message: "E-mail já cadastrado",
    httpStatus: 409,
    description: "Tentativa de cadastro com e-mail que já existe no sistema",
    userMessage:
      "Este e-mail já está cadastrado. Tente fazer login ou use outro e-mail.",
  },
  [AuthErrorCode.PASSWORD_REQUIREMENTS_NOT_MET]: {
    code: AuthErrorCode.PASSWORD_REQUIREMENTS_NOT_MET,
    message: "Senha não atende requisitos mínimos",
    httpStatus: 400,
    description:
      "Senha deve ter 8+ caracteres, incluindo maiúscula, número e caractere especial",
    userMessage:
      "A senha deve ter pelo menos 8 caracteres, incluindo uma letra maiúscula, um número e um caractere especial.",
  },
  [AuthErrorCode.TOKEN_EXPIRED_OR_INVALID]: {
    code: AuthErrorCode.TOKEN_EXPIRED_OR_INVALID,
    message: "Token expirado ou inválido",
    httpStatus: 401,
    description: "Token de autenticação expirado, malformado ou revogado",
    userMessage: "Sua sessão expirou. Por favor, faça login novamente.",
  },
  [AuthErrorCode.ACCOUNT_LOCKED]: {
    code: AuthErrorCode.ACCOUNT_LOCKED,
    message: "Conta bloqueada por tentativas inválidas",
    httpStatus: 423,
    description:
      "Conta bloqueada após 5 tentativas de login inválidas (15 minutos)",
    userMessage:
      "Sua conta foi temporariamente bloqueada. Tente novamente em 15 minutos.",
  },
  [AuthErrorCode.EMAIL_NOT_VERIFIED]: {
    code: AuthErrorCode.EMAIL_NOT_VERIFIED,
    message: "E-mail não verificado",
    httpStatus: 403,
    description:
      "Usuário tentou acessar funcionalidade que requer e-mail verificado",
    userMessage:
      "Verifique seu e-mail antes de continuar. Cheque sua caixa de entrada.",
  },
  [AuthErrorCode.SESSION_EXPIRED]: {
    code: AuthErrorCode.SESSION_EXPIRED,
    message: "Sessão expirada por inatividade",
    httpStatus: 401,
    description:
      "Sessão expirada após 30 minutos de inatividade (SBIS SGR.04)",
    userMessage: "Sua sessão expirou por inatividade. Faça login novamente.",
  },
  [AuthErrorCode.INSUFFICIENT_PERMISSIONS]: {
    code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
    message: "Permissão insuficiente para esta operação",
    httpStatus: 403,
    description:
      "Usuário não possui a role necessária para executar a ação",
    userMessage: "Você não tem permissão para realizar esta ação.",
  },
};

/** §27.2 — Catálogo de erros de medicamentos */
const MED_ERRORS: Record<MedErrorCode, ErrorCatalogEntry> = {
  [MedErrorCode.MEDICATION_NOT_FOUND]: {
    code: MedErrorCode.MEDICATION_NOT_FOUND,
    message: "Medicamento não encontrado",
    httpStatus: 404,
    description:
      "Medicamento com o identificador fornecido não existe no sistema",
    userMessage:
      "Medicamento não encontrado. Verifique o código e tente novamente.",
  },
  [MedErrorCode.MEDICATION_NAME_REQUIRED]: {
    code: MedErrorCode.MEDICATION_NAME_REQUIRED,
    message: "Nome do medicamento é obrigatório",
    httpStatus: 400,
    description: "Campo nome do medicamento não foi fornecido ou está vazio",
    userMessage: "O nome do medicamento é obrigatório.",
  },
  [MedErrorCode.INVALID_DOSAGE]: {
    code: MedErrorCode.INVALID_DOSAGE,
    message: "Dosagem inválida ou fora do intervalo permitido",
    httpStatus: 400,
    description:
      "Dosagem informada é negativa, zero ou excede o limite terapêutico",
    userMessage:
      "A dosagem informada é inválida. Verifique o valor e tente novamente.",
  },
  [MedErrorCode.INVALID_FREQUENCY]: {
    code: MedErrorCode.INVALID_FREQUENCY,
    message: "Frequência de administração inválida",
    httpStatus: 400,
    description:
      "Frequência de administração não corresponde a um valor válido",
    userMessage:
      "A frequência de administração informada é inválida.",
  },
  [MedErrorCode.SCHEDULE_CONFLICT]: {
    code: MedErrorCode.SCHEDULE_CONFLICT,
    message: "Conflito de horário com outro medicamento",
    httpStatus: 409,
    description:
      "Horário de administração conflita com outro medicamento já agendado",
    userMessage:
      "Existe um conflito de horário com outro medicamento. Ajuste o horário.",
  },
  [MedErrorCode.DRUG_INTERACTION_DETECTED]: {
    code: MedErrorCode.DRUG_INTERACTION_DETECTED,
    message: "Interação medicamentosa detectada",
    httpStatus: 409,
    description:
      "Foi detectada interação medicamentosa entre os medicamentos informados",
    userMessage:
      "Foi detectada uma interação entre seus medicamentos. Consulte seu médico.",
  },
};

/** §27.8 — Catálogo de erros de sistema */
const SYS_ERRORS: Record<SysErrorCode, ErrorCatalogEntry> = {
  [SysErrorCode.INTERNAL_SERVER_ERROR]: {
    code: SysErrorCode.INTERNAL_SERVER_ERROR,
    message: "Erro interno do servidor",
    httpStatus: 500,
    description: "Erro inesperado no processamento da requisição",
    userMessage:
      "Ocorreu um erro inesperado. Tente novamente em alguns instantes.",
  },
  [SysErrorCode.SERVICE_UNAVAILABLE]: {
    code: SysErrorCode.SERVICE_UNAVAILABLE,
    message: "Serviço temporariamente indisponível",
    httpStatus: 503,
    description:
      "Serviço em manutenção ou sobrecarregado temporariamente",
    userMessage:
      "O serviço está temporariamente indisponível. Tente novamente em breve.",
  },
  [SysErrorCode.RATE_LIMIT_EXCEEDED]: {
    code: SysErrorCode.RATE_LIMIT_EXCEEDED,
    message: "Limite de requisições excedido",
    httpStatus: 429,
    description: "Cliente excedeu o limite de requisições por minuto",
    userMessage:
      "Muitas requisições. Aguarde um momento antes de tentar novamente.",
  },
  [SysErrorCode.PAYLOAD_TOO_LARGE]: {
    code: SysErrorCode.PAYLOAD_TOO_LARGE,
    message: "Payload excede o tamanho máximo permitido",
    httpStatus: 413,
    description: "Corpo da requisição excede o tamanho máximo configurado",
    userMessage:
      "Os dados enviados excedem o tamanho máximo permitido.",
  },
  [SysErrorCode.API_VERSION_NOT_SUPPORTED]: {
    code: SysErrorCode.API_VERSION_NOT_SUPPORTED,
    message: "Versão da API não suportada",
    httpStatus: 400,
    description:
      "Versão da API solicitada não é suportada pelo servidor",
    userMessage:
      "Versão da API não suportada. Atualize o aplicativo para a versão mais recente.",
  },
};

/** Mapa consolidado de todos os erros do catálogo */
const ERROR_CATALOG: Record<string, ErrorCatalogEntry> = {
  ...AUTH_ERRORS,
  ...MED_ERRORS,
  ...SYS_ERRORS,
};

/**
 * Retorna a entrada do catálogo para um código de erro.
 * @throws {Error} Se o código não existir no catálogo
 */
export function getErrorCatalogEntry(code: ErrorCode): ErrorCatalogEntry {
  const entry = ERROR_CATALOG[code];
  if (!entry) {
    throw new Error(`Error code "${code}" not found in catalog`);
  }
  return entry;
}

/**
 * Cria um objeto AppError estruturado a partir de um código do catálogo.
 */
export function createAppError(
  code: ErrorCode,
  details?: Record<string, unknown>,
  requestId?: string,
): AppError {
  const entry = getErrorCatalogEntry(code);
  return {
    code,
    message: entry.message,
    httpStatus: entry.httpStatus,
    details,
    timestamp: new Date().toISOString(),
    requestId,
  };
}

/** Retorna o HTTP status associado ao código de erro. */
export function getHttpStatus(code: ErrorCode): number {
  return getErrorCatalogEntry(code).httpStatus;
}

/** Retorna a mensagem amigável para exibição ao usuário. */
export function getUserMessage(code: ErrorCode): string {
  return getErrorCatalogEntry(code).userMessage;
}

/** Verifica se o código pertence à categoria AUTH (§27.1). */
export function isAuthError(code: ErrorCode): boolean {
  return code.startsWith("AUTH_");
}

/** Verifica se o código pertence à categoria MED (§27.2). */
export function isMedError(code: ErrorCode): boolean {
  return code.startsWith("MED_");
}

/** Verifica se o código pertence à categoria SYS (§27.8). */
export function isSysError(code: ErrorCode): boolean {
  return code.startsWith("SYS_");
}

/** Retorna a lista completa de todos os códigos de erro registrados. */
export function getAllErrorCodes(): ErrorCode[] {
  return [
    ...Object.values(AuthErrorCode),
    ...Object.values(MedErrorCode),
    ...Object.values(SysErrorCode),
  ];
}
