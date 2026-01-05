/**
 * 🔵 Medicamenta.me Public API
 * 
 * RESTful API Gateway para integração com parceiros
 * Versão: 1.0.0
 * 
 * Features:
 * - OAuth 2.0 + JWT Authentication
 * - Rate Limiting (Redis)
 * - API Versioning (v1, v2)
 * - OpenAPI/Swagger Documentation
 * - Request/Response Validation
 * - Comprehensive Error Handling
 * - Audit Logging
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express, { Express, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { rateLimiter } from "./middleware/rate-limiter";
import { authenticate } from "./middleware/auth";
import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/logger";
import { validateApiKey } from "./middleware/api-key-validator";

// Routers v1
import { patientsRouter } from "./v1/patients.routes";
import { medicationsRouter } from "./v1/medications.routes";
import { adherenceRouter } from "./v1/adherence.routes";
import { reportsRouter } from "./v1/reports.routes";
import { webhooksRouter } from "./v1/webhooks.routes";
import { authRouter } from "./v1/auth.routes";

// Routers v2
import { v2Router } from "./v2/index";

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  admin.initializeApp();
}

// Create Express app
const app: Express = express();

// ====================================
// MIDDLEWARE CONFIGURATION
// ====================================

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS - Configuração permissiva para parceiros
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Request-ID"],
  exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging
app.use(requestLogger);

// ====================================
// HEALTH CHECK & INFO
// ====================================

app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    uptime: process.uptime(),
  });
});

app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "Medicamenta.me Public API",
    version: "1.0.0",
    description: "RESTful API for healthcare partner integrations",
    documentation: "/docs",
    endpoints: {
      auth: "/v1/auth",
      patients: "/v1/patients",
      medications: "/v1/medications",
      adherence: "/v1/adherence",
      reports: "/v1/reports",
      webhooks: "/v1/webhooks",
    },
    support: {
      email: "api-support@medicamenta.me",
      docs: "https://docs.medicamenta.me",
      status: "https://status.medicamenta.me",
    },
  });
});

// ====================================
// API ROUTES - v1
// ====================================

// Public routes (no authentication required)
app.use("/v1/auth", authRouter);

// Protected routes (require API key or JWT)
app.use("/v1/patients", validateApiKey, rateLimiter, authenticate, patientsRouter);
app.use("/v1/medications", validateApiKey, rateLimiter, authenticate, medicationsRouter);
app.use("/v1/adherence", validateApiKey, rateLimiter, authenticate, adherenceRouter);
app.use("/v1/reports", validateApiKey, rateLimiter, authenticate, reportsRouter);
app.use("/v1/webhooks", validateApiKey, rateLimiter, authenticate, webhooksRouter);

// ====================================
// API ROUTES - v2
// ====================================

// v2 routes (require API key or JWT)
app.use("/v2", validateApiKey, rateLimiter, authenticate, v2Router);

// ====================================
// DOCUMENTATION (Swagger/OpenAPI)
// ====================================

import { setupSwagger, swaggerSpec } from "./swagger";

// Setup Swagger UI
setupSwagger(app);

// Legacy redirect for /docs
app.get("/docs", (req: Request, res: Response) => {
  res.redirect("/api-docs");
});

// OpenAPI Specification (JSON)
app.get("/openapi.json", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// ====================================
// ERROR HANDLING
// ====================================

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
      timestamp: new Date().toISOString(),
      requestId: req.headers["x-request-id"],
    },
  });
});

// Global error handler
app.use(errorHandler);

// ====================================
// EXPORT FIREBASE FUNCTION
// ====================================

// Export app for testing
export { app };

export const api = functions
  .runWith({
    timeoutSeconds: 60,
    memory: "1GB",
    minInstances: 1, // Keep warm for low latency
    maxInstances: 100,
  })
  .https
  .onRequest(app);
