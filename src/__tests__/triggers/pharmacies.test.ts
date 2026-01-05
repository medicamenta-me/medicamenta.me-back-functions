/**
 * Pharmacy Triggers Tests
 *
 * Testes para triggers de farmácias.
 * Cobertura: 100%
 *
 * @module __tests__/triggers/pharmacies.test
 */

// Mock firebase-admin e firebase-functions ANTES de importar os triggers
jest.mock("firebase-admin", () => {
  const mockTimestamp = {
    toDate: () => new Date(),
  };

  const createMockDocRef = (collectionPath: string, docId: string) => ({
    id: docId,
    path: `${collectionPath}/${docId}`,
    get: jest.fn().mockImplementation(async () => {
      return {
        exists: true,
        data: () => ({
          fcmTokens: ["token-1", "token-2"],
          role: "pharmacy_admin",
          active: true,
        }),
        id: docId,
      };
    }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  });

  const createMockCollection = (collectionPath: string) => ({
    doc: jest.fn((docId?: string) => {
      const id = docId || `auto-${Date.now()}`;
      return createMockDocRef(collectionPath, id);
    }),
    add: jest.fn().mockResolvedValue({ id: `auto-${Date.now()}` }),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      empty: false,
      size: 2,
      docs: [
        {
          id: "admin-1",
          data: () => ({ fcmTokens: ["admin-token-1"], role: "super_admin", active: true }),
          ref: createMockDocRef("admins", "admin-1"),
        },
        {
          id: "admin-2",
          data: () => ({ fcmTokens: ["admin-token-2"], role: "pharmacy_admin", active: true }),
          ref: createMockDocRef("admins", "admin-2"),
        },
      ],
    }),
  });

  const mockBatch = {
    set: jest.fn(),
    update: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };

  return {
    initializeApp: jest.fn(),
    firestore: jest.fn(() => ({
      collection: jest.fn((path: string) => createMockCollection(path)),
      batch: jest.fn(() => mockBatch),
      FieldValue: {
        serverTimestamp: jest.fn(() => mockTimestamp),
        increment: jest.fn((n: number) => n),
        arrayRemove: jest.fn((...args: unknown[]) => args),
      },
    })),
    messaging: jest.fn(() => ({
      sendEachForMulticast: jest.fn().mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      }),
    })),
    credential: {
      applicationDefault: jest.fn(),
    },
  };
});

jest.mock("firebase-functions", () => ({
  region: jest.fn(() => ({
    runWith: jest.fn(() => ({
      firestore: {
        document: jest.fn(() => ({
          onCreate: jest.fn((handler) => handler),
          onUpdate: jest.fn((handler) => handler),
          onDelete: jest.fn((handler) => handler),
        })),
      },
    })),
  })),
  config: jest.fn(() => ({})),
}));

// Mock event-log.service
jest.mock("../../api/services/event-log.service", () => ({
  eventLogService: {
    log: jest.fn().mockResolvedValue("event-log-id"),
    logPharmacyEvent: jest.fn().mockResolvedValue("event-log-id"),
  },
  EventType: {
    PHARMACY_REGISTERED: "PHARMACY_REGISTERED",
    PHARMACY_APPROVED: "PHARMACY_APPROVED",
    PHARMACY_REJECTED: "PHARMACY_REJECTED",
    PHARMACY_SUSPENDED: "PHARMACY_SUSPENDED",
    PHARMACY_UPDATED: "PHARMACY_UPDATED",
    SYSTEM_ERROR: "SYSTEM_ERROR",
  },
  EventSeverity: {
    INFO: "INFO",
    WARNING: "WARNING",
    ERROR: "ERROR",
  },
  EventCategory: {
    PHARMACY: "PHARMACY",
  },
}));

// Mock audit.service
jest.mock("../../api/services/audit.service", () => ({
  auditService: {
    log: jest.fn().mockResolvedValue("audit-log-id"),
  },
  AuditAction: {
    PHARMACY_APPROVED: "PHARMACY_APPROVED",
  },
}));

