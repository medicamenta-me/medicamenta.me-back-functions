/**
 * 🔔 Webhooks Routes - Unit Tests
 * 
 * Testes unitários das rotas de webhooks
 * Usa mocks do Firestore
 */

import request from "supertest";
import express, { Express, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { webhooksRouter } from "./webhooks.routes";
import { errorHandler } from "../middleware/error-handler";
import { clearMockData } from "../../__tests__/setup";

// Firebase Admin mockado no setup.ts global
const db = admin.firestore();

// Mock do fetch global para testes de webhook delivery
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe("🔔 Webhooks Routes - Unit Tests", () => {
  let app: Express;
  const testPartnerId = "test-partner-webhooks";
  const testWebhookId = "test-webhook-123";

  afterAll(() => {
    clearMockData();
  });

  beforeEach(async () => {
    // Limpar mock do fetch e configurar resposta padrão
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });

    // Criar dados de teste no Firestore mock ANTES de cada teste
    
    // Criar webhook de teste
    await db.collection("webhooks").doc(testWebhookId).set({
      partnerId: testPartnerId,
      url: "https://example.com/webhook",
      events: ["patient.created", "medication.created"],
      secret: "whsec_test_secret_123",
      status: "active",
      createdAt: new Date().toISOString(),
      stats: {
        totalDeliveries: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        lastDelivery: null,
      },
    });

    // Configurar Express com middleware de autenticação simulado
    app = express();
    app.use(express.json());
    
    // Middleware para simular autenticação com partnerId
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).partnerId = testPartnerId;
      next();
    });
    
    app.use("/v1/webhooks", webhooksRouter);
    app.use(errorHandler);
  });

  describe("POST /v1/webhooks", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve criar webhook com URL e eventos válidos", async () => {
        const response = await request(app)
          .post("/v1/webhooks")
          .send({
            url: "https://myapp.com/webhooks/medicamenta",
            events: ["patient.created", "dose.taken"],
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.url).toBe("https://myapp.com/webhooks/medicamenta");
        expect(response.body.events).toContain("patient.created");
        expect(response.body.events).toContain("dose.taken");
        expect(response.body.status).toBe("active");
        expect(response.body.secret).toMatch(/^whsec_/);
      });

      it("deve criar webhook com todos os eventos disponíveis", async () => {
        const allEvents = [
          "patient.created",
          "patient.updated",
          "patient.deleted",
          "medication.created",
          "medication.updated",
          "medication.deleted",
          "dose.taken",
          "dose.missed",
          "dose.skipped",
          "adherence.low",
          "stock.low",
        ];

        const response = await request(app)
          .post("/v1/webhooks")
          .send({
            url: "https://myapp.com/all-events",
            events: allEvents,
          });

        expect(response.status).toBe(201);
        expect(response.body.events).toHaveLength(11);
      });

      it("deve criar webhook com secret personalizado", async () => {
        const customSecret = "my_custom_secret_123";

        const response = await request(app)
          .post("/v1/webhooks")
          .send({
            url: "https://myapp.com/custom-secret",
            events: ["patient.created"],
            secret: customSecret,
          });

        expect(response.status).toBe(201);
        expect(response.body.secret).toBe(customSecret);
      });

      it("deve gerar secret automaticamente se não fornecido", async () => {
        const response = await request(app)
          .post("/v1/webhooks")
          .send({
            url: "https://myapp.com/auto-secret",
            events: ["dose.taken"],
          });

        expect(response.status).toBe(201);
        expect(response.body.secret).toBeDefined();
        expect(response.body.secret).toMatch(/^whsec_/);
        expect(response.body.secret.length).toBeGreaterThan(10);
      });

      it("deve inicializar stats do webhook", async () => {
        const response = await request(app)
          .post("/v1/webhooks")
          .send({
            url: "https://myapp.com/with-stats",
            events: ["medication.created"],
          });

        expect(response.status).toBe(201);
        expect(response.body.stats).toBeDefined();
        expect(response.body.stats.totalDeliveries).toBe(0);
        expect(response.body.stats.successfulDeliveries).toBe(0);
        expect(response.body.stats.failedDeliveries).toBe(0);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 400 se URL não fornecida", async () => {
        const response = await request(app)
          .post("/v1/webhooks")
          .send({
            events: ["patient.created"],
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se events não fornecido", async () => {
        const response = await request(app)
          .post("/v1/webhooks")
          .send({
            url: "https://myapp.com/webhook",
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se events não é array", async () => {
        const response = await request(app)
          .post("/v1/webhooks")
          .send({
            url: "https://myapp.com/webhook",
            events: "patient.created", // string ao invés de array
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se URL inválida", async () => {
        const response = await request(app)
          .post("/v1/webhooks")
          .send({
            url: "not-a-valid-url",
            events: ["patient.created"],
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se evento inválido", async () => {
        const response = await request(app)
          .post("/v1/webhooks")
          .send({
            url: "https://myapp.com/webhook",
            events: ["patient.created", "invalid.event"],
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar lista de eventos válidos no erro", async () => {
        const response = await request(app)
          .post("/v1/webhooks")
          .send({
            url: "https://myapp.com/webhook",
            events: ["unknown.event"],
          });

        expect(response.status).toBe(400);
        // A lista de eventos válidos está em error.details.validEvents
        expect(response.body.error.details?.validEvents).toBeDefined();
      });
    });
  });

  describe("GET /v1/webhooks", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve listar webhooks do partner", async () => {
        const response = await request(app)
          .get("/v1/webhooks");

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("data");
        expect(response.body).toHaveProperty("total");
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it("deve ocultar secret na listagem", async () => {
        const response = await request(app)
          .get("/v1/webhooks");

        expect(response.status).toBe(200);
        const webhooks = response.body.data;
        webhooks.forEach((webhook: any) => {
          expect(webhook.secret).toBe("***");
        });
      });
    });
  });

  describe("GET /v1/webhooks/:id", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve retornar webhook por ID", async () => {
        const response = await request(app)
          .get(`/v1/webhooks/${testWebhookId}`);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(testWebhookId);
        expect(response.body.url).toBe("https://example.com/webhook");
        expect(response.body.events).toContain("patient.created");
      });

      it("deve incluir secret no detalhe do webhook", async () => {
        const response = await request(app)
          .get(`/v1/webhooks/${testWebhookId}`);

        expect(response.status).toBe(200);
        expect(response.body.secret).toBeDefined();
        expect(response.body.secret).not.toBe("***");
      });

      it("deve incluir stats do webhook", async () => {
        const response = await request(app)
          .get(`/v1/webhooks/${testWebhookId}`);

        expect(response.status).toBe(200);
        expect(response.body.stats).toBeDefined();
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se webhook não existe", async () => {
        const response = await request(app)
          .get("/v1/webhooks/non-existent-id");

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se webhook pertence a outro partner", async () => {
        // Criar webhook de outro partner
        const otherWebhookId = "other-partner-webhook";
        await db.collection("webhooks").doc(otherWebhookId).set({
          partnerId: "other-partner",
          url: "https://other.com/webhook",
          events: ["patient.created"],
          secret: "whsec_other",
          status: "active",
        });

        const response = await request(app)
          .get(`/v1/webhooks/${otherWebhookId}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("DELETE /v1/webhooks/:id", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve deletar webhook", async () => {
        const response = await request(app)
          .delete(`/v1/webhooks/${testWebhookId}`);

        expect(response.status).toBe(204);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se webhook não existe", async () => {
        const response = await request(app)
          .delete("/v1/webhooks/non-existent-id");

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se webhook pertence a outro partner", async () => {
        // Criar webhook de outro partner
        const otherWebhookId = "other-webhook-delete";
        await db.collection("webhooks").doc(otherWebhookId).set({
          partnerId: "other-partner",
          url: "https://other.com/webhook",
          events: ["patient.created"],
          secret: "whsec_other",
          status: "active",
        });

        const response = await request(app)
          .delete(`/v1/webhooks/${otherWebhookId}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("POST /v1/webhooks/:id/test", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve testar entrega do webhook com sucesso", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

        const response = await request(app)
          .post(`/v1/webhooks/${testWebhookId}/test`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.statusCode).toBe(200);
        expect(response.body.message).toContain("successfully");
      });

      it("deve reportar falha quando endpoint retorna erro", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

        const response = await request(app)
          .post(`/v1/webhooks/${testWebhookId}/test`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body.statusCode).toBe(500);
        expect(response.body.message).toContain("failed");
      });

      it("deve chamar fetch com headers corretos", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
        });

        await request(app)
          .post(`/v1/webhooks/${testWebhookId}/test`);

        expect(mockFetch).toHaveBeenCalledWith(
          "https://example.com/webhook",
          expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({
              "Content-Type": "application/json",
              "User-Agent": "Medicamenta-Webhooks/1.0",
            }),
          })
        );
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se webhook não existe", async () => {
        const response = await request(app)
          .post("/v1/webhooks/non-existent-id/test");

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se webhook pertence a outro partner", async () => {
        // Criar webhook de outro partner
        const otherWebhookId = "other-webhook-test";
        await db.collection("webhooks").doc(otherWebhookId).set({
          partnerId: "other-partner",
          url: "https://other.com/webhook",
          events: ["patient.created"],
          secret: "whsec_other",
          status: "active",
        });

        const response = await request(app)
          .post(`/v1/webhooks/${otherWebhookId}/test`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });
});
