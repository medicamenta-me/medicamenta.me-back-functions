/**
 * Testes para cancelStripeSubscription e reactivateStripeSubscription
 * 
 * Cenários testados:
 * - Cancelamento: cancel_at_period_end
 * - Reativação: cancelar cancel_at_period_end
 * - Validações de autenticação e parâmetros
 */

// @ts-nocheck
import * as admin from 'firebase-admin';
import functionsTest from 'firebase-functions-test';
import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const test = functionsTest();

// Mock Stripe
const mockStripeSubscriptionsUpdate = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    subscriptions: {
      update: mockStripeSubscriptionsUpdate,
    },
  }));
});

// Set STRIPE_SECRET_KEY before importing function (initializes Stripe SDK)
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';

import { cancelStripeSubscription, reactivateStripeSubscription } from '../../stripe-functions';

describe('🔵 Stripe Functions - Cancel/Reactivate', () => {
  let wrappedCancel: any;
  let wrappedReactivate: any;
  const testUserId = 'test-user-cancel-123';
  const testSubscriptionId = 'sub_test_cancel_123';
  
  beforeAll(() => {
    // Firebase Admin j� inicializado no setup.ts global
    
    wrappedCancel = test.wrap(cancelStripeSubscription);
    wrappedReactivate = test.wrap(reactivateStripeSubscription);
  });

  afterAll(() => {
    test.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cancelStripeSubscription', () => {
    describe('✅ Cenários Positivos', () => {
      it('deve cancelar subscription com cancel_at_period_end', async () => {
        // Arrange
        mockStripeSubscriptionsUpdate.mockResolvedValue({
          id: testSubscriptionId,
          cancel_at_period_end: true,
        });

        const data = {
          subscriptionId: testSubscriptionId,
        };

        const context = {
          auth: {
            uid: testUserId,
            token: {
              email: 'test@example.com',
            },
          },
        };

        // Act
        const result = await wrappedCancel(data, context);

        // Assert
        expect(result.success).toBe(true);
        expect(result.message).toContain('canceled at period end');
        expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
          testSubscriptionId,
          { cancel_at_period_end: true }
        );
      });
    });

    describe('❌ Cenários Negativos', () => {
      it('deve retornar erro se não autenticado', async () => {
        const data = { subscriptionId: testSubscriptionId };
        const context = { auth: undefined };

        await expect(wrappedCancel(data, context)).rejects.toThrow(
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

        await expect(wrappedCancel(data, context)).rejects.toThrow(
          'Missing subscriptionId'
        );
      });

      it('deve retornar erro se Stripe API falhar', async () => {
        mockStripeSubscriptionsUpdate.mockRejectedValue(
          new Error('Stripe API Error: Invalid subscription')
        );

        const data = { subscriptionId: testSubscriptionId };
        const context = {
          auth: {
            uid: testUserId,
            token: { email: 'test@example.com' },
          },
        };

        await expect(wrappedCancel(data, context)).rejects.toThrow();
      });
    });
  });

  describe('reactivateStripeSubscription', () => {
    describe('✅ Cenários Positivos', () => {
      it('deve reativar subscription removendo cancel_at_period_end', async () => {
        // Arrange
        mockStripeSubscriptionsUpdate.mockResolvedValue({
          id: testSubscriptionId,
          cancel_at_period_end: false,
        });

        const data = {
          subscriptionId: testSubscriptionId,
        };

        const context = {
          auth: {
            uid: testUserId,
            token: {
              email: 'test@example.com',
            },
          },
        };

        // Act
        const result = await wrappedReactivate(data, context);

        // Assert
        expect(result.success).toBe(true);
        expect(result.message).toContain('reactivated');
        expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
          testSubscriptionId,
          { cancel_at_period_end: false }
        );
      });
    });

    describe('❌ Cenários Negativos', () => {
      it('deve retornar erro se não autenticado', async () => {
        const data = { subscriptionId: testSubscriptionId };
        const context = { auth: undefined };

        await expect(wrappedReactivate(data, context)).rejects.toThrow(
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

        await expect(wrappedReactivate(data, context)).rejects.toThrow(
          'Missing subscriptionId'
        );
      });

      it('deve retornar erro se Stripe API falhar', async () => {
        mockStripeSubscriptionsUpdate.mockRejectedValue(
          new Error('Stripe API Error: Subscription already active')
        );

        const data = { subscriptionId: testSubscriptionId };
        const context = {
          auth: {
            uid: testUserId,
            token: { email: 'test@example.com' },
          },
        };

        await expect(wrappedReactivate(data, context)).rejects.toThrow();
      });
    });
  });
});