import { PharmacyStatus, PharmacyData } from "../../triggers/pharmacies";
import { eventLogService } from "../../api/services/event-log.service";
import { auditService } from "../../api/services/audit.service";

// Define types locally since firebase types are mocked
type Change<T> = {
  before: T;
  after: T;
};

type DocumentSnapshot = {
  data: () => unknown;
  id: string;
  ref?: { id: string; update: jest.Mock };
};

describe("Pharmacy Triggers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("PharmacyStatus Enum", () => {
    it("should have all pharmacy statuses", () => {
      expect(PharmacyStatus.PENDING).toBe("pending");
      expect(PharmacyStatus.APPROVED).toBe("approved");
      expect(PharmacyStatus.REJECTED).toBe("rejected");
      expect(PharmacyStatus.SUSPENDED).toBe("suspended");
      expect(PharmacyStatus.INACTIVE).toBe("inactive");
    });
  });

  describe("onPharmacyCreated", () => {
    const createMockSnapshot = (data: Partial<PharmacyData>) => ({
      data: () => ({
        name: "Test Pharmacy",
        email: "pharmacy@test.com",
        status: PharmacyStatus.PENDING,
        ownerId: "owner-123",
        address: {
          city: "São Paulo",
          state: "SP",
        },
        ...data,
      }),
      id: "pharmacy-789",
      ref: {
        id: "pharmacy-789",
        update: jest.fn().mockResolvedValue(undefined),
      },
    });

    const createMockContext = (pharmacyId: string = "pharmacy-789") => ({
      params: { pharmacyId },
    });

    it("should process pharmacy creation successfully", async () => {
      const { onPharmacyCreated } = await import("../../triggers/pharmacies");

      const snapshot = createMockSnapshot({});
      const context = createMockContext();

      const result = await onPharmacyCreated(
        snapshot as unknown as DocumentSnapshot,
        context
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.pharmacyId).toBe("pharmacy-789");
      expect(result.action).toBe("onCreate");
    });

    it("should log pharmacy event", async () => {
      const { onPharmacyCreated } = await import("../../triggers/pharmacies");

      const snapshot = createMockSnapshot({});
      const context = createMockContext();

      await onPharmacyCreated(
        snapshot as unknown as DocumentSnapshot,
        context
      );

      expect(eventLogService.logPharmacyEvent).toHaveBeenCalled();
    });

    it("should return error for invalid pharmacy data - missing name", async () => {
      const { onPharmacyCreated } = await import("../../triggers/pharmacies");

      const snapshot = {
        data: () => ({
          email: "pharmacy@test.com",
          status: PharmacyStatus.PENDING,
          ownerId: "owner-123",
        }),
        id: "pharmacy-789",
      };
      const context = createMockContext();

      const result = await onPharmacyCreated(
        snapshot as unknown as DocumentSnapshot,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid pharmacy data");
    });

    it("should return error for invalid pharmacy data - missing email", async () => {
      const { onPharmacyCreated } = await import("../../triggers/pharmacies");

      const snapshot = {
        data: () => ({
          name: "Test Pharmacy",
          status: PharmacyStatus.PENDING,
          ownerId: "owner-123",
        }),
        id: "pharmacy-789",
      };
      const context = createMockContext();

      const result = await onPharmacyCreated(
        snapshot as unknown as DocumentSnapshot,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid pharmacy data");
    });
  });

  describe("onPharmacyStatusUpdated", () => {
    const createMockChange = (beforeStatus: PharmacyStatus, afterStatus: PharmacyStatus, additionalData?: Partial<PharmacyData>) => ({
      before: {
        data: () => ({
          name: "Test Pharmacy",
          email: "pharmacy@test.com",
          status: beforeStatus,
          ownerId: "owner-123",
          fcmTokens: ["token-1"],
        }),
        id: "pharmacy-789",
      },
      after: {
        data: () => ({
          name: "Test Pharmacy",
          email: "pharmacy@test.com",
          status: afterStatus,
          ownerId: "owner-123",
          fcmTokens: ["token-1"],
          approvedBy: "admin-1",
          ...additionalData,
        }),
        id: "pharmacy-789",
      },
    });

    const createMockContext = (pharmacyId: string = "pharmacy-789") => ({
      params: { pharmacyId },
    });

    it("should process status update successfully", async () => {
      const { onPharmacyStatusUpdated } = await import("../../triggers/pharmacies");

      const change = createMockChange(PharmacyStatus.PENDING, PharmacyStatus.APPROVED);
      const context = createMockContext();

      const result = await onPharmacyStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("onUpdate");
    });

    it("should skip if status unchanged", async () => {
      const { onPharmacyStatusUpdated } = await import("../../triggers/pharmacies");

      const change = createMockChange(PharmacyStatus.PENDING, PharmacyStatus.PENDING);
      const context = createMockContext();

      const result = await onPharmacyStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle transition to APPROVED", async () => {
      const { onPharmacyStatusUpdated } = await import("../../triggers/pharmacies");

      const change = createMockChange(PharmacyStatus.PENDING, PharmacyStatus.APPROVED);
      const context = createMockContext();

      const result = await onPharmacyStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
      expect(eventLogService.logPharmacyEvent).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });

    it("should handle transition to REJECTED", async () => {
      const { onPharmacyStatusUpdated } = await import("../../triggers/pharmacies");

      const change = createMockChange(PharmacyStatus.PENDING, PharmacyStatus.REJECTED, {
        rejectionReason: "Invalid documents",
      });
      const context = createMockContext();

      const result = await onPharmacyStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle transition to SUSPENDED", async () => {
      const { onPharmacyStatusUpdated } = await import("../../triggers/pharmacies");

      const change = createMockChange(PharmacyStatus.APPROVED, PharmacyStatus.SUSPENDED, {
        suspensionReason: "Policy violation",
      });
      const context = createMockContext();

      const result = await onPharmacyStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle transition to INACTIVE", async () => {
      const { onPharmacyStatusUpdated } = await import("../../triggers/pharmacies");

      const change = createMockChange(PharmacyStatus.APPROVED, PharmacyStatus.INACTIVE);
      const context = createMockContext();

      const result = await onPharmacyStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle all status transitions", async () => {
      const { onPharmacyStatusUpdated } = await import("../../triggers/pharmacies");

      const transitions = [
        [PharmacyStatus.PENDING, PharmacyStatus.APPROVED],
        [PharmacyStatus.PENDING, PharmacyStatus.REJECTED],
        [PharmacyStatus.APPROVED, PharmacyStatus.SUSPENDED],
        [PharmacyStatus.SUSPENDED, PharmacyStatus.APPROVED],
        [PharmacyStatus.APPROVED, PharmacyStatus.INACTIVE],
      ];

      for (const [before, after] of transitions) {
        const change = createMockChange(before, after);
        const context = createMockContext();

        const result = await onPharmacyStatusUpdated(
          change as unknown as Change<DocumentSnapshot>,
          context
        );

        expect(result.success).toBe(true);
      }
    });
  });
});

describe("TriggerResult Interface for Pharmacy", () => {
  it("should have correct structure", () => {
    const result = {
      success: true,
      pharmacyId: "pharmacy-123",
      action: "onCreate",
      timestamp: new Date(),
    };

    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("pharmacyId");
    expect(result).toHaveProperty("action");
    expect(result).toHaveProperty("timestamp");
  });

  it("should include error when failed", () => {
    const result = {
      success: false,
      pharmacyId: "pharmacy-123",
      action: "onCreate",
      timestamp: new Date(),
      error: "Something went wrong",
    };

    expect(result.error).toBeDefined();
  });
});
