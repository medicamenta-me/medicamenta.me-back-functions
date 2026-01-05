/**
 * Structured Logger for Medicamenta.me API
 * 
 * Features:
 * - Human-readable format with emojis
 * - AI/Machine parseable JSON structure
 * - Correlation IDs for request tracing
 * - Performance metrics tracking
 * - LGPD-compliant data masking
 * - Log levels with filtering
 * 
 * Design principles:
 * - Every log must be actionable
 * - Sensitive data automatically masked
 * - Correlation enables full request tracing
 * - Performance data for optimization
 */

import { Request, Response, NextFunction } from "express";
import * as crypto from "crypto";

/**
 * Log levels in order of severity
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Log severity numeric values for filtering
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/**
 * Structured log entry for human and AI interpretation
 */
export interface StructuredLog {
  // Temporal
  timestamp: string;
  timestampMs: number;
  
  // Identification
  correlationId: string;
  requestId?: string;
  sessionId?: string;
  
  // Classification
  level: LogLevel;
  levelEmoji: string;
  service: string;
  component: string;
  action: string;
  
  // Context
  userId?: string;
  userRole?: string;
  resourceType?: string;
  resourceId?: string;
  
  // Request info
  method?: string;
  path?: string;
  statusCode?: number;
  
  // Performance
  durationMs?: number;
  memoryUsageMB?: number;
  
  // Content
  message: string;
  metadata?: Record<string, unknown>;
  
  // Error details
  error?: {
    code: string;
    message: string;
    stack?: string;
    cause?: string;
  };
  
  // LGPD compliance
  sensitiveDataMasked: boolean;
  dataCategories?: string[];
  
  // AI hints
  aiHints?: {
    suggestedAction?: string;
    relatedLogs?: string[];
    severity: "low" | "medium" | "high" | "critical";
    requiresAttention: boolean;
  };
}

/**
 * Fields that contain sensitive data - LGPD compliance
 */
const SENSITIVE_FIELDS = [
  "cpf",
  "cnpj",
  "password",
  "senha",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "cardNumber",
  "cvv",
  "cvc",
  "pin",
  "ssn",
  "rg",
  "email",
  "phone",
  "telefone",
  "celular",
  "endereco",
  "address",
  "birthDate",
  "dataNascimento",
  "healthData",
  "prescriptionData",
  "medicationHistory",
];

/**
 * Emoji mapping for log levels
 */
const LEVEL_EMOJIS: Record<LogLevel, string> = {
  debug: "🔍",
  info: "ℹ️",
  warn: "⚠️",
  error: "❌",
  fatal: "💀",
};

/**
 * Current log level from environment
 */
const CURRENT_LOG_LEVEL: LogLevel = 
  (process.env.LOG_LEVEL as LogLevel) || "info";

/**
 * Structured Logger class
 */
export class Logger {
  private correlationId: string;
  private requestId?: string;
  private sessionId?: string;
  private userId?: string;
  private userRole?: string;
  private service: string;
  private component: string;
  private startTime: number;

  constructor(options: {
    correlationId?: string;
    requestId?: string;
    sessionId?: string;
    userId?: string;
    userRole?: string;
    service?: string;
    component?: string;
  } = {}) {
    this.correlationId = options.correlationId || crypto.randomUUID();
    this.requestId = options.requestId;
    this.sessionId = options.sessionId;
    this.userId = options.userId;
    this.userRole = options.userRole;
    this.service = options.service || "medicamenta-api";
    this.component = options.component || "unknown";
    this.startTime = Date.now();
  }

  /**
   * Create child logger with same correlation ID
   */
  child(component: string): Logger {
    return new Logger({
      correlationId: this.correlationId,
      requestId: this.requestId,
      sessionId: this.sessionId,
      userId: this.userId,
      userRole: this.userRole,
      service: this.service,
      component,
    });
  }

