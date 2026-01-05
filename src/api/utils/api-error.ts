/**
 * 🚨 API Error Class
 * 
 * Custom error class para erros da API com código e mensagem padronizados
 */

export class ApiError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: any
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        details: this.details,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Common API Errors
 */
export const ApiErrors = {
  UNAUTHORIZED: (message = "Unauthorized") =>
    new ApiError(401, "UNAUTHORIZED", message),

  FORBIDDEN: (message = "Forbidden") =>
    new ApiError(403, "FORBIDDEN", message),

  NOT_FOUND: (resource: string) =>
    new ApiError(404, "NOT_FOUND", `${resource} not found`),

  VALIDATION_ERROR: (details: any) =>
    new ApiError(400, "VALIDATION_ERROR", "Validation failed", details),

  RATE_LIMIT_EXCEEDED: (retryAfter: number) =>
    new ApiError(
      429,
      "RATE_LIMIT_EXCEEDED",
      "Too many requests",
      { retryAfter }
    ),

  INTERNAL_ERROR: (message = "Internal server error") =>
    new ApiError(500, "INTERNAL_ERROR", message),

  SERVICE_UNAVAILABLE: (message = "Service temporarily unavailable") =>
    new ApiError(503, "SERVICE_UNAVAILABLE", message),
};
