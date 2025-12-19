/**
 * Testes para createStripeCustomerPortal Cloud Function
 * 
 * Cenários testados:
 * - Criar sessão do customer portal
 * - Validações de autenticação e customerId
 * - Edge cases: return URL customizada, erros da API
 */

// @ts-nocheck
import * as admin from 'firebase-admin';
import functionsTest from 'firebase-functions-test';
import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const test = functionsTest();

// Mock Stripe
const mockStripeBillingPortalSessionsCreate = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    billingPortal: {
      sessions: {
        create: mockStripeBillingPortalSessionsCreate,
      },
    },
  }));
});

// Set STRIPE_SECRET_KEY before importing function
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';

// Import function after mocking
import { createStripeCustomerPortal } from '../../stripe-functions';

describe('🔵 Stripe Functions - createStripeCustomerPortal', () => {
  let wrapped: any;
  const testUserId = 'test-user-portal-123';
  const testCustomerId = 'cus_portal_test';
  const testReturnUrl = 'https://medicamenta.me/settings';

  beforeAll(() => {
    // Firebase Admin j� inicializado no setup.ts global

    wrapped = test.wrap(createStripeCustomerPortal);
  });

  afterAll(() => {
    test.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('✅ Cenários Positivos', () => {
    it('deve criar sessão do customer portal', async () => {
      // Arrange
      const mockSession = {
        id: 'bps_test_123',
        url: 'https://billing.stripe.com/session/test_123',
        customer: testCustomerId,
        return_url: testReturnUrl,
      };

      mockStripeBillingPortalSessionsCreate.mockResolvedValue(mockSession);

      const data = {
        customerId: testCustomerId,
        returnUrl: testReturnUrl,
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
      expect(result.url).toBe(mockSession.url);
      expect(mockStripeBillingPortalSessionsCreate).toHaveBeenCalledWith({
        customer: testCustomerId,
        return_url: testReturnUrl,
      });
    });

    it('deve criar sessão com returnUrl padrão', async () => {
      // Arrange
      const mockSession = {
        id: 'bps_test_456',
        url: 'https://billing.stripe.com/session/test_456',
        customer: testCustomerId,
      };

      mockStripeBillingPortalSessionsCreate.mockResolvedValue(mockSession);

      const data = {
        customerId: testCustomerId,
        // returnUrl omitted - should use default or undefined
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
      expect(result.url).toBeDefined();
      expect(mockStripeBillingPortalSessionsCreate).toHaveBeenCalled();
    });

    it('deve retornar URL válida do portal', async () => {
      // Arrange
      const mockSession = {
        url: 'https://billing.stripe.com/p/session_abcd1234',
      };

      mockStripeBillingPortalSessionsCreate.mockResolvedValue(mockSession);

      const data = {
        customerId: testCustomerId,
        returnUrl: testReturnUrl,
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
      expect(result.url).toMatch(/^https:\/\/billing\.stripe\.com/);
    });
  });

  describe('❌ Cenários Negativos', () => {
    it('deve retornar erro se não autenticado', async () => {
      const data = {
        customerId: testCustomerId,
        returnUrl: testReturnUrl,
      };

      const context = { auth: undefined };

      await expect(wrapped(data, context)).rejects.toThrow(
        'User must be authenticated'
      );
    });

    it('deve retornar erro se customerId ausente', async () => {
      const data = {
        returnUrl: testReturnUrl,
      };

      const context = {
        auth: {
          uid: testUserId,
          token: { email: 'test@example.com' },
        },
      };

      await expect(wrapped(data, context)).rejects.toThrow(
        'Missing customerId'
      );
    });

    it('deve retornar erro se customer não encontrado', async () => {
      // Arrange
      mockStripeBillingPortalSessionsCreate.mockRejectedValue({
        type: 'StripeInvalidRequestError',
        message: 'No such customer: cus_invalid',
      });

      const data = {
        customerId: 'cus_invalid',
        returnUrl: testReturnUrl,
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
    it('deve lidar com erro da API Stripe', async () => {
      // Arrange
      mockStripeBillingPortalSessionsCreate.mockRejectedValue(
        new Error('Stripe API Error: Service temporarily unavailable')
      );

      const data = {
        customerId: testCustomerId,
        returnUrl: testReturnUrl,
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

    it('deve lidar com returnUrl com caracteres especiais', async () => {
      // Arrange
      const specialReturnUrl = 'https://medicamenta.me/settings?user=test&lang=pt-BR';
      const mockSession = {
        url: 'https://billing.stripe.com/session/special',
      };

      mockStripeBillingPortalSessionsCreate.mockResolvedValue(mockSession);

      const data = {
        customerId: testCustomerId,
        returnUrl: specialReturnUrl,
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
      expect(result.url).toBeDefined();
      expect(mockStripeBillingPortalSessionsCreate).toHaveBeenCalledWith({
        customer: testCustomerId,
        return_url: specialReturnUrl,
      });
    });

    it('deve lidar com customer sem subscription ativa', async () => {
      // Arrange
      const mockSession = {
        url: 'https://billing.stripe.com/session/no_sub',
      };

      mockStripeBillingPortalSessionsCreate.mockResolvedValue(mockSession);

      const data = {
        customerId: testCustomerId,
        returnUrl: testReturnUrl,
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
      // Stripe deve permitir acesso ao portal mesmo sem subscription
      expect(result.url).toBeDefined();
    });
  });
});
