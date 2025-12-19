/**
 * Testes para getPagSeguroSubscriptionStatus Cloud Function
 * 
 * Cenários: Buscar status de assinatura, validações, edge cases
 */

// @ts-nocheck
import * as admin from 'firebase-admin';
import functionsTest from 'firebase-functions-test';
import { describe, expect, it, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import axios from 'axios';
import xml2js from 'xml2js';

const test = functionsTest();

jest.mock('axios');
jest.mock('xml2js');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockConfig = {
  pagseguro: {
    email: 'test@pagseguro.com',
    token: 'test_token_123'
  }
};

jest.mock('firebase-functions', () => {
  const actual = jest.requireActual('firebase-functions');
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

import { getPagSeguroSubscriptionStatus } from '../../pagseguro-functions';

describe('🟣 PagSeguro Functions - getPagSeguroSubscriptionStatus', () => {
  let wrapped: any;
  const testSubscriptionCode = 'SUB123456789';
  
  beforeAll(() => {
    // Firebase Admin j� inicializado no setup.ts global
    wrapped = test.wrap(getPagSeguroSubscriptionStatus);
  });

  afterAll(() => test.cleanup());
  beforeEach(() => jest.clearAllMocks());

  describe('✅ Cenários Positivos', () => {
    it('deve buscar status da assinatura com sucesso', async () => {
      const mockXmlResponse = `<preApproval>
        <status>ACTIVE</status>
        <code>${testSubscriptionCode}</code>
        <reference>REF123</reference>
        <lastEventDate>2024-01-15T10:30:00</lastEventDate>
        <charge>auto</charge>
      </preApproval>`;

      mockedAxios.get.mockResolvedValue({ data: mockXmlResponse });
      
      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          preApproval: {
            status: ['ACTIVE'],
            code: [testSubscriptionCode],
            reference: ['REF123'],
            lastEventDate: ['2024-01-15T10:30:00'],
            charge: ['auto']
          }
        })
      };
      
      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      const result = await wrapped(
        { subscriptionCode: testSubscriptionCode },
        { auth: { uid: 'test-user-123' } }
      );

      expect(result.status).toBe('ACTIVE');
      expect(result.code).toBe(testSubscriptionCode);
      expect(result.reference).toBe('REF123');
    });

    it('deve retornar todos os campos obrigatórios', async () => {
      const mockXmlResponse = `<preApproval>
        <status>PENDING</status>
        <code>SUB999</code>
        <reference>REF999</reference>
        <lastEventDate>2024-01-20T15:00:00</lastEventDate>
        <charge>manual</charge>
      </preApproval>`;

      mockedAxios.get.mockResolvedValue({ data: mockXmlResponse });
      
      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          preApproval: {
            status: ['PENDING'],
            code: ['SUB999'],
            reference: ['REF999'],
            lastEventDate: ['2024-01-20T15:00:00'],
            charge: ['manual']
          }
        })
      };
      
      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      const result = await wrapped(
        { subscriptionCode: 'SUB999' },
        { auth: { uid: 'test-user-456' } }
      );

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('reference');
      expect(result).toHaveProperty('lastEventDate');
      expect(result).toHaveProperty('charge');
    });
  });

  describe('❌ Cenários Negativos', () => {
    it('deve retornar erro se não autenticado', async () => {
      await expect(
        wrapped({ subscriptionCode: testSubscriptionCode }, { auth: null })
      ).rejects.toThrow('User must be authenticated');
    });

    it('deve retornar erro se subscriptionCode ausente', async () => {
      await expect(
        wrapped({}, { auth: { uid: 'test-user-123' } })
      ).rejects.toThrow('Missing subscriptionCode');
    });

    it('deve retornar erro se API PagSeguro falhar', async () => {
      mockedAxios.get.mockRejectedValue(new Error('PagSeguro API Error'));

      await expect(
        wrapped(
          { subscriptionCode: testSubscriptionCode },
          { auth: { uid: 'test-user-123' } }
        )
      ).rejects.toThrow('PagSeguro API Error');
    });
  });

  describe('⚠️ Edge Cases', () => {
    it('deve lidar com subscription não encontrada', async () => {
      mockedAxios.get.mockRejectedValue({
        response: { status: 404 }
      });

      await expect(
        wrapped({ subscriptionCode: 'SUB_INVALID' }, { auth: { uid: 'test-user-123' } })
      ).rejects.toThrow();
    });

    it('deve lidar com XML inválido', async () => {
      mockedAxios.get.mockResolvedValue({ data: 'invalid xml' });
      
      const mockParser = {
        parseStringPromise: jest.fn().mockRejectedValue(new Error('XML Parse Error'))
      };
      
      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await expect(
        wrapped({ subscriptionCode: testSubscriptionCode }, { auth: { uid: 'test-user-123' } })
      ).rejects.toThrow('XML Parse Error');
    });
  });
});
