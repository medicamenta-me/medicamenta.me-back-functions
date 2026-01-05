/**
 * Testes para createPagSeguroSubscription Cloud Function
 * 
 * Cenários testados:
 * - Criação de subscription com dados válidos
 * - Validações de autenticação e campos
 * - Mock de chamadas HTTP ao PagSeguro API
 */

import * as admin from "firebase-admin";
import functionsTest from "firebase-functions-test";
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "@jest/globals";
import nock from "nock";

// Inicializa firebase-functions-test sem credenciais (usa emulator)
const test = functionsTest({
  projectId: "test-project",
});

// Mock axios for PagSeguro API calls
import { createPagSeguroSubscription } from "../../pagseguro-functions";

describe("🟢 PagSeguro Functions - createPagSeguroSubscription", () => {
  let wrapped: any;
  const testUserId = "test-user-pagseguro-123";
  const testPlanCode = "PLAN123";
  
  beforeAll(() => {
    // Firebase Admin já foi inicializado no setup.ts global
    // Apenas configura a função wrapped
    wrapped = test.wrap(createPagSeguroSubscription);
  });

  afterAll(async () => {
    const db = admin.firestore();
    const subscriptionsSnapshot = await db.collection("subscriptions").get();
    const batch = db.batch();
    subscriptionsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    
    test.cleanup();
    nock.cleanAll();
  });

  beforeEach(async () => {
    // Clear Firestore
    const db = admin.firestore();
    const subscriptionsSnapshot = await db.collection("subscriptions").get();
    const batch = db.batch();
    subscriptionsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    
    nock.cleanAll();
  });

  describe("✅ Cenários Positivos", () => {
    it("deve criar subscription PagSeguro com sucesso", async () => {
      // Arrange
      const mockCode = "ABCD1234567890EFGH";
      const mockXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <preApprovalRequest>
          <code>${mockCode}</code>
          <date>2025-12-16T10:00:00</date>
        </preApprovalRequest>`;

      nock("https://ws.sandbox.pagseguro.uol.com.br")
        .post(/\/pre-approvals\/request/)
        .reply(200, mockXmlResponse, {
          "Content-Type": "application/xml; charset=UTF-8",
        });

      const data = {
        planCode: testPlanCode,
        userId: testUserId,
        plan: "premium",
        billingCycle: "monthly",
        customer: {
          name: "João Silva",
          email: "joao@example.com",
          phone: {
            areaCode: "11",
            number: "999999999",
          },
          document: {
            type: "CPF",
            value: "12345678909",
          },
        },
      };

      const context = {
        auth: {
          uid: testUserId,
          token: {
            email: "joao@example.com",
          },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result).toHaveProperty("code", mockCode);
      expect(result).toHaveProperty("checkoutUrl");
      expect(result.checkoutUrl).toContain(mockCode);

      // Verify Firestore
      const subscriptionDoc = await admin
        .firestore()
        .collection("subscriptions")
        .doc(testUserId)
        .get();
      
      expect(subscriptionDoc.exists).toBe(true);
      expect(subscriptionDoc.data()?.plan).toBe("premium");
      expect(subscriptionDoc.data()?.pagseguroCode).toBe(mockCode);
      expect(subscriptionDoc.data()?.status).toBe("pending");
    });

    it("deve incluir URL de checkout sandbox correta", async () => {
      // Arrange
      const mockCode = "SANDBOX123456";
      const mockXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <preApprovalRequest>
          <code>${mockCode}</code>
        </preApprovalRequest>`;

      nock("https://ws.sandbox.pagseguro.uol.com.br")
        .post(/\/pre-approvals\/request/)
        .reply(200, mockXmlResponse);

      const data = {
        planCode: testPlanCode,
        userId: testUserId,
        plan: "family",
        billingCycle: "yearly",
        customer: {
          name: "Maria Santos",
          email: "maria@example.com",
          phone: { areaCode: "21", number: "988888888" },
          document: { type: "CPF", value: "98765432100" },
        },
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: "maria@example.com" },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result.checkoutUrl).toContain("sandbox.pagseguro.uol.com.br");
      expect(result.checkoutUrl).toContain("/v2/pre-approvals/request.html");
    });
  });

  describe("❌ Cenários Negativos", () => {
    it("deve retornar erro se não autenticado", async () => {
      const data = {
        planCode: testPlanCode,
        userId: testUserId,
        plan: "premium",
        billingCycle: "monthly",
        customer: {},
      };

      const context = { auth: undefined };

      await expect(wrapped(data, context)).rejects.toThrow(
        "User must be authenticated"
      );
    });

    it("deve retornar erro se planCode ausente", async () => {
      const data = {
        userId: testUserId,
        plan: "premium",
        billingCycle: "monthly",
        customer: {},
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: "test@example.com" },
        },
      };

      await expect(wrapped(data, context)).rejects.toThrow(
        "Missing required fields"
      );
    });

    it("deve retornar erro se customer ausente", async () => {
      const data = {
        planCode: testPlanCode,
        userId: testUserId,
        plan: "premium",
        billingCycle: "monthly",
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: "test@example.com" },
        },
      };

      await expect(wrapped(data, context)).rejects.toThrow(
        "Missing required fields"
      );
    });

    it("deve retornar erro se PagSeguro API falhar", async () => {
      // Arrange
      nock("https://ws.sandbox.pagseguro.uol.com.br")
        .post(/\/pre-approvals\/request/)
        .reply(400, `<?xml version="1.0" encoding="UTF-8"?>
          <errors>
            <error>
              <code>11013</code>
              <message>Invalid plan code</message>
            </error>
          </errors>`);

      const data = {
        planCode: "INVALID",
        userId: testUserId,
        plan: "premium",
        billingCycle: "monthly",
        customer: {
          name: "Test User",
          email: "test@example.com",
          phone: { areaCode: "11", number: "999999999" },
          document: { type: "CPF", value: "12345678909" },
        },
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: "test@example.com" },
        },
      };

      // Act & Assert
      await expect(wrapped(data, context)).rejects.toThrow();
    });
  });

  describe("⚠️ Edge Cases", () => {
    it("deve lidar com timeout da API PagSeguro", async () => {
      // Arrange - Simular timeout com nock usando delay grande
      nock("https://ws.sandbox.pagseguro.uol.com.br")
        .post(/\/pre-approvals\/request/)
        .delayConnection(31000) // Maior que timeout padrão do axios (30s)
        .reply(200, "<xml></xml>");

      const data = {
        planCode: testPlanCode,
        userId: testUserId,
        plan: "premium",
        billingCycle: "monthly",
        customer: {
          name: "Test",
          email: "test@example.com",
          phone: { areaCode: "11", number: "999999999" },
          document: { type: "CPF", value: "12345678909" },
        },
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: "test@example.com" },
        },
      };

      // Act & Assert - Deve falhar por timeout
      await expect(wrapped(data, context)).rejects.toThrow();
    }, 35000)

    it("deve lidar com resposta XML malformada", async () => {
      // Arrange
      nock("https://ws.sandbox.pagseguro.uol.com.br")
        .post(/\/pre-approvals\/request/)
        .reply(200, "Invalid XML Response");

      const data = {
        planCode: testPlanCode,
        userId: testUserId,
        plan: "premium",
        billingCycle: "monthly",
        customer: {
          name: "Test",
          email: "test@example.com",
          phone: { areaCode: "11", number: "999999999" },
          document: { type: "CPF", value: "12345678909" },
        },
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: "test@example.com" },
        },
      };

      // Act & Assert
      await expect(wrapped(data, context)).rejects.toThrow();
    });
  });
});
