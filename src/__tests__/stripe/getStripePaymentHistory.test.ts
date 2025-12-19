/**
 * Testes para getStripePaymentHistory Cloud Function
 * 
 * Cenários testados:
 * - Listar faturas pagas
 * - Paginação com limit
 * - Validações de autenticação e customerId
 * - Edge cases: cliente sem faturas, múltiplos status, erros da API
 */

// @ts-nocheck
import * as admin from 'firebase-admin';
import functionsTest from 'firebase-functions-test';
import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const test = functionsTest();

// Mock Stripe
const mockStripeInvoicesList = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    invoices: {
      list: mockStripeInvoicesList,
    },
  }));
});

// Set STRIPE_SECRET_KEY before importing function
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';

// Import function after mocking
import { getStripePaymentHistory } from '../../stripe-functions';

describe('🔵 Stripe Functions - getStripePaymentHistory', () => {
  let wrapped: any;
  const testUserId = 'test-user-invoices-123';
  const testCustomerId = 'cus_invoices_test';

  beforeAll(() => {
    // Firebase Admin j� inicializado no setup.ts global

    wrapped = test.wrap(getStripePaymentHistory);
  });

  afterAll(() => {
    test.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('✅ Cenários Positivos', () => {
    it('deve listar faturas do cliente com limit padrão', async () => {
      // Arrange
      const mockInvoices = {
        data: [
          {
            id: 'in_test_1',
            amount_paid: 2990, // R$ 29.90 em centavos
            currency: 'brl',
            status: 'paid',
            created: 1704067200, // 2024-01-01
            invoice_pdf: 'https://invoice.stripe.com/pdf_1',
          },
          {
            id: 'in_test_2',
            amount_paid: 4990, // R$ 49.90
            currency: 'brl',
            status: 'paid',
            created: 1701388800, // 2023-12-01
            invoice_pdf: 'https://invoice.stripe.com/pdf_2',
          },
        ],
      };

      mockStripeInvoicesList.mockResolvedValue(mockInvoices);

      const data = {
        customerId: testCustomerId,
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
      expect(result.invoices).toHaveLength(2);
      expect(result.invoices[0].id).toBe('in_test_1');
      expect(result.invoices[0].amount).toBe(29.9);
      expect(result.invoices[0].currency).toBe('brl');
      expect(result.invoices[0].status).toBe('paid');
      expect(result.invoices[0].pdfUrl).toBeDefined();
      expect(mockStripeInvoicesList).toHaveBeenCalledWith({
        customer: testCustomerId,
        limit: 10, // Default
      });
    });

    it('deve listar faturas com limit customizado', async () => {
      // Arrange
      const mockInvoices = {
        data: Array.from({ length: 20 }, (_, i) => ({
          id: `in_test_${i}`,
          amount_paid: 2990,
          currency: 'brl',
          status: 'paid',
          created: 1704067200,
          invoice_pdf: `https://invoice.stripe.com/pdf_${i}`,
        })),
      };

      mockStripeInvoicesList.mockResolvedValue(mockInvoices);

      const data = {
        customerId: testCustomerId,
        limit: 20,
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
      expect(result.invoices).toHaveLength(20);
      expect(mockStripeInvoicesList).toHaveBeenCalledWith({
        customer: testCustomerId,
        limit: 20,
      });
    });

    it('deve converter valores de centavos para reais corretamente', async () => {
      // Arrange
      const mockInvoices = {
        data: [
          {
            id: 'in_test_1',
            amount_paid: 9990, // R$ 99.90
            currency: 'brl',
            status: 'paid',
            created: 1704067200,
            invoice_pdf: 'https://invoice.stripe.com/pdf',
          },
        ],
      };

      mockStripeInvoicesList.mockResolvedValue(mockInvoices);

      const data = {
        customerId: testCustomerId,
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
      expect(result.invoices[0].amount).toBe(99.9);
    });

    it('deve incluir todas as informações da fatura', async () => {
      // Arrange
      const mockInvoices = {
        data: [
          {
            id: 'in_complete_test',
            amount_paid: 5000,
            currency: 'usd',
            status: 'paid',
            created: 1704067200,
            invoice_pdf: 'https://invoice.stripe.com/pdf_complete',
          },
        ],
      };

      mockStripeInvoicesList.mockResolvedValue(mockInvoices);

      const data = {
        customerId: testCustomerId,
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
      const invoice = result.invoices[0];
      expect(invoice).toHaveProperty('id');
      expect(invoice).toHaveProperty('amount');
      expect(invoice).toHaveProperty('currency');
      expect(invoice).toHaveProperty('status');
      expect(invoice).toHaveProperty('date');
      expect(invoice).toHaveProperty('pdfUrl');
    });
  });

  describe('❌ Cenários Negativos', () => {
    it('deve retornar erro se não autenticado', async () => {
      const data = {
        customerId: testCustomerId,
      };

      const context = { auth: undefined };

      await expect(wrapped(data, context)).rejects.toThrow(
        'User must be authenticated'
      );
    });

    it('deve retornar erro se customerId ausente', async () => {
      const data = {
        limit: 10,
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
      mockStripeInvoicesList.mockRejectedValue({
        type: 'StripeInvalidRequestError',
        message: 'No such customer: cus_invalid',
      });

      const data = {
        customerId: 'cus_invalid',
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
    it('deve retornar array vazio se cliente sem faturas', async () => {
      // Arrange
      const mockInvoices = {
        data: [],
      };

      mockStripeInvoicesList.mockResolvedValue(mockInvoices);

      const data = {
        customerId: testCustomerId,
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
      expect(result.invoices).toEqual([]);
    });

    it('deve lidar com faturas de diferentes status', async () => {
      // Arrange
      const mockInvoices = {
        data: [
          {
            id: 'in_paid',
            amount_paid: 2990,
            currency: 'brl',
            status: 'paid',
            created: 1704067200,
            invoice_pdf: 'https://invoice.stripe.com/pdf_paid',
          },
          {
            id: 'in_open',
            amount_paid: 0,
            currency: 'brl',
            status: 'open',
            created: 1704067200,
            invoice_pdf: null,
          },
          {
            id: 'in_void',
            amount_paid: 0,
            currency: 'brl',
            status: 'void',
            created: 1704067200,
            invoice_pdf: null,
          },
        ],
      };

      mockStripeInvoicesList.mockResolvedValue(mockInvoices);

      const data = {
        customerId: testCustomerId,
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
      expect(result.invoices).toHaveLength(3);
      expect(result.invoices.map(inv => inv.status)).toEqual(['paid', 'open', 'void']);
    });

    it('deve lidar com faturas sem PDF', async () => {
      // Arrange
      const mockInvoices = {
        data: [
          {
            id: 'in_no_pdf',
            amount_paid: 2990,
            currency: 'brl',
            status: 'draft',
            created: 1704067200,
            invoice_pdf: null,
          },
        ],
      };

      mockStripeInvoicesList.mockResolvedValue(mockInvoices);

      const data = {
        customerId: testCustomerId,
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
      expect(result.invoices[0].pdfUrl).toBeNull();
    });

    it('deve lidar com erro da API Stripe', async () => {
      // Arrange
      mockStripeInvoicesList.mockRejectedValue(
        new Error('Stripe API Error: Rate limit exceeded')
      );

      const data = {
        customerId: testCustomerId,
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

    it('deve lidar com limit muito grande', async () => {
      // Arrange
      const mockInvoices = {
        data: [],
      };

      mockStripeInvoicesList.mockResolvedValue(mockInvoices);

      const data = {
        customerId: testCustomerId,
        limit: 100, // Stripe tem limite de 100
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
      expect(mockStripeInvoicesList).toHaveBeenCalledWith({
        customer: testCustomerId,
        limit: 100,
      });
    });
  });
});
