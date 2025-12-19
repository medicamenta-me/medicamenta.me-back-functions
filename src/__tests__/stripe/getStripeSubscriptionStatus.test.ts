/**
 * Testes para getStripeSubscriptionStatus Cloud Function
 * 
 * Cenários testados:
 * - Obter status de subscription ativa
 * - Validações de autenticação e subscriptionId
 * - Edge cases: subscription cancelada, pausada, erros da API
 */

// @ts-nocheck
import * as admin from 'firebase-admin';
import functionsTest from 'firebase-functions-test';
import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const test = functionsTest();

// Mock Stripe
const mockStripeSubscriptionsRetrieve = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    subscriptions: {
      retrieve: mockStripeSubscriptionsRetrieve,
    },
  }));
});

// Set STRIPE_SECRET_KEY before importing function
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';

// Import function after mocking
import { getStripeSubscriptionStatus } from '../../stripe-functions';

describe('🔵 Stripe Functions - getStripeSubscriptionStatus', () => {
  let wrapped: any;
  const testUserId = 'test-user-status-123';
  const testSubscriptionId = 'sub_status_test';
  const testCustomerId = 'cus_status_test';

  beforeAll(() => {
    // Firebase Admin j� inicializado no setup.ts global

    wrapped = test.wrap(getStripeSubscriptionStatus);
  });

  afterAll(() => {
    test.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('✅ Cenários Positivos', () => {
    it('deve retornar status de subscription ativa', async () => {
      // Arrange
      const mockSubscription = {
        id: testSubscriptionId,
        customer: testCustomerId,
        status: 'active',
        current_period_end: 1735689600, // 2025-01-01
        cancel_at_period_end: false,
      };

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const data = {
        subscriptionId: testSubscriptionId,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result.status).toBe('active');
      expect(result.subscriptionId).toBe(testSubscriptionId);
      expect(result.customerId).toBe(testCustomerId);
      expect(result.currentPeriodEnd).toBe(1735689600);
      expect(result.cancelAtPeriodEnd).toBe(false);
      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith(testSubscriptionId);
    });

    it('deve retornar status trialing', async () => {
      // Arrange
      const mockSubscription = {
        id: testSubscriptionId,
        customer: testCustomerId,
        status: 'trialing',
        current_period_end: 1735689600,
        cancel_at_period_end: false,
      };

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const data = {
        subscriptionId: testSubscriptionId,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result.status).toBe('trial'); // mapStripeStatus converts 'trialing' → 'trial'
      expect(result.cancelAtPeriodEnd).toBe(false);
    });

    it('deve retornar subscription marcada para cancelamento', async () => {
      // Arrange
      const mockSubscription = {
        id: testSubscriptionId,
        customer: testCustomerId,
        status: 'active',
        current_period_end: 1735689600,
        cancel_at_period_end: true, // Marcada para cancelar
      };

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const data = {
        subscriptionId: testSubscriptionId,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result.status).toBe('active');
      expect(result.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('❌ Cenários Negativos', () => {
    it('deve retornar erro se não autenticado', async () => {
      const data = {
        subscriptionId: testSubscriptionId,
      };

      const context = { auth: undefined };

      await expect(wrapped(data, context)).rejects.toThrow(
        'User must be authenticated'
      );
    });

    it('deve retornar erro se subscriptionId ausente', async () => {
      const data = {};

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      await expect(wrapped(data, context)).rejects.toThrow(
        'Missing subscriptionId'
      );
    });

    it('deve retornar erro se subscription não encontrada', async () => {
      // Arrange
      mockStripeSubscriptionsRetrieve.mockRejectedValue({
        type: 'StripeInvalidRequestError',
        message: 'No such subscription: sub_invalid',
      });

      const data = {
        subscriptionId: 'sub_invalid',
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act & Assert
      await expect(wrapped(data, context)).rejects.toThrow();
    });
  });

  describe('⚠️ Edge Cases', () => {
    it('deve lidar com subscription cancelada', async () => {
      // Arrange
      const mockSubscription = {
        id: testSubscriptionId,
        customer: testCustomerId,
        status: 'canceled',
        current_period_end: 1735689600,
        cancel_at_period_end: false,
      };

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const data = {
        subscriptionId: testSubscriptionId,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result.status).toBe('canceled');
    });

    it('deve lidar com subscription past_due', async () => {
      // Arrange
      const mockSubscription = {
        id: testSubscriptionId,
        customer: testCustomerId,
        status: 'past_due',
        current_period_end: 1735689600,
        cancel_at_period_end: false,
      };

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const data = {
        subscriptionId: testSubscriptionId,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result.status).toBe('past_due');
    });

    it('deve lidar com erro da API Stripe', async () => {
      // Arrange
      mockStripeSubscriptionsRetrieve.mockRejectedValue(
        new Error('Stripe API Error: Service unavailable')
      );

      const data = {
        subscriptionId: testSubscriptionId,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      // Act & Assert
      await expect(wrapped(data, context)).rejects.toThrow();
    });
  });
});
