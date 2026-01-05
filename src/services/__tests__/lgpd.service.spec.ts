/**
 * Tests for LGPD Compliance Service
 * Sprint H8: LGPD Compliance
 */

import {
  LGPDService,
  DEFAULT_CONSENT_PURPOSES,
  RETENTION_PERIODS,
} from "../lgpd.service";

// Mock firebase-admin
jest.mock("firebase-admin", () => {
  const mockBatch = {
    update: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };

  const mockDocRef = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };

  const mockQuerySnapshot = {
    empty: false,
    docs: [],
  };

  const mockQuery = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue(mockQuerySnapshot),
  };

  const mockCollection = jest.fn(() => ({
    doc: jest.fn(() => mockDocRef),
    where: jest.fn().mockReturnValue(mockQuery),
    orderBy: jest.fn().mockReturnValue(mockQuery),
    limit: jest.fn().mockReturnValue(mockQuery),
    get: jest.fn().mockResolvedValue(mockQuerySnapshot),
  }));

  const mockFirestoreInstance = {
    collection: mockCollection,
    batch: jest.fn(() => mockBatch),
  };

  // Create the firestore function with Timestamp and FieldValue properties
  const firestoreFunction = jest.fn(() => mockFirestoreInstance) as jest.Mock & {
    Timestamp: { fromDate: jest.Mock };
    FieldValue: { serverTimestamp: jest.Mock };
  };
  
  firestoreFunction.Timestamp = {
    fromDate: jest.fn((date: Date) => ({ toDate: () => date })),
  };
  
  firestoreFunction.FieldValue = {
    serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP"),
  };

  return {
    firestore: firestoreFunction,
    initializeApp: jest.fn(),
    credential: {
      applicationDefault: jest.fn(),
    },
  };
});

// Mock structured-logger
jest.mock("../../utils/structured-logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    audit: jest.fn(),
  })),
}));

