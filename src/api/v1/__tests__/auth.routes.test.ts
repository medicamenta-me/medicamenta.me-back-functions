/**
 * 🧪 Auth Routes Tests - Integration Tests
 * Testes de integração usando mocks do Firestore
 */

import * as admin from "firebase-admin";
import request from "supertest";
import express, { Express } from "express";
import { authRouter } from "../auth.routes";
import { errorHandler } from "../../middleware/error-handler";
import { clearMockData } from "../../../__tests__/setup";

// Firebase Admin mockado no setup.ts global
const db = admin.firestore();

describe("🔐 Auth Routes - Integration Tests", () => {
  let app: Express;
  const testPartnerId = "test-partner-auth-" + Date.now();
  const testClientSecret = "test-secret-123";

  beforeAll(async () => {
    // Criar partner de teste no Firestore mock
    await db.collection("partners").doc(testPartnerId).set({
      clientSecret: testClientSecret,
      status: "active",
      permissions: ["read", "write"],
      createdAt: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    // Limpar dados de teste
    clearMockData();
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/v1/auth", authRouter);
    app.use(errorHandler);
  });

  describe("POST /v1/auth/token", () => {
    describe("✅ Client Credentials Flow", () => {
      it("deve gerar tokens com credenciais válidas", async () => {
        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "client_credentials",
            client_id: testPartnerId,
            client_secret: testClientSecret,
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("access_token");
        expect(response.body).toHaveProperty("refresh_token");
        expect(response.body.token_type).toBe("Bearer");
        expect(response.body.expires_in).toBe(86400);
        
        // Verificar que refresh token foi salvo no Firestore
        const tokensSnapshot = await db
          .collection("refresh_tokens")
          .where("partnerId", "==", testPartnerId)
          .limit(1)
          .get();
        
        expect(tokensSnapshot.empty).toBe(false);
      });

      it("deve retornar 400 se grant_type não for fornecido", async () => {
        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            client_id: testPartnerId,
            client_secret: testClientSecret,
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se client_id ou client_secret faltando", async () => {
        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "client_credentials",
            client_id: testPartnerId,
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 401 se partner não existe", async () => {
        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "client_credentials",
            client_id: "non-existent-partner",
            client_secret: "any-secret",
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 401 se client_secret incorreto", async () => {
        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "client_credentials",
            client_id: testPartnerId,
            client_secret: "wrong_secret",
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se partner está suspenso", async () => {
        // Criar partner suspenso
        const suspendedPartnerId = "suspended-partner-" + Date.now();
        await db.collection("partners").doc(suspendedPartnerId).set({
          clientSecret: "suspended-secret",
          status: "suspended",
          permissions: [],
        });

        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "client_credentials",
            client_id: suspendedPartnerId,
            client_secret: "suspended-secret",
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();

        // Limpar
        await db.collection("partners").doc(suspendedPartnerId).delete();
      });
    });

    describe("✅ Refresh Token Flow", () => {
      it("deve gerar novo access token com refresh token válido", async () => {
        // Primeiro, obter um refresh token real
        const tokenResponse = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "client_credentials",
            client_id: testPartnerId,
            client_secret: testClientSecret,
          });

        const refreshToken = tokenResponse.body.refresh_token;

        // Usar o refresh token para obter novo access token
        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("access_token");
        expect(response.body.token_type).toBe("Bearer");
        expect(response.body.expires_in).toBe(86400);
        expect(response.body.refresh_token).toBeUndefined();
      });

      it("deve retornar 400 se refresh_token não fornecido", async () => {
        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "refresh_token",
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 401 se refresh token inválido", async () => {
        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "refresh_token",
            refresh_token: "invalid_token_string",
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 401 se refresh token foi revogado", async () => {
        // Criar e revogar um token
        const tokenResponse = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "client_credentials",
            client_id: testPartnerId,
            client_secret: testClientSecret,
          });

        const refreshToken = tokenResponse.body.refresh_token;

        // Revogar o token
        const revokeResponse = await request(app).post("/v1/auth/revoke").send({ token: refreshToken });
        expect(revokeResponse.status).toBe(200);

        // Polling: Aguardar até que Firestore confirme revogação
        // Isso resolve o race condition do emulator
        let isRevoked = false;
        let attempts = 0;
        const maxAttempts = 20; // 2 segundos max
        
        while (!isRevoked && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const tokenQuery = await admin.firestore()
            .collection("refresh_tokens")
            .where("token", "==", refreshToken)
            .limit(1)
            .get();
          
          if (!tokenQuery.empty) {
            const tokenData = tokenQuery.docs[0].data();
            isRevoked = tokenData.revoked === true;
          }
          
          attempts++;
        }
        
        // Garantir que token foi revogado
        expect(isRevoked).toBe(true);

        // Tentar usar o token revogado
        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBeDefined();
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 400 para grant_type não suportado", async () => {
        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "password",
            username: "user",
            password: "pass",
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("POST /v1/auth/revoke", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve revogar refresh token existente", async () => {
        // Criar um token
        const tokenResponse = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "client_credentials",
            client_id: testPartnerId,
            client_secret: testClientSecret,
          });

        const refreshToken = tokenResponse.body.refresh_token;

        // Revogar o token
        const response = await request(app)
          .post("/v1/auth/revoke")
          .send({ token: refreshToken });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        // Verificar que foi marcado como revogado no Firestore
        const tokensSnapshot = await db
          .collection("refresh_tokens")
          .where("token", "==", refreshToken)
          .limit(1)
          .get();

        if (!tokensSnapshot.empty) {
          const tokenDoc = tokensSnapshot.docs[0].data();
          expect(tokenDoc.revoked).toBe(true);
        }
      });

      it("deve retornar sucesso mesmo se token não existe", async () => {
        const response = await request(app)
          .post("/v1/auth/revoke")
          .send({ token: "non_existent_token_123" });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 400 se token não fornecido", async () => {
        const response = await request(app).post("/v1/auth/revoke").send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("POST /v1/auth/api-key", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve gerar API key com credenciais válidas", async () => {
        const response = await request(app)
          .post("/v1/auth/api-key")
          .send({
            client_id: testPartnerId,
            client_secret: testClientSecret,
            name: "Production API Key",
            tier: "professional",
            permissions: ["read", "write"],
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("api_key");
        expect(response.body.api_key).toMatch(/^mk_professional_/);
        expect(response.body.name).toBe("Production API Key");
        expect(response.body.tier).toBe("professional");
        expect(response.body.permissions).toEqual(["read", "write"]);
        expect(response.body.created_at).toBeDefined();
      });

      it("deve usar valores padrão se não fornecidos", async () => {
        const response = await request(app)
          .post("/v1/auth/api-key")
          .send({
            client_id: testPartnerId,
            client_secret: testClientSecret,
          });

        expect(response.status).toBe(201);
        expect(response.body.name).toBe("Default API Key");
        expect(response.body.tier).toBe("free");
        expect(response.body.permissions).toEqual([]);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 401 se credenciais não fornecidas", async () => {
        const response = await request(app)
          .post("/v1/auth/api-key")
          .send({
            name: "Test Key",
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 401 se partner não existe", async () => {
        const response = await request(app)
          .post("/v1/auth/api-key")
          .send({
            client_id: "non-existent-partner",
            client_secret: "any-secret",
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 401 se client_secret incorreto", async () => {
        const response = await request(app)
          .post("/v1/auth/api-key")
          .send({
            client_id: testPartnerId,
            client_secret: "wrong_secret",
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBeDefined();
      });
    });
  });
});
