/**
 * Testes para getStripeUpcomingInvoice Cloud Function
 * 
 * Cenários testados:
 * - Positivos: Buscar próxima invoice com sucesso
 * - Negativos: Validações de autenticação e customerId
 * - Edge Cases: Falhas na API Stripe, customer sem subscription
 */

// @ts-nocheck
import * as admin from "firebase-admin";
import functionsTest from "firebase-functions-test";
import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";

const test = functionsTest();

// Mock Stripe
const mockStripeInvoicesRetrieveUpcoming = jest.fn();

jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    invoices: {
      retrieveUpcoming: mockStripeInvoicesRetrieveUpcoming,
    },
  }));
});

// Set STRIPE_SECRET_KEY before importing function (initializes Stripe SDK)
process.env.STRIPE_SECRET_KEY = "sk_test_mock_key";

// Import function after mocking
import { getStripeUpcomingInvoice } from "../../stripe-functions";

describe("🔵 Stripe Functions - getStripeUpcomingInvoice", () => {
  let wrapped: any;
  const testCustomerId = "cus_test_upcoming_123";
  
  beforeAll(() => {
    // Firebase Admin j� inicializado no setup.ts global
    wrapped = test.wrap(getStripeUpcomingInvoice);
  });

  afterAll(async () => {
    test.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("✅ Cenários Positivos", () => {
    it("deve buscar próxima invoice com sucesso", async () => {
      const mockInvoice = {
        id: "in_upcoming_123",
        amount_due: 9990, // R$ 99,90 em centavos
        currency: "brl",
        period_start: 1704067200, // 2024-01-01
        period_end: 1706745599,   // 2024-01-31
      };

      mockStripeInvoicesRetrieveUpcoming.mockResolvedValue(mockInvoice);

      const result = await wrapped({ customerId: testCustomerId }, { auth: { uid: "test-user-123" } });

      expect(mockStripeInvoicesRetrieveUpcoming).toHaveBeenCalledWith({
        customer: testCustomerId,
      });
      expect(result.amount).toBe(99.9); // Converted from centavos
      expect(result.currency).toBe("brl");
      expect(result.periodStart).toBe(1704067200);
      expect(result.periodEnd).toBe(1706745599);
    });

    it("deve converter amount_due de centavos para reais corretamente", async () => {
      const mockInvoice = {
        id: "in_test",
        amount_due: 4990, // R$ 49,90
        currency: "brl",
        period_start: 1704067200,
        period_end: 1706745599,
      };

      mockStripeInvoicesRetrieveUpcoming.mockResolvedValue(mockInvoice);

      const result = await wrapped({ customerId: testCustomerId }, { auth: { uid: "test-user-123" } });

      expect(result.amount).toBe(49.9);
    });

    it("deve retornar todos os campos obrigatórios", async () => {
      const mockInvoice = {
        id: "in_test",
        amount_due: 19990,
        currency: "usd",
        period_start: 1704067200,
        period_end: 1706745599,
      };

      mockStripeInvoicesRetrieveUpcoming.mockResolvedValue(mockInvoice);

      const result = await wrapped({ customerId: testCustomerId }, { auth: { uid: "test-user-123" } });

      expect(result).toHaveProperty("amount");
      expect(result).toHaveProperty("currency");
      expect(result).toHaveProperty("periodStart");
      expect(result).toHaveProperty("periodEnd");
      expect(Object.keys(result).length).toBe(4);
    });
  });

  describe("❌ Cenários Negativos", () => {
    it("deve retornar erro se não autenticado", async () => {
      await expect(
        wrapped({ customerId: testCustomerId }, { auth: null })
      ).rejects.toThrow("User must be authenticated");
    });

    it("deve retornar erro se customerId ausente", async () => {
      await expect(
        wrapped({}, { auth: { uid: "test-user-123" } })
      ).rejects.toThrow("Missing customerId");
    });

    it("deve retornar erro se customerId vazio", async () => {
      await expect(
        wrapped({ customerId: "" }, { auth: { uid: "test-user-123" } })
      ).rejects.toThrow("Missing customerId");
    });

    it("deve retornar erro se Stripe API falhar", async () => {
      mockStripeInvoicesRetrieveUpcoming.mockRejectedValue(
        new Error("Stripe API Error: Invalid customer")
      );

      await expect(
        wrapped({ customerId: "cus_invalid" }, { auth: { uid: "test-user-123" } })
      ).rejects.toThrow();
    });
  });

  describe("⚠️ Edge Cases", () => {
    it("deve lidar com customer sem subscription ativa", async () => {
      mockStripeInvoicesRetrieveUpcoming.mockRejectedValue(
        new Error("No upcoming invoices for customer")
      );

      await expect(
        wrapped({ customerId: testCustomerId }, { auth: { uid: "test-user-123" } })
      ).rejects.toThrow();
    });

    it("deve lidar com invoice com amount_due zero", async () => {
      const mockInvoice = {
        id: "in_test",
        amount_due: 0,
        currency: "brl",
        period_start: 1704067200,
        period_end: 1706745599,
      };

      mockStripeInvoicesRetrieveUpcoming.mockResolvedValue(mockInvoice);

      const result = await wrapped({ customerId: testCustomerId }, { auth: { uid: "test-user-123" } });

      expect(result.amount).toBe(0);
    });

    it("deve lidar com valores monetários grandes", async () => {
      const mockInvoice = {
        id: "in_test",
        amount_due: 999999, // R$ 9.999,99
        currency: "brl",
        period_start: 1704067200,
        period_end: 1706745599,
      };

      mockStripeInvoicesRetrieveUpcoming.mockResolvedValue(mockInvoice);

      const result = await wrapped({ customerId: testCustomerId }, { auth: { uid: "test-user-123" } });

      expect(result.amount).toBe(9999.99);
    });

    it("deve lidar com período de billing muito curto (trial)", async () => {
      const mockInvoice = {
        id: "in_test",
        amount_due: 0, // Trial period
        currency: "brl",
        period_start: 1704067200,
        period_end: 1704672000, // 7 days later
      };

      mockStripeInvoicesRetrieveUpcoming.mockResolvedValue(mockInvoice);

      const result = await wrapped({ customerId: testCustomerId }, { auth: { uid: "test-user-123" } });

      expect(result.amount).toBe(0);
      expect(result.periodEnd - result.periodStart).toBe(604800); // 7 days in seconds
    });
  });
});
