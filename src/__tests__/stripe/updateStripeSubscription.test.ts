/**
 * Testes para updateStripeSubscription Cloud Function
 * 
 * Cenários testados:
 * - Positivos: Upgrade de plano, downgrade de plano, mudança de billing cycle
 * - Negativos: Validações de autenticação e campos obrigatórios
 * - Edge Cases: Subscription inexistente, priceId inválido, proration
 */

// @ts-nocheck
import * as admin from 'firebase-admin';
import functionsTest from 'firebase-functions-test';
import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const test = functionsTest();

// Mock Stripe
const mockStripeSubscriptionsRetrieve = jest.fn();
const mockStripeSubscriptionsUpdate = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    subscriptions: {
      retrieve: mockStripeSubscriptionsRetrieve,
      update: mockStripeSubscriptionsUpdate,
    },
  }));
});

// Set STRIPE_SECRET_KEY before importing function (initializes Stripe SDK)
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';

// Import function after mocking
import { updateStripeSubscription } from '../../stripe-functions';

describe('🔵 Stripe Functions - updateStripeSubscription', () => {
  let wrapped: any;
  const testSubscriptionId = 'sub_test_update_123';
  const testPriceIdBasic = 'price_test_basic';
  const testPriceIdPremium = 'price_test_premium';
  
  beforeAll(() => {
    // Firebase Admin j� inicializado no setup.ts global
    wrapped = test.wrap(updateStripeSubscription);
  });

  afterAll(async () => {
    test.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('✅ Cenários Positivos', () => {
    it('deve fazer upgrade de plano (Basic → Premium)', async () => {
      const mockSubscription = {
        id: testSubscriptionId,
        items: {
          data: [
            {
              id: 'si_test_item_123',
              price: { id: testPriceIdBasic },
            },
          ],
        },
      };

      const mockUpdatedSubscription = {
        id: testSubscriptionId,
        status: 'active',
        current_period_end: 1706745599,
      };

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockStripeSubscriptionsUpdate.mockResolvedValue(mockUpdatedSubscription);

      const result = await wrapped(
        {
          subscriptionId: testSubscriptionId,
          newPriceId: testPriceIdPremium,
        },
        { auth: { uid: 'test-user-123' } }
      );

      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith(testSubscriptionId);
      expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(testSubscriptionId, {
        items: [
          {
            id: 'si_test_item_123',
            price: testPriceIdPremium,
          },
        ],
        proration_behavior: 'always_invoice',
      });
      expect(result.subscriptionId).toBe(testSubscriptionId);
      expect(result.newPrice).toBe(testPriceIdPremium);
      expect(result.status).toBe('active');
      expect(result.currentPeriodEnd).toBe(1706745599);
    });

    it('deve fazer downgrade de plano (Premium → Basic)', async () => {
      const mockSubscription = {
        id: testSubscriptionId,
        items: {
          data: [
            {
              id: 'si_test_item_456',
              price: { id: testPriceIdPremium },
            },
          ],
        },
      };

      const mockUpdatedSubscription = {
        id: testSubscriptionId,
        status: 'active',
        current_period_end: 1706745599,
      };

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockStripeSubscriptionsUpdate.mockResolvedValue(mockUpdatedSubscription);

      const result = await wrapped(
        {
          subscriptionId: testSubscriptionId,
          newPriceId: testPriceIdBasic,
        },
        { auth: { uid: 'test-user-123' } }
      );

      expect(result.newPrice).toBe(testPriceIdBasic);
    });

    it('deve aplicar proration_behavior corretamente', async () => {
      const mockSubscription = {
        id: testSubscriptionId,
        items: {
          data: [
            {
              id: 'si_test_item_789',
              price: { id: testPriceIdBasic },
            },
          ],
        },
      };

      const mockUpdatedSubscription = {
        id: testSubscriptionId,
        status: 'active',
        current_period_end: 1706745599,
      };

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockStripeSubscriptionsUpdate.mockResolvedValue(mockUpdatedSubscription);

      await wrapped(
        {
          subscriptionId: testSubscriptionId,
          newPriceId: testPriceIdPremium,
        },
        { auth: { uid: 'test-user-123' } }
      );

      expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
        testSubscriptionId,
        expect.objectContaining({
          proration_behavior: 'always_invoice',
        })
      );
    });
  });

  describe('❌ Cenários Negativos', () => {
    it('deve retornar erro se não autenticado', async () => {
      await expect(
        wrapped(
          {
            subscriptionId: testSubscriptionId,
            newPriceId: testPriceIdPremium,
          },
          { auth: null }
        )
      ).rejects.toThrow('User must be authenticated');
    });

    it('deve retornar erro se subscriptionId ausente', async () => {
      await expect(
        wrapped(
          {
            newPriceId: testPriceIdPremium,
          },
          { auth: { uid: 'test-user-123' } }
        )
      ).rejects.toThrow('Missing required fields');
    });

    it('deve retornar erro se newPriceId ausente', async () => {
      await expect(
        wrapped(
          {
            subscriptionId: testSubscriptionId,
          },
          { auth: { uid: 'test-user-123' } }
        )
      ).rejects.toThrow('Missing required fields');
    });

    it('deve retornar erro se ambos os campos ausentes', async () => {
      await expect(
        wrapped({}, { auth: { uid: 'test-user-123' } })
      ).rejects.toThrow('Missing required fields');
    });

    it('deve retornar erro se subscription não existe', async () => {
      mockStripeSubscriptionsRetrieve.mockRejectedValue(
        new Error('Stripe API Error: No such subscription')
      );

      await expect(
        wrapped(
          {
            subscriptionId: 'sub_invalid',
            newPriceId: testPriceIdPremium,
          },
          { auth: { uid: 'test-user-123' } }
        )
      ).rejects.toThrow();
    });

    it('deve retornar erro se priceId inválido', async () => {
      const mockSubscription = {
        id: testSubscriptionId,
        items: {
          data: [
            {
              id: 'si_test_item_abc',
              price: { id: testPriceIdBasic },
            },
          ],
        },
      };

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockStripeSubscriptionsUpdate.mockRejectedValue(
        new Error('Stripe API Error: No such price')
      );

      await expect(
        wrapped(
          {
            subscriptionId: testSubscriptionId,
            newPriceId: 'price_invalid',
          },
          { auth: { uid: 'test-user-123' } }
        )
      ).rejects.toThrow();
    });
  });

  describe('⚠️ Edge Cases', () => {
    it('deve lidar com subscription com múltiplos items (usar primeiro)', async () => {
      const mockSubscription = {
        id: testSubscriptionId,
        items: {
          data: [
            {
              id: 'si_test_item_first',
              price: { id: testPriceIdBasic },
            },
            {
              id: 'si_test_item_second',
              price: { id: 'price_addon' },
            },
          ],
        },
      };

      const mockUpdatedSubscription = {
        id: testSubscriptionId,
        status: 'active',
        current_period_end: 1706745599,
      };

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockStripeSubscriptionsUpdate.mockResolvedValue(mockUpdatedSubscription);

      await wrapped(
        {
          subscriptionId: testSubscriptionId,
          newPriceId: testPriceIdPremium,
        },
        { auth: { uid: 'test-user-123' } }
      );

      expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
        testSubscriptionId,
        expect.objectContaining({
          items: [
            {
              id: 'si_test_item_first', // Should use first item
              price: testPriceIdPremium,
            },
          ],
        })
      );
    });

    it('deve lidar com subscription já usando o mesmo priceId', async () => {
      const mockSubscription = {
        id: testSubscriptionId,
        items: {
          data: [
            {
              id: 'si_test_item_same',
              price: { id: testPriceIdPremium },
            },
          ],
        },
      };

      const mockUpdatedSubscription = {
        id: testSubscriptionId,
        status: 'active',
        current_period_end: 1706745599,
      };

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockStripeSubscriptionsUpdate.mockResolvedValue(mockUpdatedSubscription);

      const result = await wrapped(
        {
          subscriptionId: testSubscriptionId,
          newPriceId: testPriceIdPremium, // Same as current
        },
        { auth: { uid: 'test-user-123' } }
      );

      expect(result.newPrice).toBe(testPriceIdPremium);
    });

    it('deve lidar com subscription cancelada (status=canceled)', async () => {
      const mockSubscription = {
        id: testSubscriptionId,
        items: {
          data: [
            {
              id: 'si_test_item_canceled',
              price: { id: testPriceIdBasic },
            },
          ],
        },
      };

      const mockUpdatedSubscription = {
        id: testSubscriptionId,
        status: 'canceled',
        current_period_end: 1706745599,
      };

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);
      mockStripeSubscriptionsUpdate.mockResolvedValue(mockUpdatedSubscription);

      const result = await wrapped(
        {
          subscriptionId: testSubscriptionId,
          newPriceId: testPriceIdPremium,
        },
        { auth: { uid: 'test-user-123' } }
      );

      expect(result.status).toBe('canceled');
    });
  });
});