  /**
   * Set user context
   */
  setUser(userId: string, userRole?: string): void {
    this.userId = userId;
    this.userRole = userRole;
  }

  /**
   * Debug level log
   */
  debug(action: string, message: string, metadata?: Record<string, unknown>): void {
    this.log("debug", action, message, metadata);
  }

  /**
   * Info level log
   */
  info(action: string, message: string, metadata?: Record<string, unknown>): void {
    this.log("info", action, message, metadata);
  }

  /**
   * Warning level log
   */
  warn(action: string, message: string, metadata?: Record<string, unknown>): void {
    this.log("warn", action, message, metadata);
  }

  /**
   * Error level log
   */
  error(action: string, message: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.log("error", action, message, metadata, error);
  }

  /**
   * Fatal level log
   */
  fatal(action: string, message: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.log("fatal", action, message, metadata, error);
  }

  /**
   * Log HTTP request/response
   */
  httpLog(req: Request, res: Response, durationMs: number): void {
    const statusCode = res.statusCode;
    const level: LogLevel = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
    
    this.log(level, "http_request", `${req.method} ${req.path} ${statusCode}`, {
      method: req.method,
      path: req.path,
      statusCode,
      durationMs,
      userAgent: req.get("user-agent"),
      ip: req.ip,
      queryParams: Object.keys(req.query).length > 0 ? req.query : undefined,
    });
  }

  /**
   * Log performance metric
   */
  metric(name: string, value: number, unit: string, metadata?: Record<string, unknown>): void {
    this.log("info", "metric", `${name}: ${value}${unit}`, {
      metricName: name,
      metricValue: value,
      metricUnit: unit,
      ...metadata,
    });
  }

  /**
   * Log audit event (LGPD compliance)
   */
  audit(action: string, resourceType: string, resourceId: string, metadata?: Record<string, unknown>): void {
    const auditLog: Record<string, unknown> = {
      auditAction: action,
      resourceType,
      resourceId,
      performedBy: this.userId,
      performedByRole: this.userRole,
      ...metadata,
    };

    this.log("info", "audit", `Audit: ${action} on ${resourceType}/${resourceId}`, auditLog);
  }

  /**
   * Internal log method
   */
  private log(
    level: LogLevel,
    action: string,
    message: string,
    metadata?: Record<string, unknown>,
    error?: Error
  ): void {
    // Filter by log level
    if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[CURRENT_LOG_LEVEL]) {
      return;
    }

    const now = new Date();
    const durationMs = Date.now() - this.startTime;
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    const structuredLog: StructuredLog = {
      // Temporal
      timestamp: now.toISOString(),
      timestampMs: now.getTime(),
      
      // Identification
      correlationId: this.correlationId,
      requestId: this.requestId,
      sessionId: this.sessionId,
      
      // Classification
      level,
      levelEmoji: LEVEL_EMOJIS[level],
      service: this.service,
      component: this.component,
      action,
      
      // Context
      userId: this.userId,
      userRole: this.userRole,
      
      // Performance
      durationMs,
      memoryUsageMB,
      
      // Content
      message,
      metadata: metadata ? this.maskSensitiveData(metadata) : undefined,
      
      // LGPD compliance
      sensitiveDataMasked: true,
      
      // AI hints
      aiHints: this.generateAiHints(level, action, error),
    };

    // Add error details if present
    if (error) {
      structuredLog.error = {
        code: (error as any).code || "UNKNOWN_ERROR",
        message: error.message,
        stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
        cause: (error as any).cause ? String((error as any).cause) : undefined,
      };
    }

    // Output as JSON for machine parsing
    console.log(JSON.stringify(structuredLog));

