/**
 * Testes para createStripeCheckoutSession Cloud Function
 * 
 * Cenários testados:
 * - Positivos: Criação bem-sucedida de sessão, reutilização de customer, trial
 * - Negativos: Validações de autenticação e campos obrigatórios
 * - Edge Cases: Falhas na API Stripe
 */

// @ts-nocheck
import * as admin from 'firebase-admin';
import functionsTest from 'firebase-functions-test';
import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const test = functionsTest();

// Mock Stripe
const mockStripeCustomerCreate = jest.fn();
const mockStripeCheckoutSessionCreate = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: mockStripeCustomerCreate,
    },
    checkout: {
      sessions: {
        create: mockStripeCheckoutSessionCreate,
      },
    },
  }));
});

// Set STRIPE_SECRET_KEY before importing function (initializes Stripe SDK)
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';

// Import function after mocking
import { createStripeCheckoutSession } from '../../stripe-functions';

describe('🔵 Stripe Functions - createStripeCheckoutSession', () => {
  let wrapped: any;
  const testUserId = 'test-user-123';
  const testEmail = 'test@example.com';
  const testPriceId = 'price_test_123';
  
  beforeAll(() => {
    // Initialize Firestore with emulator
    // Firebase Admin j� inicializado no setup.ts global
    
    // Wrap the function for testing
    wrapped = test.wrap(createStripeCheckoutSession);
  });

  afterAll(async () => {
    // Cleanup Firestore
    const db = admin.firestore();
    const usersSnapshot = await db.collection('users').get();
    const batch = db.batch();
    usersSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    
    // Cleanup test
    test.cleanup();
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe('✅ Cenários Positivos', () => {
    it('deve criar sessão de checkout com dados válidos', async () => {
      // Arrange
      const mockSessionId = 'cs_test_session_123';
      const mockSessionUrl = 'https://checkout.stripe.com/pay/cs_test_session_123';
      
      mockStripeCustomerCreate.mockResolvedValue({
        id: 'cus_test_123',
        email: testEmail,
      });
      
      mockStripeCheckoutSessionCreate.mockResolvedValue({
        id: mockSessionId,
        url: mockSessionUrl,
      });

      const data = {
        priceId: testPriceId,
        userId: testUserId,
        plan: 'premium',
        billingCycle: 'monthly',
        successUrl: 'https://app.medicamenta.me/success',
        cancelUrl: 'https://app.medicamenta.me/cancel',
      };

      const context = {
        auth: {
          uid: testUserId,
          token: {
            email: testEmail,
          },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result).toHaveProperty('sessionId', mockSessionId);
      expect(result).toHaveProperty('url', mockSessionUrl);
      expect(mockStripeCustomerCreate).toHaveBeenCalledWith({
        email: testEmail,
        metadata: {
          userId: testUserId,
          firebaseUid: testUserId,
        },
      });
      expect(mockStripeCheckoutSessionCreate).toHaveBeenCalled();
    });

    it('deve reutilizar customer existente', async () => {
      // Arrange
      const existingCustomerId = 'cus_existing_123';
      
      // Create user with existing Stripe customer
      await admin.firestore().collection('users').doc(testUserId).set({
        email: testEmail,
        stripeCustomerId: existingCustomerId,
      });

      mockStripeCheckoutSessionCreate.mockResolvedValue({
        id: 'cs_test_session_456',
        url: 'https://checkout.stripe.com/pay/cs_test_session_456',
      });

      const data = {
        priceId: testPriceId,
        userId: testUserId,
        plan: 'premium',
        billingCycle: 'monthly',
        successUrl: 'https://app.medicamenta.me/success',
        cancelUrl: 'https://app.medicamenta.me/cancel',
      };

      const context = {
        auth: {
          uid: testUserId,
          token: {
            email: testEmail,
          },
        },
      };

      // Act
      const result = await wrapped(data, context);

      // Assert
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('url');
      expect(mockStripeCustomerCreate).not.toHaveBeenCalled(); // Should NOT create new customer
      expect(mockStripeCheckoutSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: existingCustomerId,
        })
      );
    });

    it('deve incluir metadata correto na sessão', async () => {
      // Arrange
      mockStripeCustomerCreate.mockResolvedValue({
        id: 'cus_test_789',
        email: testEmail,
      });
      
      mockStripeCheckoutSessionCreate.mockResolvedValue({
        id: 'cs_test_session_789',
        url: 'https://checkout.stripe.com/pay/cs_test_session_789',
      });

      const data = {
        priceId: testPriceId,
        userId: testUserId,
        plan: 'family',
        billingCycle: 'yearly',
        successUrl: 'https://app.medicamenta.me/success',
        cancelUrl: 'https://app.medicamenta.me/cancel',
      };

      const context = {
        auth: {
          uid: testUserId,
          token: {
            email: testEmail,
          },
        },
      };

      // Act
      await wrapped(data, context);

      // Assert
      expect(mockStripeCheckoutSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            userId: testUserId,
            plan: 'family',
            billingCycle: 'yearly',
          },
          subscription_data: {
            metadata: {
              userId: testUserId,
              plan: 'family',
              billingCycle: 'yearly',
            },
          },
        })
      );
    });

    it('deve salvar customerId no Firestore após criação', async () => {
      // Arrange
      const newCustomerId = 'cus_new_123';
      
      mockStripeCustomerCreate.mockResolvedValue({
        id: newCustomerId,
        email: testEmail,
      });
      
      mockStripeCheckoutSessionCreate.mockResolvedValue({
        id: 'cs_test_session_abc',
        url: 'https://checkout.stripe.com/pay/cs_test_session_abc',
      });

      const data = {
        priceId: testPriceId,
        userId: 'new-user-456',
        plan: 'premium',
        billingCycle: 'monthly',
        successUrl: 'https://app.medicamenta.me/success',
        cancelUrl: 'https://app.medicamenta.me/cancel',
      };

      const context = {
        auth: {
          uid: 'new-user-456',
          token: {
            email: 'newuser@example.com',
          },
        },
      };

      // Act
      await wrapped(data, context);

      // Assert
      const userDoc = await admin.firestore().collection('users').doc('new-user-456').get();
      expect(userDoc.exists).toBe(true);
      expect(userDoc.data()?.stripeCustomerId).toBe(newCustomerId);
    });
  });

  describe('❌ Cenários Negativos', () => {
    it('deve retornar erro se usuário não autenticado', async () => {
      // Arrange
      const data = {
        priceId: testPriceId,
        userId: testUserId,
        plan: 'premium',
        billingCycle: 'monthly',
        successUrl: 'https://app.medicamenta.me/success',
        cancelUrl: 'https://app.medicamenta.me/cancel',
      };

      const context = {
        auth: undefined, // No authentication
      };

      // Act & Assert
      await expect(wrapped(data, context)).rejects.toThrow('User must be authenticated');
    });

    it('deve retornar erro se priceId ausente', async () => {
      // Arrange
      const data = {
        // priceId missing
        userId: testUserId,
        plan: 'premium',
        billingCycle: 'monthly',
        successUrl: 'https://app.medicamenta.me/success',
        cancelUrl: 'https://app.medicamenta.me/cancel',
      };

      const context = {
        auth: {
          uid: testUserId,
          token: {
            email: testEmail,
          },
        },
      };

      // Act & Assert
      await expect(wrapped(data, context)).rejects.toThrow('Missing required fields');
    });

    it('deve retornar erro se userId ausente', async () => {
      // Arrange
      const data = {
        priceId: testPriceId,
        // userId missing
        plan: 'premium',
        billingCycle: 'monthly',
        successUrl: 'https://app.medicamenta.me/success',
        cancelUrl: 'https://app.medicamenta.me/cancel',
      };

      const context = {
        auth: {
          uid: testUserId,
          token: {
            email: testEmail,
          },
        },
      };

      // Act & Assert
      await expect(wrapped(data, context)).rejects.toThrow('Missing required fields');
    });

    it('deve retornar erro se plan ausente', async () => {
      // Arrange
      const data = {
        priceId: testPriceId,
        userId: testUserId,
        // plan missing
        billingCycle: 'monthly',
        successUrl: 'https://app.medicamenta.me/success',
        cancelUrl: 'https://app.medicamenta.me/cancel',
      };

      const context = {
        auth: {
          uid: testUserId,
          token: {
            email: testEmail,
          },
        },
      };

      // Act & Assert
      await expect(wrapped(data, context)).rejects.toThrow('Missing required fields');
    });
  });

  describe('⚠️ Edge Cases', () => {
    it('deve lidar com falha na criação do customer Stripe', async () => {
      // Arrange
      mockStripeCustomerCreate.mockRejectedValue(new Error('Stripe API Error: Invalid request'));

      const data = {
        priceId: testPriceId,
        userId: 'edge-user-123',
        plan: 'premium',
        billingCycle: 'monthly',
        successUrl: 'https://app.medicamenta.me/success',
        cancelUrl: 'https://app.medicamenta.me/cancel',
      };

      const context = {
        auth: {
          uid: 'edge-user-123',
          token: {
            email: 'edge@example.com',
          },
        },
      };

      // Act & Assert
      await expect(wrapped(data, context)).rejects.toThrow();
    });

    it('deve lidar com falha na criação da sessão de checkout', async () => {
      // Arrange
      const existingCustomerId = 'cus_existing_edge_123';
      
      await admin.firestore().collection('users').doc('edge-user-456').set({
        email: 'edge2@example.com',
        stripeCustomerId: existingCustomerId,
      });

      mockStripeCheckoutSessionCreate.mockRejectedValue(
        new Error('Stripe API Error: Invalid price ID')
      );

      const data = {
        priceId: 'invalid_price_id',
        userId: 'edge-user-456',
        plan: 'premium',
        billingCycle: 'monthly',
        successUrl: 'https://app.medicamenta.me/success',
        cancelUrl: 'https://app.medicamenta.me/cancel',
      };

      const context = {
        auth: {
          uid: 'edge-user-456',
          token: {
            email: 'edge2@example.com',
          },
        },
      };

      // Act & Assert
      await expect(wrapped(data, context)).rejects.toThrow();
    });
  });
});
