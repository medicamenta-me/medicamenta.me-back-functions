/**
 * 🔐 Auth Routes - Unit Tests
 * 
 * Testes unitários das rotas de autenticação
 * Usa mocks do Firestore
 */

import request from "supertest";
import express, { Express } from "express";
import * as admin from "firebase-admin";
import { authRouter } from "./auth.routes";
import { errorHandler } from "../middleware/error-handler";
import { clearMockData } from "../../__tests__/setup";

// Firebase Admin mockado no setup.ts global
const db = admin.firestore();

describe("🔐 Auth Routes - Unit Tests", () => {
  let app: Express;
  const testPartnerId = "test-partner-auth-unit";
  const testClientSecret = "test-secret-123";

  afterAll(() => {
    clearMockData();
  });

  beforeEach(async () => {
    // Criar partner de teste no Firestore mock ANTES de cada teste
    // porque o setup global limpa os dados antes de cada teste
    await db.collection("partners").doc(testPartnerId).set({
      clientSecret: testClientSecret,
      status: "active",
      permissions: ["read", "write"],
      createdAt: new Date().toISOString(),
    });

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
        const suspendedPartnerId = "suspended-partner";
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
      });
    });

    describe("✅ Refresh Token Flow", () => {
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

      it("deve retornar 401 se refresh token não encontrado no banco", async () => {
        // Token JWT válido mas não existe no banco
        const jwt = require("jsonwebtoken");
        const jwtSecret = process.env.JWT_SECRET || "your-secret-key-change-in-production";
        const validToken = jwt.sign(
          { sub: testPartnerId },
          jwtSecret,
          { 
            expiresIn: "7d",
            issuer: "medicamenta.me",
            audience: "medicamenta-api"
          }
        );

        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "refresh_token",
            refresh_token: validToken,
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 401 se refresh token foi revogado", async () => {
        const jwt = require("jsonwebtoken");
        const jwtSecret = process.env.JWT_SECRET || "your-secret-key-change-in-production";
        const revokedToken = jwt.sign(
          { sub: testPartnerId },
          jwtSecret,
          { 
            expiresIn: "7d",
            issuer: "medicamenta.me",
            audience: "medicamenta-api"
          }
        );

        // Salvar token como revogado
        await db.collection("refresh_tokens").add({
          token: revokedToken,
          partnerId: testPartnerId,
          revoked: true,
          createdAt: new Date().toISOString(),
        });

        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "refresh_token",
            refresh_token: revokedToken,
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 401 se partner não existe mais", async () => {
        const jwt = require("jsonwebtoken");
        const jwtSecret = process.env.JWT_SECRET || "your-secret-key-change-in-production";
        const tokenForDeletedPartner = jwt.sign(
          { sub: "deleted-partner-id" },
          jwtSecret,
          { 
            expiresIn: "7d",
            issuer: "medicamenta.me",
            audience: "medicamenta-api"
          }
        );

        // Salvar token válido mas partner não existe
        await db.collection("refresh_tokens").add({
          token: tokenForDeletedPartner,
          partnerId: "deleted-partner-id",
          revoked: false,
          createdAt: new Date().toISOString(),
        });

        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "refresh_token",
            refresh_token: tokenForDeletedPartner,
          });

        expect(response.status).toBe(401);
        expect(response.body.error).toBeDefined();
      });

      it("deve gerar novo access_token com refresh_token válido", async () => {
        const jwt = require("jsonwebtoken");
        const jwtSecret = process.env.JWT_SECRET || "your-secret-key-change-in-production";
        const validRefreshToken = jwt.sign(
          { sub: testPartnerId },
          jwtSecret,
          { 
            expiresIn: "7d",
            issuer: "medicamenta.me",
            audience: "medicamenta-api"
          }
        );

        // Salvar token válido no banco
        await db.collection("refresh_tokens").add({
          token: validRefreshToken,
          partnerId: testPartnerId,
          revoked: false,
          createdAt: new Date().toISOString(),
        });

        const response = await request(app)
          .post("/v1/auth/token")
          .send({
            grant_type: "refresh_token",
            refresh_token: validRefreshToken,
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("access_token");
        expect(response.body.token_type).toBe("Bearer");
        expect(response.body.expires_in).toBe(86400);
      });
    });

    describe("❌ Grant Type inválido", () => {
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
    it("deve retornar 400 se token não fornecido", async () => {
      const response = await request(app)
        .post("/v1/auth/revoke")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("deve retornar sucesso mesmo para token inexistente", async () => {
      const response = await request(app)
        .post("/v1/auth/revoke")
        .send({ token: "nonexistent-token" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("deve revogar token existente", async () => {
      // Criar refresh token no mock
      await db.collection("refresh_tokens").add({
        token: "valid-refresh-token-to-revoke",
        partnerId: testPartnerId,
        revoked: false,
        createdAt: new Date().toISOString(),
      });

      const response = await request(app)
        .post("/v1/auth/revoke")
        .send({ token: "valid-refresh-token-to-revoke" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("POST /v1/auth/api-key", () => {
    it("deve retornar 401 se credenciais não fornecidas", async () => {
      const response = await request(app)
        .post("/v1/auth/api-key")
        .send({
          name: "Test API Key",
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it("deve retornar 401 se credenciais inválidas", async () => {
      const response = await request(app)
        .post("/v1/auth/api-key")
        .send({
          client_id: testPartnerId,
          client_secret: "wrong-secret",
          name: "Test API Key",
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
          name: "Test API Key",
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it("deve gerar API key com credenciais válidas", async () => {
      const response = await request(app)
        .post("/v1/auth/api-key")
        .send({
          client_id: testPartnerId,
          client_secret: testClientSecret,
          name: "My New API Key",
          tier: "premium",
          permissions: ["read", "write"],
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("api_key");
      expect(response.body.name).toBe("My New API Key");
      expect(response.body.tier).toBe("premium");
    });

    it("deve usar valores padrão quando não fornecidos", async () => {
      const response = await request(app)
        .post("/v1/auth/api-key")
        .send({
          client_id: testPartnerId,
          client_secret: testClientSecret,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("api_key");
      expect(response.body.name).toBe("Default API Key");
      expect(response.body.tier).toBe("free");
    });
  });
});
