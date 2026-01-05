// @ts-nocheck
import * as admin from "firebase-admin";
import functionsTest from "firebase-functions-test";
import axios from "axios";
import xml2js from "xml2js";

const test = functionsTest();

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock xml2js
jest.mock("xml2js");

// Mock functions.config() to return PagSeguro credentials
const mockConfig = {
  pagseguro: {
    email: "test@pagseguro.com",
    token: "test_token_123"
  }
};

jest.mock("firebase-functions", () => {
  const actual = jest.requireActual("firebase-functions");
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
import { getPagSeguroTransactionHistory } from "../../pagseguro-functions";

describe("getPagSeguroTransactionHistory", () => {
  let wrapped: any;
  const testEmail = "customer@example.com";

  beforeAll(() => {
    // Firebase Admin j� inicializado no setup.ts global
    wrapped = test.wrap(getPagSeguroTransactionHistory);
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

  describe("Cenários Positivos", () => {
    it("should successfully fetch transaction history", async () => {
      const mockXmlResponse = "<xml>transactions</xml>";
      mockedAxios.get.mockResolvedValue({
        data: mockXmlResponse
      });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          transactionSearchResult: {
            transactions: [
              {
                transaction: [
                  {
                    code: ["ABC123"],
                    reference: ["REF123"],
                    type: ["1"],
                    status: ["3"],
                    date: ["2024-01-15T10:30:00"],
                    lastEventDate: ["2024-01-15T10:30:00"],
                    grossAmount: ["100.00"],
                    netAmount: ["95.00"],
                    paymentMethod: [
                      {
                        type: ["1"],
                        code: ["101"]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      const result = await wrapped(
        { email: testEmail, days: 30 },
        { auth: { uid: "user123" } }
      );

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].code).toBe("ABC123");
      expect(result.transactions[0].grossAmount).toBe(100.00);
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("should return all required transaction fields", async () => {
      const mockXmlResponse = "<xml>transactions</xml>";
      mockedAxios.get.mockResolvedValue({
        data: mockXmlResponse
      });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          transactionSearchResult: {
            transactions: [
              {
                transaction: [
                  {
                    code: ["TXN456"],
                    reference: ["REF456"],
                    type: ["2"],
                    status: ["4"],
                    date: ["2024-01-20T14:00:00"],
                    lastEventDate: ["2024-01-20T14:00:00"],
                    grossAmount: ["250.50"],
                    netAmount: ["240.00"],
                    paymentMethod: [
                      {
                        type: ["2"],
                        code: ["201"]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      const result = await wrapped(
        { email: testEmail, days: 7 },
        { auth: { uid: "user123" } }
      );

      const transaction = result.transactions[0];
      expect(transaction).toHaveProperty("code");
      expect(transaction).toHaveProperty("reference");
      expect(transaction).toHaveProperty("type");
      expect(transaction).toHaveProperty("status");
      expect(transaction).toHaveProperty("date");
      expect(transaction).toHaveProperty("lastEventDate");
      expect(transaction).toHaveProperty("grossAmount");
      expect(transaction).toHaveProperty("netAmount");
      expect(transaction).toHaveProperty("paymentMethod");
      expect(transaction.paymentMethod).toHaveProperty("type");
      expect(transaction.paymentMethod).toHaveProperty("code");
    });

    it("should use default days parameter (30) when not provided", async () => {
      const mockXmlResponse = "<xml>transactions</xml>";
      mockedAxios.get.mockResolvedValue({
        data: mockXmlResponse
      });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          transactionSearchResult: {
            transactions: [{ transaction: [] }]
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await wrapped(
        { email: testEmail },
        { auth: { uid: "user123" } }
      );

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const callUrl = mockedAxios.get.mock.calls[0][0];
      expect(callUrl).toContain("initialDate=");
      expect(callUrl).toContain("finalDate=");
    });
  });

  // ==========================================
  // CENÁRIOS NEGATIVOS
  // ==========================================

  describe("Cenários Negativos", () => {
    it("should throw error if user not authenticated", async () => {
      await expect(
        wrapped({ email: testEmail }, {})
      ).rejects.toThrow("User must be authenticated");
    });

    it("should throw error if email is missing", async () => {
      await expect(
        wrapped({ days: 30 }, { auth: { uid: "user123" } })
      ).rejects.toThrow("Missing email");
    });

    it("should throw error if PagSeguro API fails", async () => {
      mockedAxios.get.mockRejectedValue(new Error("API Error"));

      await expect(
        wrapped({ email: testEmail }, { auth: { uid: "user123" } })
      ).rejects.toThrow("API Error");
    });
  });

  // ==========================================
  // EDGE CASES
  // ==========================================

  describe("Edge Cases", () => {
    it("should handle empty transaction history", async () => {
      const mockXmlResponse = "<xml>no transactions</xml>";
      mockedAxios.get.mockResolvedValue({
        data: mockXmlResponse
      });

      const mockParser = {
        parseStringPromise: jest.fn().mockResolvedValue({
          transactionSearchResult: {
            transactions: [{ transaction: [] }]
          }
        })
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      const result = await wrapped(
        { email: testEmail, days: 30 },
        { auth: { uid: "user123" } }
      );

      expect(result.transactions).toEqual([]);
    });

    it("should handle invalid XML parsing error", async () => {
      mockedAxios.get.mockResolvedValue({
        data: "invalid xml"
      });

      const mockParser = {
        parseStringPromise: jest.fn().mockRejectedValue(new Error("XML parsing error"))
      };

      (xml2js.Parser as jest.Mock).mockImplementation(() => mockParser);

      await expect(
        wrapped({ email: testEmail }, { auth: { uid: "user123" } })
      ).rejects.toThrow("XML parsing error");
    });

    it("should handle network timeout", async () => {
      mockedAxios.get.mockRejectedValue(new Error("ETIMEDOUT"));

      await expect(
        wrapped({ email: testEmail }, { auth: { uid: "user123" } })
      ).rejects.toThrow("ETIMEDOUT");
    });

    it("should handle unauthorized (401)", async () => {
      const error = new Error("Unauthorized");
      error.response = { status: 401 };
      mockedAxios.get.mockRejectedValue(error);

      await expect(
        wrapped({ email: testEmail }, { auth: { uid: "user123" } })
      ).rejects.toThrow("Unauthorized");
    });
  });
});
