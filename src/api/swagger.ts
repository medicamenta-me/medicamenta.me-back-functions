/**
 * 📚 Swagger/OpenAPI Configuration
 * 
 * Documentação completa da API Medicamenta.me
 * Versão: 2.0.0
 * 
 * @module swagger
 * @since Sprint H5 - Swagger Documentation
 */

import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

/**
 * OpenAPI 3.0 Specification Options
 */
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Medicamenta.me API",
      version: "2.0.0",
      description: `
## Visão Geral

A **Medicamenta.me API** é uma RESTful API para integração com parceiros do ecossistema de saúde.

### Funcionalidades Principais

- 🔐 **Autenticação** - OAuth 2.0 + JWT
- 👥 **Pacientes** - Gestão de perfis de pacientes
- 💊 **Medicamentos** - Cadastro e gestão de medicamentos
- 📊 **Adesão** - Monitoramento de adesão ao tratamento
- 📈 **Relatórios** - Geração de relatórios
- 🔔 **Webhooks** - Notificações em tempo real

### Versionamento

- **v1** - API estável para parceiros existentes
- **v2** - Nova API com recursos avançados (Marketplace, Admin)

### Rate Limiting

| Plano | Requisições/minuto | Requisições/dia |
|-------|-------------------|-----------------|
| Free | 60 | 1.000 |
| Basic | 300 | 10.000 |
| Pro | 1.000 | 100.000 |
| Enterprise | Ilimitado | Ilimitado |

### Suporte

- 📧 Email: api-support@medicamenta.me
- 📖 Docs: https://docs.medicamenta.me
- 🔔 Status: https://status.medicamenta.me
      `,
      contact: {
        name: "Medicamenta.me API Team",
        email: "api-support@medicamenta.me",
        url: "https://medicamenta.me"
      },
      license: {
        name: "Proprietary",
        url: "https://medicamenta.me/terms"
      },
      termsOfService: "https://medicamenta.me/api-terms"
    },
    servers: [
      {
        url: "https://us-central1-medicamenta-me.cloudfunctions.net/api",
        description: "Production Server"
      },
      {
        url: "http://127.0.0.1:5001/medicamenta-me/us-central1/api",
        description: "Local Development (Firebase Emulator)"
      }
    ],
    tags: [
      { name: "Auth", description: "Autenticação e autorização" },
      { name: "Patients", description: "Gestão de pacientes" },
      { name: "Medications", description: "Gestão de medicamentos" },
      { name: "Adherence", description: "Monitoramento de adesão" },
      { name: "Reports", description: "Geração de relatórios" },
      { name: "Webhooks", description: "Configuração de webhooks" },
      { name: "Orders", description: "Gestão de pedidos (v2)" },
      { name: "Products", description: "Catálogo de produtos (v2)" },
      { name: "Pharmacies", description: "Gestão de farmácias (v2)" },
      { name: "Financial", description: "Operações financeiras (v2)" },
      { name: "Admin", description: "Operações administrativas (v2)" }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token obtido via /v1/auth/login"
        },
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "API Key fornecida pelo Medicamenta.me"
        }
      },
      schemas: {
        // Error Response
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string", example: "VALIDATION_ERROR" },
                message: { type: "string", example: "Validation failed" },
                details: { type: "array", items: { type: "string" } }
              }
            }
          }
        },
        // Success Response
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object" },
            meta: {
              type: "object",
              properties: {
                timestamp: { type: "string", format: "date-time" },
                requestId: { type: "string" }
              }
            }
          }
        },
        // Patient
        Patient: {
          type: "object",
          properties: {
            id: { type: "string", example: "patient-123" },
            name: { type: "string", example: "João Silva" },
            email: { type: "string", format: "email", example: "joao@email.com" },
            cpf: { type: "string", example: "123.456.789-00" },
            dateOfBirth: { type: "string", format: "date", example: "1990-01-15" },
            phone: { type: "string", example: "+55 11 99999-9999" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" }
          },
          required: ["name", "email"]
        },
        // Medication
        Medication: {
          type: "object",
          properties: {
            id: { type: "string", example: "med-456" },
            name: { type: "string", example: "Dipirona 500mg" },
            dosage: { type: "string", example: "500mg" },
            frequency: { type: "string", example: "8h" },
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date" },
            instructions: { type: "string" },
            prescriptionId: { type: "string" },
            isActive: { type: "boolean", example: true }
          },
          required: ["name", "dosage", "frequency"]
        },
        // Adherence Record
        AdherenceRecord: {
          type: "object",
          properties: {
            id: { type: "string" },
            medicationId: { type: "string" },
            scheduledTime: { type: "string", format: "date-time" },
            takenTime: { type: "string", format: "date-time" },
            status: { 
              type: "string", 
              enum: ["taken", "missed", "late", "skipped"],
              example: "taken"
            },
            notes: { type: "string" }
          }
        },
        // Order (v2)
        Order: {
          type: "object",
          properties: {
            id: { type: "string", example: "order-789" },
            customerId: { type: "string" },
            pharmacyId: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"],
              example: "pending"
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  productId: { type: "string" },
                  quantity: { type: "integer" },
                  price: { type: "number" }
                }
              }
            },
            subtotal: { type: "number", example: 99.90 },
            deliveryFee: { type: "number", example: 9.90 },
            total: { type: "number", example: 109.80 },
            createdAt: { type: "string", format: "date-time" }
          }
        },
        // Product (v2)
        Product: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string", example: "Dipirona 500mg" },
            description: { type: "string" },
            sku: { type: "string" },
            price: { type: "number", example: 12.90 },
            stock: { type: "integer", example: 100 },
            category: { type: "string" },
            pharmacyId: { type: "string" },
            requiresPrescription: { type: "boolean", example: false },
            isActive: { type: "boolean", example: true }
          }
        },
        // Pharmacy (v2)
        Pharmacy: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string", example: "Farmácia Central" },
            cnpj: { type: "string", example: "12.345.678/0001-90" },
            email: { type: "string", format: "email" },
            phone: { type: "string" },
            address: {
              type: "object",
              properties: {
                street: { type: "string" },
                number: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                zipCode: { type: "string" }
              }
            },
            status: {
              type: "string",
              enum: ["pending", "approved", "suspended", "rejected"],
              example: "approved"
            },
            rating: { type: "number", example: 4.5 }
          }
        },
        // Pagination
        Pagination: {
          type: "object",
          properties: {
            page: { type: "integer", example: 1 },
            pageSize: { type: "integer", example: 20 },
            totalItems: { type: "integer", example: 100 },
            totalPages: { type: "integer", example: 5 }
          }
        },
        // Audit Log (Admin)
        AuditLog: {
          type: "object",
          properties: {
            id: { type: "string" },
            userId: { type: "string" },
            userName: { type: "string" },
            action: { type: "string", example: "ORDER_CREATED" },
            resource: { type: "string", example: "orders" },
            resourceId: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
            details: { type: "object" },
            ip: { type: "string" },
            timestamp: { type: "string", format: "date-time" }
          }
        }
      },
      responses: {
        Unauthorized: {
          description: "Token inválido ou expirado",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                success: false,
                error: {
                  code: "UNAUTHORIZED",
                  message: "Invalid or expired token"
                }
              }
            }
          }
        },
        Forbidden: {
          description: "Acesso negado",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                success: false,
                error: {
                  code: "FORBIDDEN",
                  message: "Access denied"
                }
              }
            }
          }
        },
        NotFound: {
          description: "Recurso não encontrado",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                success: false,
                error: {
                  code: "NOT_FOUND",
                  message: "Resource not found"
                }
              }
            }
          }
        },
        ValidationError: {
          description: "Erro de validação",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                success: false,
                error: {
                  code: "VALIDATION_ERROR",
                  message: "Validation failed",
                  details: ["Field \"email\" is required"]
                }
              }
            }
          }
        },
        RateLimitExceeded: {
          description: "Rate limit excedido",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                success: false,
                error: {
                  code: "RATE_LIMIT_EXCEEDED",
                  message: "Too many requests"
                }
              }
            }
          }
        }
      },
      parameters: {
        PageParam: {
          name: "page",
          in: "query",
          description: "Número da página",
          schema: { type: "integer", default: 1, minimum: 1 }
        },
        PageSizeParam: {
          name: "pageSize",
          in: "query",
          description: "Itens por página",
          schema: { type: "integer", default: 20, minimum: 1, maximum: 100 }
        },
        IdParam: {
          name: "id",
          in: "path",
          required: true,
          description: "ID único do recurso",
          schema: { type: "string" }
        }
      }
    },
    security: [
      { bearerAuth: [] },
      { apiKey: [] }
    ]
  },
  apis: [
    "./src/api/v1/*.routes.ts",
    "./src/api/v2/*.routes.ts",
    "./src/api/v2/admin/*.ts"
  ]
};

/**
 * Gera a especificação OpenAPI
 */
export const swaggerSpec = swaggerJsdoc(options);

/**
 * Configura o Swagger UI no Express app
 */
export function setupSwagger(app: Express): void {
  // Serve Swagger UI
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info { margin: 30px 0 }
      .swagger-ui .info .title { font-size: 2em }
    `,
    customSiteTitle: "Medicamenta.me API Docs",
    customfavIcon: "/favicon.ico",
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true
    }
  }));

  // Serve raw OpenAPI JSON
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  // Serve raw OpenAPI YAML
  app.get("/api-docs.yaml", (req, res) => {
    const yaml = require("js-yaml");
    res.setHeader("Content-Type", "text/yaml");
    res.send(yaml.dump(swaggerSpec));
  });
}

export { swaggerUi };