describe("LGPDService", () => {
  let service: LGPDService;
  let mockFirestore: any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LGPDService();
    mockFirestore = require("firebase-admin").firestore();
  });

  describe("Constants", () => {
    describe("DEFAULT_CONSENT_PURPOSES", () => {
      it("should have essential purpose as required", () => {
        const essential = DEFAULT_CONSENT_PURPOSES.find(p => p.id === "essential");
        expect(essential).toBeDefined();
        expect(essential!.required).toBe(true);
      });

      it("should have all expected purposes", () => {
        const expectedIds = [
          "essential",
          "health_tracking",
          "notifications",
          "analytics",
          "marketing",
          "third_party_sharing",
        ];
        
        const actualIds = DEFAULT_CONSENT_PURPOSES.map(p => p.id);
        expect(actualIds).toEqual(expectedIds);
      });

      it("should have non-required marketing consent", () => {
        const marketing = DEFAULT_CONSENT_PURPOSES.find(p => p.id === "marketing");
        expect(marketing).toBeDefined();
        expect(marketing!.required).toBe(false);
      });
    });

    describe("RETENTION_PERIODS", () => {
      it("should have medical records retention of 20 years", () => {
        const medical = RETENTION_PERIODS.medical_records;
        expect(medical.retentionPeriodDays).toBe(20 * 365);
        expect(medical.canDelete).toBe(false);
      });

      it("should have prescriptions retention of 5 years", () => {
        const prescriptions = RETENTION_PERIODS.prescriptions;
        expect(prescriptions.retentionPeriodDays).toBe(5 * 365);
        expect(prescriptions.canDelete).toBe(false);
      });

      it("should allow profile data deletion", () => {
        const profile = RETENTION_PERIODS.profile;
        expect(profile.canDelete).toBe(true);
        expect(profile.retentionPeriodDays).toBe(0);
      });

      it("should have audit logs retention of 6 months", () => {
        const auditLogs = RETENTION_PERIODS.audit_logs;
        expect(auditLogs.retentionPeriodDays).toBe(180);
        expect(auditLogs.legalBasis).toContain("Marco Civil");
      });

      it("should have fiscal records retention of 5 years", () => {
        const fiscal = RETENTION_PERIODS.fiscal_records;
        expect(fiscal.retentionPeriodDays).toBe(5 * 365);
        expect(fiscal.legalBasis).toContain("CTN");
      });

      it("should have orders retention of 5 years", () => {
        const orders = RETENTION_PERIODS.orders;
        expect(orders.retentionPeriodDays).toBe(5 * 365);
        expect(orders.legalBasis).toContain("CDC");
      });
    });
  });

  describe("Data Subject Requests", () => {
    describe("createRequest", () => {
      it("should create a pending access request", async () => {
        const mockSet = jest.fn().mockResolvedValue(undefined);
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            set: mockSet,
          }),
        });

        const result = await service.createRequest(
          "access",
          "user-123",
          "user@example.com",
          "I want to see my data"
        );

        expect(result.type).toBe("access");
        expect(result.userId).toBe("user-123");
        expect(result.userEmail).toBe("user@example.com");
        expect(result.status).toBe("pending");
        expect(result.reason).toBe("I want to see my data");
        expect(result.id).toBeTruthy();
        expect(mockSet).toHaveBeenCalled();
      });

      it("should create a portability request", async () => {
        const mockSet = jest.fn().mockResolvedValue(undefined);
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            set: mockSet,
          }),
        });

        const result = await service.createRequest(
          "portability",
          "user-456",
          "other@example.com"
        );

        expect(result.type).toBe("portability");
        expect(result.status).toBe("pending");
      });

      it("should create a deletion request", async () => {
        const mockSet = jest.fn().mockResolvedValue(undefined);
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            set: mockSet,
          }),
        });

        const result = await service.createRequest(
          "deletion",
          "user-789",
          "delete@example.com"
        );

        expect(result.type).toBe("deletion");
      });
    });

    describe("processRequest", () => {
      it("should throw error if request not found", async () => {
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        });

        await expect(service.processRequest("invalid-id", "admin-1"))
          .rejects.toThrow("not found");
      });

      it("should throw error if request not pending", async () => {
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                status: "completed",
                type: "access",
              }),
            }),
          }),
        });

        await expect(service.processRequest("req-123", "admin-1"))
          .rejects.toThrow("not pending");
      });

      it("should update status to processing", async () => {
        const mockUpdate = jest.fn().mockResolvedValue(undefined);
        const mockGet = jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            id: "req-123",
            status: "pending",
            type: "rectification",
            userId: "user-123",
          }),
        });

        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: mockGet,
            update: mockUpdate,
          }),
        });

        const result = await service.processRequest("req-123", "admin-1");

        expect(result.status).toBe("processing");
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
          status: "processing",
          processedBy: "admin-1",
        }));
      });
    });

    describe("completeRequest", () => {
      it("should update request to completed status", async () => {
        const mockUpdate = jest.fn().mockResolvedValue(undefined);
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            update: mockUpdate,
          }),
        });

        await service.completeRequest("req-123", "admin-1", { exportId: "exp-1" });

        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
          status: "completed",
          processedBy: "admin-1",
          metadata: { exportId: "exp-1" },
        }));
      });
    });

    describe("rejectRequest", () => {
      it("should update request to rejected status with legal basis", async () => {
        const mockUpdate = jest.fn().mockResolvedValue(undefined);
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            update: mockUpdate,
          }),
        });

        await service.rejectRequest(
          "req-123",
          "admin-1",
          "Dados retidos por obrigação legal",
          "LGPD Art. 16"
        );

        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
          status: "rejected",
          rejectionReason: "Dados retidos por obrigação legal",
          legalBasis: "LGPD Art. 16",
        }));
      });
    });

    describe("getRequestsByStatus", () => {
      it("should return requests filtered by status", async () => {
        const mockDocs = [
          {
            data: () => ({
              id: "req-1",
              status: "pending",
              type: "access",
              requestedAt: { toDate: () => new Date() },
            }),
          },
          {
            data: () => ({
              id: "req-2",
              status: "pending",
              type: "deletion",
              requestedAt: { toDate: () => new Date() },
            }),
          },
        ];

        const mockQuery = {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: mockDocs }),
        };

        mockFirestore.collection.mockReturnValue(mockQuery);

        const results = await service.getRequestsByStatus("pending");

        expect(results).toHaveLength(2);
        expect(results[0].status).toBe("pending");
      });

      it("should respect limit parameter", async () => {
        const mockQuery = {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };

        mockFirestore.collection.mockReturnValue(mockQuery);

        await service.getRequestsByStatus("completed", 10);

        expect(mockQuery.limit).toHaveBeenCalledWith(10);
      });
    });
  });

  describe("Consent Management", () => {
    describe("recordConsent", () => {
      it("should record consent with all purposes", async () => {
        const mockSet = jest.fn().mockResolvedValue(undefined);
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            set: mockSet,
          }),
        });

        const purposes = [
          { id: "essential", granted: true },
          { id: "health_tracking", granted: true },
          { id: "notifications", granted: false },
          { id: "analytics", granted: false },
          { id: "marketing", granted: false },
          { id: "third_party_sharing", granted: false },
        ];

        const result = await service.recordConsent(
          "user-123",
          purposes,
          "192.168.1.1",
          "Mozilla/5.0"
        );

        expect(result.userId).toBe("user-123");
        expect(result.version).toBe("1.0.0");
        expect(result.revoked).toBe(false);
        expect(result.purposes).toHaveLength(6);
        
        // Essential should be granted (required)
        const essential = result.purposes.find(p => p.id === "essential");
        expect(essential!.granted).toBe(true);
        
        // Health tracking should be granted (user chose)
        const health = result.purposes.find(p => p.id === "health_tracking");
        expect(health!.granted).toBe(true);
        
        // Marketing should not be granted
        const marketing = result.purposes.find(p => p.id === "marketing");
        expect(marketing!.granted).toBe(false);
      });

      it("should always grant required purposes", async () => {
        const mockSet = jest.fn().mockResolvedValue(undefined);
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            set: mockSet,
          }),
        });

        // User tries to deny essential
        const purposes = [
          { id: "essential", granted: false },
        ];

        const result = await service.recordConsent("user-123", purposes);

        const essential = result.purposes.find(p => p.id === "essential");
        expect(essential!.granted).toBe(true); // Should still be true
      });

      it("should hash IP address for privacy", async () => {
        const mockSet = jest.fn().mockResolvedValue(undefined);
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            set: mockSet,
          }),
        });

        await service.recordConsent("user-123", [], "192.168.1.1");

        const setCall = mockSet.mock.calls[0][0];
        expect(setCall.ipAddress).not.toBe("192.168.1.1");
        expect(setCall.ipAddress).toHaveLength(16); // Truncated hash
      });
    });

    describe("updateConsent", () => {
      it("should update specific consent purpose", async () => {
        const mockGet = jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            userId: "user-123",
            purposes: [
              { id: "marketing", granted: false, required: false },
            ],
          }),
        });
        const mockUpdate = jest.fn().mockResolvedValue(undefined);

        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: mockGet,
            update: mockUpdate,
          }),
        });

        await service.updateConsent("user-123", "marketing", true);

        expect(mockUpdate).toHaveBeenCalled();
      });

      it("should throw error when consent not found", async () => {
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        });

        await expect(service.updateConsent("user-999", "marketing", true))
          .rejects.toThrow("not found");
      });

      it("should throw error when revoking required consent", async () => {
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                purposes: [{ id: "essential", required: true, granted: true }],
              }),
            }),
          }),
        });

        await expect(service.updateConsent("user-123", "essential", false))
          .rejects.toThrow("Cannot revoke required consent");
      });

      it("should throw error for unknown purpose", async () => {
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                purposes: [{ id: "marketing", required: false }],
              }),
            }),
          }),
        });

        await expect(service.updateConsent("user-123", "unknown_purpose", true))
          .rejects.toThrow("not found");
      });
    });

    describe("revokeAllConsents", () => {
      it("should revoke all non-required consents", async () => {
        const mockGet = jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            purposes: [
              { id: "essential", required: true, granted: true },
              { id: "marketing", required: false, granted: true },
              { id: "analytics", required: false, granted: true },
            ],
          }),
        });
        const mockUpdate = jest.fn().mockResolvedValue(undefined);

        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: mockGet,
            update: mockUpdate,
          }),
        });

        await service.revokeAllConsents("user-123");

        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
          revoked: true,
        }));
        
        const updateCall = mockUpdate.mock.calls[0][0];
        const essential = updateCall.purposes.find((p: any) => p.id === "essential");
        const marketing = updateCall.purposes.find((p: any) => p.id === "marketing");
        
        expect(essential.granted).toBe(true); // Required stays granted
        expect(marketing.granted).toBe(false); // Non-required revoked
      });

      it("should do nothing if consent not found", async () => {
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        });

        // Should not throw
        await service.revokeAllConsents("user-999");
      });
    });

    describe("hasConsent", () => {
      it("should return true if consent is granted", async () => {
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                revoked: false,
                purposes: [{ id: "marketing", granted: true }],
              }),
            }),
          }),
        });

        const result = await service.hasConsent("user-123", "marketing");
        expect(result).toBe(true);
      });

      it("should return false if consent is not granted", async () => {
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                revoked: false,
                purposes: [{ id: "marketing", granted: false }],
              }),
            }),
          }),
        });

        const result = await service.hasConsent("user-123", "marketing");
        expect(result).toBe(false);
      });

      it("should return false if all consents are revoked", async () => {
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                revoked: true,
                purposes: [{ id: "marketing", granted: true }],
              }),
            }),
          }),
        });

        const result = await service.hasConsent("user-123", "marketing");
        expect(result).toBe(false);
      });

      it("should return false if consent document not found", async () => {
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        });

        const result = await service.hasConsent("user-999", "marketing");
        expect(result).toBe(false);
      });

      it("should return false for unknown purpose", async () => {
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                revoked: false,
                purposes: [{ id: "marketing", granted: true }],
              }),
            }),
          }),
        });

        const result = await service.hasConsent("user-123", "unknown_purpose");
        expect(result).toBe(false);
      });
    });

    describe("getUserConsent", () => {
      it("should return user consent if exists", async () => {
        const now = new Date();
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                userId: "user-123",
                purposes: [],
                grantedAt: { toDate: () => now },
                version: "1.0.0",
                revoked: false,
              }),
            }),
          }),
        });

        const result = await service.getUserConsent("user-123");

        expect(result).not.toBeNull();
        expect(result!.userId).toBe("user-123");
        expect(result!.version).toBe("1.0.0");
      });

      it("should return null if consent not found", async () => {
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
        });

        const result = await service.getUserConsent("user-999");
        expect(result).toBeNull();
      });
    });
  });

  describe("Data Export (Portability)", () => {
    describe("exportUserData", () => {
      it("should export all user data with checksum", async () => {
        const mockUserDoc = {
          exists: true,
          data: () => ({ displayName: "Test User", email: "test@example.com" }),
        };

        const mockEmptySnapshot = { docs: [] };
        const mockConsentDoc = {
          exists: true,
          data: () => ({
            userId: "user-123",
            purposes: [],
            grantedAt: { toDate: () => new Date() },
          }),
        };

        mockFirestore.collection.mockImplementation((name: string) => {
          if (name === "users") {
            return {
              doc: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue(mockUserDoc),
              }),
            };
          }
          if (name === "user_consents") {
            return {
              doc: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue(mockConsentDoc),
              }),
            };
          }
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue(mockEmptySnapshot),
          };
        });

        const result = await service.exportUserData("user-123");

        expect(result.exportId).toBeTruthy();
        expect(result.userId).toBe("user-123");
        expect(result.format).toBe("json");
        expect(result.checksum).toBeTruthy();
        expect(result.checksum).toHaveLength(64); // SHA-256 hex
        expect(result.data.profile).toBeDefined();
        expect(result.data.medications).toEqual([]);
        expect(result.data.prescriptions).toEqual([]);
        expect(result.data.orders).toEqual([]);
      });

      it("should include medications in export", async () => {
        const mockMedications = [
          { id: "med-1", name: "Aspirin", userId: "user-123" },
          { id: "med-2", name: "Ibuprofen", userId: "user-123" },
        ];

        mockFirestore.collection.mockImplementation((name: string) => {
          if (name === "users") {
            return {
              doc: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({
                  exists: true,
                  data: () => ({}),
                }),
              }),
            };
          }
          if (name === "user_consents") {
            return {
              doc: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({ exists: false }),
              }),
            };
          }
          if (name === "medications") {
            return {
              where: jest.fn().mockReturnThis(),
              get: jest.fn().mockResolvedValue({
                docs: mockMedications.map(m => ({
                  id: m.id,
                  data: () => m,
                })),
              }),
            };
          }
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        });

        const result = await service.exportUserData("user-123");

        expect(result.data.medications).toHaveLength(2);
      });

      it("should remove sensitive tokens from export", async () => {
        mockFirestore.collection.mockImplementation((name: string) => {
          if (name === "users") {
            return {
              doc: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({
                  exists: true,
                  data: () => ({
                    displayName: "Test",
                    password: "secret123",
                    token: "jwt-token",
                    apiKey: "api-123",
                    refreshToken: "refresh-456",
                    cpf: "123.456.789-00",
                  }),
                }),
              }),
            };
          }
          if (name === "user_consents") {
            return {
              doc: jest.fn().mockReturnValue({
                get: jest.fn().mockResolvedValue({ exists: false }),
              }),
            };
          }
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        });

        const result = await service.exportUserData("user-123");

        expect(result.data.profile.password).toBeUndefined();
        expect(result.data.profile.token).toBeUndefined();
        expect(result.data.profile.apiKey).toBeUndefined();
        expect(result.data.profile.refreshToken).toBeUndefined();
        expect(result.data.profile.cpf_SENSITIVE).toBe(true);
      });
    });
  });

  describe("Data Deletion", () => {
    describe("checkRetentionPeriod", () => {
      it("should return eligible if no data requires retention", async () => {
        mockFirestore.collection.mockImplementation(() => ({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
          }),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        }));

        const result = await service.checkRetentionPeriod("user-123");

        expect(result.eligible).toBe(true);
      });

      it("should return not eligible if medical records exist", async () => {
        const createdAt = new Date();
        
        mockFirestore.collection.mockImplementation((name: string) => {
          if (name === "medications") {
            return {
              where: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              limit: jest.fn().mockReturnThis(),
              get: jest.fn().mockResolvedValue({
                empty: false,
                docs: [{
                  data: () => ({
                    createdAt: { toDate: () => createdAt },
                  }),
                }],
              }),
            };
          }
          return {
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({ exists: false }),
            }),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          };
        });

        const result = await service.checkRetentionPeriod("user-123");

        expect(result.eligible).toBe(false);
        expect(result.legalBasis).toContain("CFM");
        expect(result.retentionUntil).toBeTruthy();
      });
    });

    describe("deleteUserData", () => {
      it("should throw error if retention period not met", async () => {
        // Mock retention check to return not eligible
        jest.spyOn(service, "checkRetentionPeriod").mockResolvedValue({
          eligible: false,
          reason: "Data retained until 2030",
          legalBasis: "CFM 1.821/2007",
        });

        await expect(service.deleteUserData("user-123"))
          .rejects.toThrow("Data retained until 2030");
      });

      it("should allow forced deletion", async () => {
        jest.spyOn(service, "checkRetentionPeriod").mockResolvedValue({
          eligible: false,
          reason: "Data retained",
        });

        const mockUpdate = jest.fn().mockResolvedValue(undefined);
        const mockGet = jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ purposes: [] }),
        });

        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            update: mockUpdate,
            get: mockGet,
          }),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        });

        mockFirestore.batch.mockReturnValue({
          update: jest.fn(),
          commit: jest.fn().mockResolvedValue(undefined),
        });

        // Should not throw with force=true
        await service.deleteUserData("user-123", true);

        expect(mockUpdate).toHaveBeenCalled();
      });

      it("should anonymize user data", async () => {
        jest.spyOn(service, "checkRetentionPeriod").mockResolvedValue({
          eligible: true,
        });

        const mockUpdate = jest.fn().mockResolvedValue(undefined);
        const mockGet = jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ purposes: [] }),
        });

        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            update: mockUpdate,
            get: mockGet,
          }),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        });

        mockFirestore.batch.mockReturnValue({
          update: jest.fn(),
          commit: jest.fn().mockResolvedValue(undefined),
        });

        await service.deleteUserData("user-123");

        // Should call update to anonymize
        expect(mockUpdate).toHaveBeenCalled();
        
        // Check that user profile is anonymized
        const userUpdateCall = mockUpdate.mock.calls.find(
          (call: any[]) => call[0].deleted === true
        );
        if (userUpdateCall) {
          expect(userUpdateCall[0].email).toContain("@anonymized.local");
          expect(userUpdateCall[0].displayName).toBe("Usuário Excluído");
        }
      });
    });
  });

  describe("Integration", () => {
    it("should handle complete LGPD flow: consent → export → deletion", async () => {
      // 1. Record consent
      const mockSet = jest.fn().mockResolvedValue(undefined);
      mockFirestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          set: mockSet,
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn().mockResolvedValue(undefined),
        }),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      });

      const consent = await service.recordConsent("user-123", [
        { id: "essential", granted: true },
        { id: "marketing", granted: true },
      ]);

      expect(consent.userId).toBe("user-123");

      // 2. Create export request
      const request = await service.createRequest(
        "portability",
        "user-123",
        "user@example.com"
      );

      expect(request.type).toBe("portability");
      expect(request.status).toBe("pending");
    });
  });
});