    // Also output human-readable format in development
    if (process.env.NODE_ENV !== "production") {
      const corrId = structuredLog.correlationId.slice(0, 8);
      const humanReadable = `${structuredLog.levelEmoji} [${structuredLog.timestamp}] ` +
        `[${corrId}] ${structuredLog.component}.${action}: ${message}`;
      console.log(humanReadable);
    }
  }

  /**
   * Mask sensitive data for LGPD compliance
   */
  private maskSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
    const masked = { ...data };
    
    const maskValue = (obj: Record<string, unknown>, path: string[] = []): void => {
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        
        // Check if field is sensitive
        const isSensitive = SENSITIVE_FIELDS.some(field => 
          lowerKey.includes(field.toLowerCase())
        );
        
        if (isSensitive && value) {
          if (typeof value === "string") {
            // Mask but keep length hint
            const len = value.length;
            obj[key] = `***MASKED(${len})***`;
          } else {
            obj[key] = "***MASKED***";
          }
        } else if (value && typeof value === "object" && !Array.isArray(value)) {
          // Recursively mask nested objects
          maskValue(value as Record<string, unknown>, [...path, key]);
        }
      }
    };
    
    maskValue(masked);
    return masked;
  }

  /**
   * Generate AI hints for log analysis
   */
  private generateAiHints(level: LogLevel, action: string, error?: Error): NonNullable<StructuredLog["aiHints"]> {
    const severityMap: Record<LogLevel, "low" | "medium" | "high" | "critical"> = {
      debug: "low",
      info: "low",
      warn: "medium",
      error: "high",
      fatal: "critical",
    };

    const hints: NonNullable<StructuredLog["aiHints"]> = {
      severity: severityMap[level],
      requiresAttention: level === "error" || level === "fatal",
    };

    // Suggest actions based on error type
    if (error) {
      if (error.message.includes("ECONNREFUSED")) {
        hints.suggestedAction = "Check database/service connectivity";
      } else if (error.message.includes("timeout")) {
        hints.suggestedAction = "Check for slow queries or network issues";
      } else if (error.message.includes("permission")) {
        hints.suggestedAction = "Review IAM permissions and security rules";
      } else if (error.message.includes("not found")) {
        hints.suggestedAction = "Verify resource exists and ID is correct";
      }
    }

    // Suggest actions based on action type
    if (action === "auth_failed") {
      hints.suggestedAction = "Review authentication configuration";
      hints.severity = "high";
    } else if (action === "rate_limit") {
      hints.suggestedAction = "Consider scaling or adjusting rate limits";
    } else if (action === "validation_error") {
      hints.suggestedAction = "Review request payload against schema";
    }

    return hints;
  }

  /**
   * Get elapsed time since logger creation
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get correlation ID for passing to other services
   */
  getCorrelationId(): string {
    return this.correlationId;
  }
}

/**
 * Express middleware to inject logger into request
 */
export function loggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req.headers["x-correlation-id"] as string) || crypto.randomUUID();
  const requestId = crypto.randomUUID();
  
  // Create logger for this request
  const logger = new Logger({
    correlationId,
    requestId,
    service: "medicamenta-api",
    component: "http",
  });

  // Attach to request
  (req as any).logger = logger;
  (req as any).correlationId = correlationId;

  // Set correlation ID in response header
  res.setHeader("X-Correlation-ID", correlationId);
  res.setHeader("X-Request-ID", requestId);

  // Log request start
  logger.info("request_start", `${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    query: req.query,
  });

  // Track response time
  const startTime = Date.now();

  // Log response when finished
  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    logger.httpLog(req, res, durationMs);
  });

  next();
}

/**
 * Get logger from request or create new one
 */
export function getLogger(req?: Request, component?: string): Logger {
  if (req && (req as any).logger) {
    const logger = (req as any).logger as Logger;
    return component ? logger.child(component) : logger;
  }
  return new Logger({ component });
}

/**
 * Create standalone logger for non-HTTP contexts
 */
export function createLogger(component: string, correlationId?: string): Logger {
  return new Logger({
    correlationId,
    service: "medicamenta-api",
    component,
  });
}
