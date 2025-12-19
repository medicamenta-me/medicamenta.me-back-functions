// @ts-nocheck
import * as admin from 'firebase-admin';
import functionsTest from 'firebase-functions-test';
import axios from 'axios';

const test = functionsTest();

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock functions.config() to return PagSeguro credentials
const mockConfig = {
  pagseguro: {
    email: 'test@pagseguro.com',
    token: 'test-token-123456'
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

// Import function AFTER mocking
import { suspendPagSeguroSubscription } from '../../pagseguro-functions';

describe('suspendPagSeguroSubscription', () => {
  let wrapped: any;
  const testCode = 'ABC123';

  beforeAll(() => {
    // Firebase Admin j� inicializado no setup.ts global
    wrapped = test.wrap(suspendPagSeguroSubscription);
  });

  afterAll(() => {
    test.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // CENÁRIOS POSITIVOS
  // ==========================================

  describe('Cenários Positivos', () => {
    it('should successfully suspend subscription', async () => {
      mockedAxios.put.mockResolvedValue({
        data: { success: true }
      });

      const result = await wrapped(
        { subscriptionCode: testCode },
        { auth: { uid: 'user123' } }
      );

      expect(result).toEqual({ success: true, message: 'Subscription suspended' });
      expect(mockedAxios.put).toHaveBeenCalledTimes(1);
    });

    it('should call correct PagSeguro API endpoint with credentials', async () => {
      mockedAxios.put.mockResolvedValue({
        data: { success: true }
      });

      await wrapped(
        { subscriptionCode: testCode },
        { auth: { uid: 'user123' } }
      );

      const expectedUrl = `https://ws.sandbox.pagseguro.uol.com.br/v2/pre-approvals/${testCode}/suspend?email=${mockConfig.pagseguro.email}&token=${mockConfig.pagseguro.token}`;
      expect(mockedAxios.put).toHaveBeenCalledWith(expectedUrl);
    });

    it('should return success message', async () => {
      mockedAxios.put.mockResolvedValue({
        data: { success: true }
      });

      const result = await wrapped(
        { subscriptionCode: testCode },
        { auth: { uid: 'user123' } }
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Subscription suspended');
    });
  });

  // ==========================================
  // CENÁRIOS NEGATIVOS
  // ==========================================

  describe('Cenários Negativos', () => {
    it('should throw error if user not authenticated', async () => {
      await expect(
        wrapped({ subscriptionCode: testCode }, {})
      ).rejects.toThrow('User must be authenticated');
    });

    it('should throw error if subscriptionCode is missing', async () => {
      await expect(
        wrapped({ }, { auth: { uid: 'user123' } })
      ).rejects.toThrow('Missing subscriptionCode');
    });

    it('should throw error if subscriptionCode is empty', async () => {
      await expect(
        wrapped({ subscriptionCode: '' }, { auth: { uid: 'user123' } })
      ).rejects.toThrow('Missing subscriptionCode');
    });

    it('should throw error if PagSeguro API fails', async () => {
      mockedAxios.put.mockRejectedValue(new Error('API Error'));

      await expect(
        wrapped({ subscriptionCode: testCode }, { auth: { uid: 'user123' } })
      ).rejects.toThrow('API Error');
    });
  });

  // ==========================================
  // EDGE CASES
  // ==========================================

  describe('Edge Cases', () => {
    it('should handle subscription not found (404)', async () => {
      const error = new Error('Not found');
      error.response = { status: 404 };
      mockedAxios.put.mockRejectedValue(error);

      await expect(
        wrapped({ subscriptionCode: 'INVALID' }, { auth: { uid: 'user123' } })
      ).rejects.toThrow();
    });

    it('should handle already suspended subscription (400)', async () => {
      const error = new Error('Subscription already suspended');
      error.response = { status: 400 };
      mockedAxios.put.mockRejectedValue(error);

      await expect(
        wrapped({ subscriptionCode: testCode }, { auth: { uid: 'user123' } })
      ).rejects.toThrow();
    });

    it('should handle network timeout', async () => {
      mockedAxios.put.mockRejectedValue(new Error('ETIMEDOUT'));

      await expect(
        wrapped({ subscriptionCode: testCode }, { auth: { uid: 'user123' } })
      ).rejects.toThrow('ETIMEDOUT');
    });

    it('should handle unauthorized (401)', async () => {
      const error = new Error('Unauthorized');
      error.response = { status: 401 };
      mockedAxios.put.mockRejectedValue(error);

      await expect(
        wrapped({ subscriptionCode: testCode }, { auth: { uid: 'user123' } })
      ).rejects.toThrow('Unauthorized');
    });
  });
});
