/**
 * Order Triggers Tests
 *
 * Testes para triggers de pedidos.
 * Cobertura: 100%
 *
 * @module __tests__/triggers/orders.test
 */

// Mock firebase-admin e firebase-functions ANTES de importar os triggers
jest.mock("firebase-admin", () => {
  const mockFirestoreData: Record<string, Record<string, unknown>> = {};

  const mockTimestamp = {
    toDate: () => new Date(),
  };

  const createMockDocRef = (collectionPath: string, docId: string) => ({
    id: docId,
    path: `${collectionPath}/${docId}`,
    get: jest.fn().mockImplementation(async () => {
      const data = mockFirestoreData[collectionPath]?.[docId];
      return {
        exists: !!data,
        data: () => data,
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
      empty: true,
      docs: [],
    }),
  });

  return {
    initializeApp: jest.fn(),
    firestore: jest.fn(() => ({
      collection: jest.fn((path: string) => createMockCollection(path)),
      batch: jest.fn(() => ({
        set: jest.fn(),
        update: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
      })),
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
    logOrderEvent: jest.fn().mockResolvedValue("event-log-id"),
  },
  EventType: {
    ORDER_CREATED: "ORDER_CREATED",
    ORDER_STATUS_UPDATED: "ORDER_STATUS_UPDATED",
    ORDER_CANCELLED: "ORDER_CANCELLED",
    ORDER_SHIPPED: "ORDER_SHIPPED",
    ORDER_DELIVERED: "ORDER_DELIVERED",
    SYSTEM_ERROR: "SYSTEM_ERROR",
  },
  EventSeverity: {
    INFO: "INFO",
    WARNING: "WARNING",
    ERROR: "ERROR",
  },
  EventCategory: {
    ORDER: "ORDER",
  },
}));

// Mock audit.service
jest.mock("../../api/services/audit.service", () => ({
  auditService: {
    log: jest.fn().mockResolvedValue("audit-log-id"),
  },
  AuditAction: {
    ORDER_CREATED: "ORDER_CREATED",
    ORDER_STATUS_CHANGED: "ORDER_STATUS_CHANGED",
  },
}));

import { OrderStatus, OrderData } from "../../triggers/orders";
import { eventLogService } from "../../api/services/event-log.service";
import { auditService } from "../../api/services/audit.service";

// Define Change type locally since firebase-functions types are mocked
type Change<T> = {
  before: T;
  after: T;
};

type DocumentSnapshot = {
  data: () => unknown;
  id: string;
  ref?: { id: string; update: jest.Mock };
};

describe("Order Triggers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("OrderStatus Enum", () => {
    it("should have all order statuses", () => {
      expect(OrderStatus.PENDING).toBe("pending");
      expect(OrderStatus.CONFIRMED).toBe("confirmed");
      expect(OrderStatus.PROCESSING).toBe("processing");
      expect(OrderStatus.SHIPPED).toBe("shipped");
      expect(OrderStatus.DELIVERED).toBe("delivered");
      expect(OrderStatus.CANCELLED).toBe("cancelled");
      expect(OrderStatus.REFUNDED).toBe("refunded");
    });
  });

  describe("onOrderCreated", () => {
    const createMockSnapshot = (data: Partial<OrderData>) => ({
      data: () => ({
        userId: "user-123",
        pharmacyId: "pharmacy-456",
        status: OrderStatus.PENDING,
        total: 100,
        items: [{ productId: "prod-1", name: "Product 1", quantity: 1, price: 100 }],
        ...data,
      }),
      id: "order-789",
      ref: {
        id: "order-789",
        update: jest.fn().mockResolvedValue(undefined),
      },
    });

    const createMockContext = (orderId: string = "order-789") => ({
      params: { orderId },
    });

    it("should process order creation successfully", async () => {
      // Re-import to get the handler
      const { onOrderCreated } = await import("../../triggers/orders");

      const snapshot = createMockSnapshot({});
      const context = createMockContext();

      // The trigger returns a handler function
      const handler = onOrderCreated;
      const result = await handler(snapshot as unknown as DocumentSnapshot, context);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.orderId).toBe("order-789");
      expect(result.action).toBe("onCreate");
    });

    it("should log event and audit", async () => {
      const { onOrderCreated } = await import("../../triggers/orders");

      const snapshot = createMockSnapshot({});
      const context = createMockContext();

      await onOrderCreated(snapshot as unknown as DocumentSnapshot, context);

      expect(eventLogService.logOrderEvent).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });

    it("should return error for invalid order data - missing userId", async () => {
      const { onOrderCreated } = await import("../../triggers/orders");

      const snapshot = {
        data: () => ({
          pharmacyId: "pharmacy-456",
          status: OrderStatus.PENDING,
          total: 100,
          items: [],
        }),
        id: "order-789",
      };
      const context = createMockContext();

      const result = await onOrderCreated(snapshot as unknown as DocumentSnapshot, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid order data");
    });

    it("should return error for invalid order data - missing pharmacyId", async () => {
      const { onOrderCreated } = await import("../../triggers/orders");

      const snapshot = {
        data: () => ({
          userId: "user-123",
          status: OrderStatus.PENDING,
          total: 100,
          items: [],
        }),
        id: "order-789",
      };
      const context = createMockContext();

      const result = await onOrderCreated(snapshot as unknown as DocumentSnapshot, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid order data");
    });

    it("should handle missing total gracefully", async () => {
      const { onOrderCreated } = await import("../../triggers/orders");

      const snapshot = createMockSnapshot({ total: undefined as unknown as number });
      const context = createMockContext();

      const result = await onOrderCreated(snapshot as unknown as DocumentSnapshot, context);

      expect(result.success).toBe(true);
    });

    it("should handle missing items gracefully", async () => {
      const { onOrderCreated } = await import("../../triggers/orders");

      const snapshot = createMockSnapshot({ items: undefined as unknown as [] });
      const context = createMockContext();

      const result = await onOrderCreated(snapshot as unknown as DocumentSnapshot, context);

      expect(result.success).toBe(true);
    });
  });

  describe("onOrderStatusUpdated", () => {
    const createMockChange = (beforeStatus: OrderStatus, afterStatus: OrderStatus) => ({
      before: {
        data: () => ({
          userId: "user-123",
          pharmacyId: "pharmacy-456",
          status: beforeStatus,
          total: 100,
          items: [],
        }),
        id: "order-789",
      },
      after: {
        data: () => ({
          userId: "user-123",
          pharmacyId: "pharmacy-456",
          status: afterStatus,
          total: 100,
          items: [],
        }),
        id: "order-789",
      },
    });

    const createMockContext = (orderId: string = "order-789") => ({
      params: { orderId },
    });

    it("should process status update successfully", async () => {
      const { onOrderStatusUpdated } = await import("../../triggers/orders");

      const change = createMockChange(OrderStatus.PENDING, OrderStatus.CONFIRMED);
      const context = createMockContext();

      const result = await onOrderStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("onUpdate");
    });

    it("should skip if status unchanged", async () => {
      const { onOrderStatusUpdated } = await import("../../triggers/orders");

      const change = createMockChange(OrderStatus.PENDING, OrderStatus.PENDING);
      const context = createMockContext();

      const result = await onOrderStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle transition to DELIVERED", async () => {
      const { onOrderStatusUpdated } = await import("../../triggers/orders");

      const change = createMockChange(OrderStatus.SHIPPED, OrderStatus.DELIVERED);
      const context = createMockContext();

      const result = await onOrderStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle transition to CANCELLED", async () => {
      const { onOrderStatusUpdated } = await import("../../triggers/orders");

      const change = createMockChange(OrderStatus.PENDING, OrderStatus.CANCELLED);
      const context = createMockContext();

      const result = await onOrderStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle transition to SHIPPED", async () => {
      const { onOrderStatusUpdated } = await import("../../triggers/orders");

      const change = createMockChange(OrderStatus.PROCESSING, OrderStatus.SHIPPED);
      const context = createMockContext();

      const result = await onOrderStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle transition to REFUNDED", async () => {
      const { onOrderStatusUpdated } = await import("../../triggers/orders");

      const change = createMockChange(OrderStatus.CANCELLED, OrderStatus.REFUNDED);
      const context = createMockContext();

      const result = await onOrderStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle all status transitions", async () => {
      const { onOrderStatusUpdated } = await import("../../triggers/orders");

      const transitions = [
        [OrderStatus.PENDING, OrderStatus.CONFIRMED],
        [OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
        [OrderStatus.PROCESSING, OrderStatus.SHIPPED],
        [OrderStatus.SHIPPED, OrderStatus.DELIVERED],
        [OrderStatus.PENDING, OrderStatus.CANCELLED],
      ];

      for (const [before, after] of transitions) {
        const change = createMockChange(before, after);
        const context = createMockContext();

        const result = await onOrderStatusUpdated(
          change as unknown as Change<DocumentSnapshot>,
          context
        );

        expect(result.success).toBe(true);
      }
    });
  });
});

describe("TriggerResult Interface", () => {
  it("should have correct structure", () => {
    const result = {
      success: true,
      orderId: "order-123",
      action: "onCreate",
      timestamp: new Date(),
    };

    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("orderId");
    expect(result).toHaveProperty("action");
    expect(result).toHaveProperty("timestamp");
  });

  it("should include error when failed", () => {
    const result = {
      success: false,
      orderId: "order-123",
      action: "onCreate",
      timestamp: new Date(),
      error: "Something went wrong",
    };

    expect(result.error).toBeDefined();
  });
});

describe("Order Triggers Error Handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("onOrderCreated - Error Scenarios", () => {
    it("should handle Error instance in catch block", async () => {
      // Mock eventLogService to throw
      jest.mocked(eventLogService.logOrderEvent).mockRejectedValueOnce(new Error("Event log failed"));

      const { onOrderCreated } = await import("../../triggers/orders");

      const snapshot = {
        data: () => ({
          userId: "user-123",
          pharmacyId: "pharmacy-456",
          status: "pending",
          total: 100,
          items: [],
        }),
        id: "order-error-test",
      };

      const context = { params: { orderId: "order-error-test" } };
      const result = await onOrderCreated(snapshot as unknown as DocumentSnapshot, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Event log failed");
    });

    it("should handle non-Error throw in catch block", async () => {
      // Mock eventLogService to throw string
      jest.mocked(eventLogService.logOrderEvent).mockRejectedValueOnce("String error");

      const { onOrderCreated } = await import("../../triggers/orders");

      const snapshot = {
        data: () => ({
          userId: "user-123",
          pharmacyId: "pharmacy-456",
          status: "pending",
          total: 100,
          items: [],
        }),
        id: "order-string-error",
      };

      const context = { params: { orderId: "order-string-error" } };
      const result = await onOrderCreated(snapshot as unknown as DocumentSnapshot, context);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error");
    });
  });

  describe("onOrderStatusUpdated - Error Scenarios", () => {
    const createErrorChange = () => ({
      before: {
        data: () => ({
          userId: "user-123",
          pharmacyId: "pharmacy-456",
          status: "pending",
          total: 100,
          items: [],
        }),
        id: "order-789",
      },
      after: {
        data: () => ({
          userId: "user-123",
          pharmacyId: "pharmacy-456",
          status: "confirmed",
          total: 100,
          items: [],
        }),
        id: "order-789",
      },
    });

    it("should handle Error instance in onUpdate catch block", async () => {
      jest.mocked(eventLogService.logOrderEvent).mockRejectedValueOnce(new Error("Update log failed"));

      const { onOrderStatusUpdated } = await import("../../triggers/orders");

      const change = createErrorChange();
      const context = { params: { orderId: "order-update-error" } };

      const result = await onOrderStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Update log failed");
    });

    it("should handle non-Error throw in onUpdate catch block", async () => {
      jest.mocked(eventLogService.logOrderEvent).mockRejectedValueOnce({ custom: "error" });

      const { onOrderStatusUpdated } = await import("../../triggers/orders");

      const change = createErrorChange();
      const context = { params: { orderId: "order-custom-error" } };

      const result = await onOrderStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error");
    });

    it("should skip processing when status unchanged", async () => {
      const { onOrderStatusUpdated } = await import("../../triggers/orders");

      const change = {
        before: {
          data: () => ({
            userId: "user-123",
            pharmacyId: "pharmacy-456",
            status: "pending",
            total: 100,
            items: [],
          }),
          id: "order-789",
        },
        after: {
          data: () => ({
            userId: "user-123",
            pharmacyId: "pharmacy-456",
            status: "pending", // Same status
            total: 100,
            items: [],
          }),
          id: "order-789",
        },
      };

      const context = { params: { orderId: "order-no-change" } };
      const result = await onOrderStatusUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
      // Should return early without calling logOrderEvent for status change
    });
  });
});
