// @ts-nocheck
import * as admin from 'firebase-admin';
import functionsTest from 'firebase-functions-test';
import axios from 'axios';
import xml2js from 'xml2js';

const test = functionsTest();

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock xml2js
jest.mock('xml2js');

// Mock functions.config() to return PagSeguro credentials
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
      onRequest: actual.https.onRequest,
    },
  };
});

// Import function AFTER mocking
import { pagseguroNotification } from '../../pagseguro-functions';

describe('pagseguroNotification', () => {
  let mockFirestore: any;
  let mockCollection: any;
  let mockDoc: any;
  let mockUpdate: any;

  beforeAll(() => {
    // Firebase Admin j� inicializado no setup.ts global
  });

  afterAll(() => {
    test.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Firestore
    mockUpdate = jest.fn().mockResolvedValue(undefined);
    mockDoc = jest.fn().mockReturnValue({ update: mockUpdate });
    mockCollection = jest.fn().mockReturnValue({ doc: mockDoc });

    jest.spyOn(admin, 'firestore').mockReturnValue({
      collection: mockCollection
    } as any);
  });

  // Helper to create mock request/response
  const createMockReqRes = (body: any = {}, query: any = {}) => {
    const req = {
      body,
      query,
      get: jest.fn(),
      header: jest.fn(),
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    return { req, res };
  };

  // ==========================================
  // CENÁRIOS POSITIVOS - PRE-APPROVAL
  // ==========================================

  describe('Cenários Positivos - PreApproval', () => {
    it('should successfully process preApproval notification (active status)', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'NOTIF123',
        notificationType: 'preApproval'
      });

      const mockXmlResponse = '<xml>preapproval</xml>';
      mockedAxios.get.mockResolvedValue({ data: mockXmlResponse });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          preApproval: {
            reference: ['SUB123'],
            code: ['CODE123'],
            status: ['ACTIVE'],
            lastEventDate: ['2024-01-15T10:30:00']
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await pagseguroNotification(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('OK');
      expect(mockCollection).toHaveBeenCalledWith('subscriptions');
      expect(mockDoc).toHaveBeenCalledWith('SUB123');
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should update subscription status to active for ACTIVE status', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'NOTIF456',
        notificationType: 'preApproval'
      });

      const mockXmlResponse = '<xml>preapproval</xml>';
      mockedAxios.get.mockResolvedValue({ data: mockXmlResponse });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          preApproval: {
            reference: ['SUB456'],
            code: ['CODE456'],
            status: ['ACTIVE'],
            lastEventDate: ['2024-01-16T12:00:00']
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await pagseguroNotification(req as any, res as any);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          pagseguroCode: 'CODE456',
          status: 'active',
          lastEventDate: '2024-01-16T12:00:00'
        })
      );
    });

    it('should downgrade to free plan when subscription cancelled', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'NOTIF789',
        notificationType: 'preApproval'
      });

      const mockXmlResponse = '<xml>preapproval</xml>';
      mockedAxios.get.mockResolvedValue({ data: mockXmlResponse });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          preApproval: {
            reference: ['SUB789'],
            code: ['CODE789'],
            status: ['CANCELLED'],
            lastEventDate: ['2024-01-17T14:00:00']
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await pagseguroNotification(req as any, res as any);

      // Should be called twice: once for status update, once for plan downgrade
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'canceled'
        })
      );
      expect(mockUpdate).toHaveBeenCalledWith({
        plan: 'free'
      });
    });

    it('should map SUSPENDED status to past_due', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'NOTIF111',
        notificationType: 'preApproval'
      });

      const mockXmlResponse = '<xml>preapproval</xml>';
      mockedAxios.get.mockResolvedValue({ data: mockXmlResponse });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          preApproval: {
            reference: ['SUB111'],
            code: ['CODE111'],
            status: ['SUSPENDED'],
            lastEventDate: ['2024-01-18T09:00:00']
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await pagseguroNotification(req as any, res as any);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'past_due'
        })
      );
    });
  });

  // ==========================================
  // CENÁRIOS POSITIVOS - TRANSACTION
  // ==========================================

  describe('Cenários Positivos - Transaction', () => {
    it('should successfully process transaction notification (payment successful)', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'TXN123',
        notificationType: 'transaction'
      });

      const mockXmlResponse = '<xml>transaction</xml>';
      mockedAxios.get.mockResolvedValue({ data: mockXmlResponse });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          transaction: {
            reference: ['SUB123'],
            status: ['3'],
            grossAmount: ['99.90']
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await pagseguroNotification(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('OK');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          'currentUsage.reportsGenerated': 0,
          'currentUsage.ocrScansUsed': 0,
          'currentUsage.telehealthConsultsUsed': 0,
          lastPaymentAmount: 99.90
        })
      );
    });

    it('should reset usage counters for successful payment (status 3)', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'TXN456',
        notificationType: 'transaction'
      });

      const mockXmlResponse = '<xml>transaction</xml>';
      mockedAxios.get.mockResolvedValue({ data: mockXmlResponse });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          transaction: {
            reference: ['SUB456'],
            status: ['3'],
            grossAmount: ['149.90']
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await pagseguroNotification(req as any, res as any);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          'currentUsage.reportsGenerated': 0,
          'currentUsage.ocrScansUsed': 0,
          'currentUsage.telehealthConsultsUsed': 0
        })
      );
    });

    it('should reset usage counters for payment available (status 4)', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'TXN789',
        notificationType: 'transaction'
      });

      const mockXmlResponse = '<xml>transaction</xml>';
      mockedAxios.get.mockResolvedValue({ data: mockXmlResponse });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          transaction: {
            reference: ['SUB789'],
            status: ['4'],
            grossAmount: ['199.90']
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await pagseguroNotification(req as any, res as any);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          'currentUsage.reportsGenerated': 0,
          lastPaymentAmount: 199.90
        })
      );
    });

    it('should mark subscription as past_due for canceled payment (status 7)', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'TXN999',
        notificationType: 'transaction'
      });

      const mockXmlResponse = '<xml>transaction</xml>';
      mockedAxios.get.mockResolvedValue({ data: mockXmlResponse });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          transaction: {
            reference: ['SUB999'],
            status: ['7'],
            grossAmount: ['99.90']
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await pagseguroNotification(req as any, res as any);

      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'past_due'
      });
    });
  });

  // ==========================================
  // CENÁRIOS NEGATIVOS
  // ==========================================

  describe('Cenários Negativos', () => {
    it('should return 400 if notificationCode is missing', async () => {
      const { req, res } = createMockReqRes({
        notificationType: 'preApproval'
      });

      await pagseguroNotification(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Missing notification parameters');
    });

    it('should return 400 if notificationType is missing', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'NOTIF123'
      });

      await pagseguroNotification(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Missing notification parameters');
    });

    it('should return 400 for unknown notification type', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'NOTIF123',
        notificationType: 'unknown'
      });

      await pagseguroNotification(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Unknown notification type');
    });

    it('should return 500 if PagSeguro API fails', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'NOTIF123',
        notificationType: 'preApproval'
      });

      mockedAxios.get.mockRejectedValue(new Error('API Error'));

      await pagseguroNotification(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Error processing notification');
    });

    it('should return 500 if Firestore update fails', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'NOTIF123',
        notificationType: 'preApproval'
      });

      const mockXmlResponse = '<xml>preapproval</xml>';
      mockedAxios.get.mockResolvedValue({ data: mockXmlResponse });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          preApproval: {
            reference: ['SUB123'],
            code: ['CODE123'],
            status: ['ACTIVE'],
            lastEventDate: ['2024-01-15T10:30:00']
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      // Mock Firestore update to fail
      mockUpdate.mockRejectedValue(new Error('Firestore Error'));

      await pagseguroNotification(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Error processing notification');
    });
  });

  // ==========================================
  // EDGE CASES
  // ==========================================

  describe('Edge Cases', () => {
    it('should accept notification from query parameters', async () => {
      const { req, res } = createMockReqRes({}, {
        notificationCode: 'NOTIF123',
        notificationType: 'preApproval'
      });

      const mockXmlResponse = '<xml>preapproval</xml>';
      mockedAxios.get.mockResolvedValue({ data: mockXmlResponse });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          preApproval: {
            reference: ['SUB123'],
            code: ['CODE123'],
            status: ['ACTIVE'],
            lastEventDate: ['2024-01-15T10:30:00']
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await pagseguroNotification(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('OK');
    });

    it('should handle invalid XML parsing error', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'NOTIF123',
        notificationType: 'preApproval'
      });

      mockedAxios.get.mockResolvedValue({ data: 'invalid xml' });

      const mockParser = {
        parseStringPromise: jest.fn().mockRejectedValue(new Error('XML parsing error'))
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await pagseguroNotification(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should handle network timeout', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'NOTIF123',
        notificationType: 'transaction'
      });

      mockedAxios.get.mockRejectedValue(new Error('ETIMEDOUT'));

      await pagseguroNotification(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith('Error processing notification');
    });

    it('should handle EXPIRED preApproval status', async () => {
      const { req, res } = createMockReqRes({
        notificationCode: 'NOTIF222',
        notificationType: 'preApproval'
      });

      const mockXmlResponse = '<xml>preapproval</xml>';
      mockedAxios.get.mockResolvedValue({ data: mockXmlResponse });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          preApproval: {
            reference: ['SUB222'],
            code: ['CODE222'],
            status: ['EXPIRED'],
            lastEventDate: ['2024-01-20T10:00:00']
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await pagseguroNotification(req as any, res as any);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'canceled'
        })
      );
    });
  });
});
