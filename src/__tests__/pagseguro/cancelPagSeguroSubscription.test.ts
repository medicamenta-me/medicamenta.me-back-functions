/**
 * Testes para cancelPagSeguroSubscription Cloud Function
 * 
 * Cenários testados:
 * - Positivos: Cancelamento bem-sucedido de assinatura
 * - Negativos: Validações de autenticação e subscriptionCode
 * - Edge Cases: Falhas na API PagSeguro, subscription já cancelada
 */

// @ts-nocheck
import * as admin from "firebase-admin";
import functionsTest from "firebase-functions-test";
import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import axios from "axios";

const test = functionsTest();

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock functions.config()
const mockConfig = {
  pagseguro: {
    email: "test@pagseguro.com",
    token: "test-token-123456"
  }
};

jest.mock("firebase-functions", () => {
  const actual = jest.requireActual("firebase-functions");
  return {
    ...actual,
    config: jest.fn(() => mockConfig),
    https: {
      ...actual.https,
      HttpsError: actual.https.HttpsError,
      onCall: actual.https.onCall,
    },
  };
});

// Import function after mocking
import { cancelPagSeguroSubscription } from "../../pagseguro-functions";

describe("🟣 PagSeguro Functions - cancelPagSeguroSubscription", () => {
  let wrapped: any;
  const testSubscriptionCode = "SUB123456789";
  
  beforeAll(() => {
    // Firebase Admin j� inicializado no setup.ts global
    wrapped = test.wrap(cancelPagSeguroSubscription);
  });

  afterAll(async () => {
    test.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("✅ Cenários Positivos", () => {
    it("deve cancelar assinatura com sucesso", async () => {
      mockedAxios.put.mockResolvedValue({ data: { success: true } });

      const result = await wrapped(
        { subscriptionCode: testSubscriptionCode },
        { auth: { uid: "test-user-123" } }
      );

      expect(mockedAxios.put).toHaveBeenCalledWith(
        expect.stringContaining(`/v2/pre-approvals/${testSubscriptionCode}/cancel`)
      );
      expect(mockedAxios.put).toHaveBeenCalledWith(
        expect.stringContaining("email=test@pagseguro.com")
      );
      expect(mockedAxios.put).toHaveBeenCalledWith(
        expect.stringContaining("token=test-token-123456")
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe("Subscription canceled");
    });

    it("deve incluir credenciais corretas na URL", async () => {
      mockedAxios.put.mockResolvedValue({ data: {} });

      await wrapped(
        { subscriptionCode: testSubscriptionCode },
        { auth: { uid: "test-user-123" } }
      );

      const callUrl = mockedAxios.put.mock.calls[0][0];
      expect(callUrl).toContain("email=test@pagseguro.com");
      expect(callUrl).toContain("token=test-token-123456");
      expect(callUrl).toContain(testSubscriptionCode);
    });

    it("deve retornar mensagem de sucesso", async () => {
      mockedAxios.put.mockResolvedValue({ data: {} });

      const result = await wrapped(
        { subscriptionCode: "SUB987654321" },
        { auth: { uid: "test-user-456" } }
      );

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("message");
      expect(typeof result.message).toBe("string");
    });
  });

  describe("❌ Cenários Negativos", () => {
    it("deve retornar erro se não autenticado", async () => {
      await expect(
        wrapped(
          { subscriptionCode: testSubscriptionCode },
          { auth: null }
        )
      ).rejects.toThrow("User must be authenticated");
    });

    it("deve retornar erro se subscriptionCode ausente", async () => {
      await expect(
        wrapped({}, { auth: { uid: "test-user-123" } })
      ).rejects.toThrow("Missing subscriptionCode");
    });

    it("deve retornar erro se subscriptionCode vazio", async () => {
      await expect(
        wrapped(
          { subscriptionCode: "" },
          { auth: { uid: "test-user-123" } }
        )
      ).rejects.toThrow("Missing subscriptionCode");
    });

    it("deve retornar erro se API PagSeguro falhar", async () => {
      mockedAxios.put.mockRejectedValue(new Error("PagSeguro API Error"));

      await expect(
        wrapped(
          { subscriptionCode: testSubscriptionCode },
          { auth: { uid: "test-user-123" } }
        )
      ).rejects.toThrow("PagSeguro API Error");
    });
  });

  describe("⚠️ Edge Cases", () => {
    it("deve lidar com subscription não encontrada", async () => {
      mockedAxios.put.mockRejectedValue({
        response: {
          status: 404,
          data: { error: "Subscription not found" }
        }
      });

      await expect(
        wrapped(
          { subscriptionCode: "SUB_INVALID" },
          { auth: { uid: "test-user-123" } }
        )
      ).rejects.toThrow();
    });

    it("deve lidar com subscription já cancelada", async () => {
      mockedAxios.put.mockRejectedValue({
        response: {
          status: 400,
          data: { error: "Subscription already canceled" }
        }
      });

      await expect(
        wrapped(
          { subscriptionCode: testSubscriptionCode },
          { auth: { uid: "test-user-123" } }
        )
      ).rejects.toThrow();
    });

    it("deve lidar com timeout da API PagSeguro", async () => {
      mockedAxios.put.mockRejectedValue(new Error("ETIMEDOUT"));

      await expect(
        wrapped(
          { subscriptionCode: testSubscriptionCode },
          { auth: { uid: "test-user-123" } }
        )
      ).rejects.toThrow("ETIMEDOUT");
    });

    it("deve lidar com credenciais inválidas", async () => {
      mockedAxios.put.mockRejectedValue({
        response: {
          status: 401,
          data: { error: "Unauthorized" }
        }
      });

      await expect(
        wrapped(
          { subscriptionCode: testSubscriptionCode },
          { auth: { uid: "test-user-123" } }
        )
      ).rejects.toThrow();
    });
  });
});
