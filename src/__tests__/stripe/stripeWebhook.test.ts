/**
 * Testes para stripeWebhook Cloud Function
 * 
 * Cenários testados:
 * - Eventos: checkout.session.completed, subscription.created/updated/deleted
 * - Eventos: invoice.paid, invoice.payment_failed
 * - Validação de assinatura do webhook
 * - Edge cases: eventos sem metadata, usuários não encontrados
 */

// @ts-nocheck
import * as admin from "firebase-admin";
import functionsTest from "firebase-functions-test";
import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from "@jest/globals";
import type { Request, Response } from "express";
import { clearMockData } from "../setup";

const test = functionsTest();

// Mock Stripe
const mockStripeWebhooksConstructEvent = jest.fn();
const mockStripeSubscriptionsRetrieve = jest.fn();

jest.mock("stripe", () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockStripeWebhooksConstructEvent,
    },
    subscriptions: {
      retrieve: mockStripeSubscriptionsRetrieve,
    },
  }));
});

// Set STRIPE_SECRET_KEY before importing function (initializes Stripe SDK)
process.env.STRIPE_SECRET_KEY = "sk_test_mock_key";

// Import function after mocking
import { stripeWebhook } from "../../stripe-functions";

describe("🔵 Stripe Functions - stripeWebhook", () => {
  const testUserId = "test-user-webhook-123";
  const testCustomerId = "cus_webhook_test";
  const testSubscriptionId = "sub_webhook_test";
  
  beforeAll(() => {
    // Firebase Admin mockado no setup.ts global
  });

  afterAll(() => {
    // Cleanup é feito automaticamente pelo mock
    clearMockData();
    test.cleanup();
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    // Clear mock data
    clearMockData();
  });

  describe("✅ checkout.session.completed", () => {
    it("deve processar checkout session completed", async () => {
      // Arrange
      const mockSession = {
        id: "cs_test_123",
        customer: testCustomerId,
        subscription: testSubscriptionId,
        metadata: {
          userId: testUserId,
          plan: "premium",
          billingCycle: "monthly",
        },
      };

      const mockSubscription = {
        id: testSubscriptionId,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      };

      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: mockSession,
        },
      });

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const req = {
        headers: {
          "stripe-signature": "test-signature",
        },
        rawBody: Buffer.from("test-body"),
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      } as unknown as Response;

      // Act
      await stripeWebhook(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ received: true });
      
      // Verify subscription created in Firestore
      const subscriptionDoc = await admin
        .firestore()
        .collection("subscriptions")
        .doc(testUserId)
        .get();
      
      expect(subscriptionDoc.exists).toBe(true);
      expect(subscriptionDoc.data()?.plan).toBe("premium");
      expect(subscriptionDoc.data()?.status).toBe("active");
      expect(subscriptionDoc.data()?.stripeCustomerId).toBe(testCustomerId);
      expect(subscriptionDoc.data()?.stripeSubscriptionId).toBe(testSubscriptionId);
    });

    it("deve lidar com checkout session sem metadata", async () => {
      // Arrange
      const mockSession = {
        id: "cs_test_456",
        customer: testCustomerId,
        subscription: testSubscriptionId,
        metadata: {}, // Empty metadata
      };

      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: mockSession,
        },
      });

      const req = {
        headers: {
          "stripe-signature": "test-signature",
        },
        rawBody: Buffer.from("test-body"),
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      } as unknown as Response;

      // Act
      await stripeWebhook(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ received: true });
      
      // Should not create subscription without metadata
      const subscriptionDoc = await admin
        .firestore()
        .collection("subscriptions")
        .doc(testUserId)
        .get();
      
      expect(subscriptionDoc.exists).toBe(false);
    });
  });

  describe("✅ customer.subscription.created/updated", () => {
    it("deve processar subscription created", async () => {
      // Arrange
      const mockSubscription = {
        id: testSubscriptionId,
        customer: testCustomerId,
        status: "active",
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        cancel_at_period_end: false,
        metadata: {
          userId: testUserId,
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: "customer.subscription.created",
        data: {
          object: mockSubscription,
        },
      });

      const req = {
        headers: {
          "stripe-signature": "test-signature",
        },
        rawBody: Buffer.from("test-body"),
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      } as unknown as Response;

      // Act
      await stripeWebhook(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ received: true });
      
      const subscriptionDoc = await admin
        .firestore()
        .collection("subscriptions")
        .doc(testUserId)
        .get();
      
      expect(subscriptionDoc.exists).toBe(true);
      expect(subscriptionDoc.data()?.status).toBe("active");
    });

    it("deve processar subscription updated com cancel_at_period_end", async () => {
      // Arrange
      // First create a subscription
      await admin.firestore().collection("subscriptions").doc(testUserId).set({
        userId: testUserId,
        plan: "premium",
        status: "active",
      });

      const mockSubscription = {
        id: testSubscriptionId,
        customer: testCustomerId,
        status: "active",
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        cancel_at_period_end: true, // User canceled
        metadata: {
          userId: testUserId,
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: mockSubscription,
        },
      });

      const req = {
        headers: {
          "stripe-signature": "test-signature",
        },
        rawBody: Buffer.from("test-body"),
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      } as unknown as Response;

      // Act
      await stripeWebhook(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ received: true });
      
      const subscriptionDoc = await admin
        .firestore()
        .collection("subscriptions")
        .doc(testUserId)
        .get();
      
      expect(subscriptionDoc.data()?.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe("✅ customer.subscription.deleted", () => {
    it("deve processar subscription deleted", async () => {
      // Arrange
      // First create a subscription
      await admin.firestore().collection("subscriptions").doc(testUserId).set({
        userId: testUserId,
        plan: "premium",
        status: "active",
        stripeSubscriptionId: testSubscriptionId,
      });

      const mockSubscription = {
        id: testSubscriptionId,
        customer: testCustomerId,
        status: "canceled",
        metadata: {
          userId: testUserId,
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: {
          object: mockSubscription,
        },
      });

      const req = {
        headers: {
          "stripe-signature": "test-signature",
        },
        rawBody: Buffer.from("test-body"),
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      } as unknown as Response;

      // Act
      await stripeWebhook(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ received: true });
      
      const subscriptionDoc = await admin
        .firestore()
        .collection("subscriptions")
        .doc(testUserId)
        .get();
      
      expect(subscriptionDoc.data()?.plan).toBe("free");
      expect(subscriptionDoc.data()?.status).toBe("canceled");
      expect(subscriptionDoc.data()?.stripeSubscriptionId).toBeNull();
    });
  });

  describe("✅ invoice.paid", () => {
    it("deve processar invoice paid e resetar contadores", async () => {
      // Arrange
      // Create user with Stripe customer ID
      await admin.firestore().collection("users").doc(testUserId).set({
        email: "test@example.com",
        stripeCustomerId: testCustomerId,
      });

      // Create subscription with usage counters
      await admin.firestore().collection("subscriptions").doc(testUserId).set({
        userId: testUserId,
        plan: "premium",
        status: "active",
        currentUsage: {
          reportsGenerated: 10,
          ocrScansUsed: 5,
          telehealthConsultsUsed: 2,
        },
      });

      const mockInvoice = {
        id: "in_test_123",
        customer: testCustomerId,
        amount_paid: 2990, // $29.90
      };

      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: "invoice.paid",
        data: {
          object: mockInvoice,
        },
      });

      const req = {
        headers: {
          "stripe-signature": "test-signature",
        },
        rawBody: Buffer.from("test-body"),
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      } as unknown as Response;

      // Act
      await stripeWebhook(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ received: true });
      
      const subscriptionDoc = await admin
        .firestore()
        .collection("subscriptions")
        .doc(testUserId)
        .get();
      
      expect(subscriptionDoc.data()?.currentUsage.reportsGenerated).toBe(0);
      expect(subscriptionDoc.data()?.currentUsage.ocrScansUsed).toBe(0);
      expect(subscriptionDoc.data()?.currentUsage.telehealthConsultsUsed).toBe(0);
      expect(subscriptionDoc.data()?.lastPaymentAmount).toBe(29.90);
    });
  });

  describe("✅ invoice.payment_failed", () => {
    it("deve processar invoice payment failed", async () => {
      // Arrange
      // Create user with Stripe customer ID
      await admin.firestore().collection("users").doc(testUserId).set({
        email: "test@example.com",
        stripeCustomerId: testCustomerId,
      });

      // Create active subscription
      await admin.firestore().collection("subscriptions").doc(testUserId).set({
        userId: testUserId,
        plan: "premium",
        status: "active",
      });

      const mockInvoice = {
        id: "in_test_456",
        customer: testCustomerId,
        amount_due: 2990,
      };

      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: "invoice.payment_failed",
        data: {
          object: mockInvoice,
        },
      });

      const req = {
        headers: {
          "stripe-signature": "test-signature",
        },
        rawBody: Buffer.from("test-body"),
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      } as unknown as Response;

      // Act
      await stripeWebhook(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ received: true });
      
      const subscriptionDoc = await admin
        .firestore()
        .collection("subscriptions")
        .doc(testUserId)
        .get();
      
      expect(subscriptionDoc.data()?.status).toBe("past_due");
    });
  });

  describe("❌ Cenários Negativos", () => {
    it("deve retornar erro 400 se assinatura do webhook inválida", async () => {
      // Arrange
      mockStripeWebhooksConstructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const req = {
        headers: {
          "stripe-signature": "invalid-signature",
        },
        rawBody: Buffer.from("test-body"),
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      } as unknown as Response;

      // Act
      await stripeWebhook(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining("Webhook Error"));
    });

    it("deve ignorar eventos não reconhecidos", async () => {
      // Arrange
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: "unknown.event.type",
        data: {
          object: {},
        },
      });

      const req = {
        headers: {
          "stripe-signature": "test-signature",
        },
        rawBody: Buffer.from("test-body"),
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      } as unknown as Response;

      // Act
      await stripeWebhook(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });
  });

  describe("⚠️ Edge Cases", () => {
    it("deve lidar com usuário não encontrado em invoice.paid", async () => {
      // Arrange - No user created
      const mockInvoice = {
        id: "in_test_789",
        customer: "cus_nonexistent",
        amount_paid: 2990,
      };

      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: "invoice.paid",
        data: {
          object: mockInvoice,
        },
      });

      const req = {
        headers: {
          "stripe-signature": "test-signature",
        },
        rawBody: Buffer.from("test-body"),
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      } as unknown as Response;

      // Act
      await stripeWebhook(req, res);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ received: true });
      // Should handle gracefully without crashing
    });

    it("deve lidar com falha ao buscar subscription do Stripe", async () => {
      // Arrange
      const mockSession = {
        id: "cs_test_edge",
        customer: testCustomerId,
        subscription: testSubscriptionId,
        metadata: {
          userId: testUserId,
          plan: "premium",
          billingCycle: "monthly",
        },
      };

      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: mockSession,
        },
      });

      mockStripeSubscriptionsRetrieve.mockRejectedValue(new Error("Stripe API Error"));

      const req = {
        headers: {
          "stripe-signature": "test-signature",
        },
        rawBody: Buffer.from("test-body"),
      } as unknown as Request;

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        json: jest.fn(),
      } as unknown as Response;

      // Act
      await stripeWebhook(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining("Webhook Error"));
    });
  });
});
