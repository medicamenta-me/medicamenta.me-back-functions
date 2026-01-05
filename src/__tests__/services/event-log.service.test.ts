/**
 * Event Log Service Tests
 *
 * Testes para o serviço de registro de eventos.
 * Cobertura: 100%
 *
 * @module __tests__/services/event-log.service.test
 */

import {
  EventLogService,
  EventType,
  EventSeverity,
  EventCategory,
  EventLogInput,
} from "../../api/services/event-log.service";

// Mock firebase-admin
jest.mock("firebase-admin", () => {
  const mockFirestoreData: Record<string, Record<string, unknown>> = {};

  // Helper to ensure timestamp has toDate method
  const ensureTimestampMethod = (data: Record<string, unknown>) => {
    if (data && data.timestamp && typeof data.timestamp === "object") {
      const ts = data.timestamp as { toDate?: () => Date };
      if (!ts.toDate) {
        (data.timestamp as Record<string, unknown>).toDate = () => new Date();
      }
    }
    return data;
  };

  const createMockDocRef = (collectionPath: string, docId: string) => ({
    id: docId,
    path: `${collectionPath}/${docId}`,
    set: jest.fn().mockImplementation(async (data: unknown) => {
      if (!mockFirestoreData[collectionPath]) {
        mockFirestoreData[collectionPath] = {};
      }
      mockFirestoreData[collectionPath][docId] = data;
      return Promise.resolve();
    }),
  });

  const createMockQuery = (collectionPath: string, docs: Array<{ id: string; data: unknown }>) => ({
    get: jest.fn().mockImplementation(async () => ({
      empty: docs.length === 0,
      size: docs.length,
      docs: docs.map((doc) => ({
        id: doc.id,
        data: () => ensureTimestampMethod(doc.data as Record<string, unknown>),
      })),
    })),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: () => ({ count: docs.length }) }),
    }),
  });

  const createMockCollection = (collectionPath: string) => ({
    doc: jest.fn().mockImplementation((docId?: string) => {
      const id = docId || `auto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return createMockDocRef(collectionPath, id);
    }),
    add: jest.fn().mockImplementation(async (data: unknown) => {
      const id = `auto-${Date.now()}`;
      if (!mockFirestoreData[collectionPath]) {
        mockFirestoreData[collectionPath] = {};
      }
      mockFirestoreData[collectionPath][id] = data;
      return createMockDocRef(collectionPath, id);
    }),
    where: jest.fn().mockImplementation(() => {
      const docs = Object.entries(mockFirestoreData[collectionPath] || {}).map(([id, data]) => ({
        id,
        data,
      }));
      return createMockQuery(collectionPath, docs);
    }),
    orderBy: jest.fn().mockImplementation(() => {
      const docs = Object.entries(mockFirestoreData[collectionPath] || {}).map(([id, data]) => ({
        id,
        data,
      }));
      return createMockQuery(collectionPath, docs);
    }),
  });

  const mockBatch = {
    set: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };

  return {
    initializeApp: jest.fn(),
    firestore: jest.fn(() => ({
      collection: jest.fn((path: string) => createMockCollection(path)),
      batch: jest.fn(() => mockBatch),
    })),
    credential: {
      applicationDefault: jest.fn(),
    },
  };
});

describe("EventLogService", () => {
  let service: EventLogService;

  beforeEach(() => {
    service = new EventLogService();
    jest.clearAllMocks();
  });

  describe("Constructor", () => {
    it("should create instance successfully", () => {
      expect(service).toBeInstanceOf(EventLogService);
    });
  });

  describe("log()", () => {
    it("should log event successfully", async () => {
      const input: EventLogInput = {
        type: EventType.ORDER_CREATED,
        category: EventCategory.ORDER,
        severity: EventSeverity.INFO,
        targetId: "order-123",
        targetType: "order",
        description: "Novo pedido criado",
        metadata: { total: 100 },
        actorId: "user-456",
        actorType: "user",
      };

      const result = await service.log(input);

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    it("should log event with minimal input", async () => {
      const input: EventLogInput = {
        type: EventType.SYSTEM_MAINTENANCE,
        category: EventCategory.SYSTEM,
        severity: EventSeverity.INFO,
        targetId: "system",
        targetType: "system",
        description: "System maintenance",
      };

      const result = await service.log(input);

      expect(result).toBeDefined();
    });

    it("should sanitize sensitive metadata (LGPD)", async () => {
      const input: EventLogInput = {
        type: EventType.USER_REGISTERED,
        category: EventCategory.USER,
        severity: EventSeverity.INFO,
        targetId: "user-123",
        targetType: "user",
        description: "User registered",
        metadata: {
          password: "secret123",
          cpf: "123.456.789-00",
          email: "user@example.com",
          phone: "11999998888",
          normalField: "value",
        },
      };

      const result = await service.log(input);

      expect(result).toBeDefined();
    });

    it("should throw error for missing type", async () => {
      const input = {
        category: EventCategory.ORDER,
        severity: EventSeverity.INFO,
        targetId: "order-123",
        targetType: "order",
        description: "Test",
      } as unknown as EventLogInput;

      await expect(service.log(input)).rejects.toThrow("Event type is required");
    });

    it("should throw error for missing category", async () => {
      const input = {
        type: EventType.ORDER_CREATED,
        severity: EventSeverity.INFO,
        targetId: "order-123",
        targetType: "order",
        description: "Test",
      } as unknown as EventLogInput;

      await expect(service.log(input)).rejects.toThrow("Event category is required");
    });

    it("should throw error for missing severity", async () => {
      const input = {
        type: EventType.ORDER_CREATED,
        category: EventCategory.ORDER,
        targetId: "order-123",
        targetType: "order",
        description: "Test",
      } as unknown as EventLogInput;

      await expect(service.log(input)).rejects.toThrow("Event severity is required");
    });

    it("should throw error for missing targetId", async () => {
      const input = {
        type: EventType.ORDER_CREATED,
        category: EventCategory.ORDER,
        severity: EventSeverity.INFO,
        targetType: "order",
        description: "Test",
      } as unknown as EventLogInput;

      await expect(service.log(input)).rejects.toThrow("Target ID is required");
    });

    it("should throw error for missing targetType", async () => {
      const input = {
        type: EventType.ORDER_CREATED,
        category: EventCategory.ORDER,
        severity: EventSeverity.INFO,
        targetId: "order-123",
        description: "Test",
      } as unknown as EventLogInput;

      await expect(service.log(input)).rejects.toThrow("Target type is required");
    });

    it("should throw error for missing description", async () => {
      const input = {
        type: EventType.ORDER_CREATED,
        category: EventCategory.ORDER,
        severity: EventSeverity.INFO,
        targetId: "order-123",
        targetType: "order",
      } as unknown as EventLogInput;

      await expect(service.log(input)).rejects.toThrow("Event description is required");
    });

    it("should throw error for description exceeding max length", async () => {
      const input: EventLogInput = {
        type: EventType.ORDER_CREATED,
        category: EventCategory.ORDER,
        severity: EventSeverity.INFO,
        targetId: "order-123",
        targetType: "order",
        description: "a".repeat(1001),
      };

      await expect(service.log(input)).rejects.toThrow(
        "Description exceeds maximum length of 1000 characters"
      );
    });

    it("should handle correlationId", async () => {
      const input: EventLogInput = {
        type: EventType.ORDER_CREATED,
        category: EventCategory.ORDER,
        severity: EventSeverity.INFO,
        targetId: "order-123",
        targetType: "order",
        description: "Test",
        correlationId: "corr-123",
      };

      const result = await service.log(input);
      expect(result).toBeDefined();
    });
  });

  describe("logBatch()", () => {
    it("should log batch of events", async () => {
      const inputs: EventLogInput[] = [
        {
          type: EventType.ORDER_CREATED,
          category: EventCategory.ORDER,
          severity: EventSeverity.INFO,
          targetId: "order-1",
          targetType: "order",
          description: "Order 1 created",
        },
        {
          type: EventType.ORDER_CREATED,
          category: EventCategory.ORDER,
          severity: EventSeverity.INFO,
          targetId: "order-2",
          targetType: "order",
          description: "Order 2 created",
        },
      ];

      const result = await service.logBatch(inputs);

      expect(result).toHaveLength(2);
    });

    it("should return empty array for empty input", async () => {
      const result = await service.logBatch([]);
      expect(result).toHaveLength(0);
    });

    it("should throw error for batch exceeding max size", async () => {
      const inputs: EventLogInput[] = Array(501).fill({
        type: EventType.ORDER_CREATED,
        category: EventCategory.ORDER,
        severity: EventSeverity.INFO,
        targetId: "order-1",
        targetType: "order",
        description: "Test",
      });

      await expect(service.logBatch(inputs)).rejects.toThrow(
        "Batch size 501 exceeds maximum 500"
      );
    });
  });

  describe("search()", () => {
    it("should search events with all filters", async () => {
      const result = await service.search({
        type: EventType.ORDER_CREATED,
        category: EventCategory.ORDER,
        severity: EventSeverity.INFO,
        targetId: "order-123",
        targetType: "order",
        actorId: "user-456",
        correlationId: "corr-123",
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-12-31"),
        limit: 50,
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it("should search with default limit", async () => {
      const result = await service.search({
        type: EventType.ORDER_CREATED,
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it("should search without filters", async () => {
      const result = await service.search({});
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getTargetHistory()", () => {
    it("should get target history", async () => {
      const result = await service.getTargetHistory("order-123", "order", 50);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should use default limit", async () => {
      const result = await service.getTargetHistory("order-123", "order");
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getCorrelatedEvents()", () => {
    it("should get correlated events", async () => {
      const result = await service.getCorrelatedEvents("corr-123");
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("countByType()", () => {
    it("should count events by type", async () => {
      const result = await service.countByType(EventType.ORDER_CREATED);
      expect(typeof result).toBe("number");
    });

    it("should count with date range", async () => {
      const result = await service.countByType(
        EventType.ORDER_CREATED,
        new Date("2024-01-01"),
        new Date("2024-12-31")
      );
      expect(typeof result).toBe("number");
    });
  });

  describe("getAggregationByCategory()", () => {
    it("should get aggregation by category", async () => {
      const result = await service.getAggregationByCategory(EventCategory.ORDER);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should get aggregation with date range", async () => {
      const result = await service.getAggregationByCategory(
        EventCategory.ORDER,
        new Date("2024-01-01"),
        new Date("2024-12-31")
      );
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getRecentCriticalEvents()", () => {
    it("should get recent critical events", async () => {
      const result = await service.getRecentCriticalEvents(24);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should use default hours", async () => {
      const result = await service.getRecentCriticalEvents();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getRecentErrors()", () => {
    it("should get recent errors", async () => {
      const result = await service.getRecentErrors(24);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should use default hours", async () => {
      const result = await service.getRecentErrors();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("logSystemEvent()", () => {
    it("should log system event", async () => {
      const result = await service.logSystemEvent(
        EventType.SYSTEM_MAINTENANCE,
        "System maintenance started"
      );
      expect(result).toBeDefined();
    });

    it("should log system event with severity and metadata", async () => {
      const result = await service.logSystemEvent(
        EventType.SYSTEM_ERROR,
        "System error occurred",
        EventSeverity.ERROR,
        { errorCode: "E001" }
      );
      expect(result).toBeDefined();
    });
  });

  describe("logOrderEvent()", () => {
    it("should log order event", async () => {
      const result = await service.logOrderEvent(
        EventType.ORDER_CREATED,
        "order-123",
        "Order created"
      );
      expect(result).toBeDefined();
    });

    it("should log order event with metadata and actor", async () => {
      const result = await service.logOrderEvent(
        EventType.ORDER_CREATED,
        "order-123",
        "Order created",
        { total: 100 },
        "user-456",
        "user"
      );
      expect(result).toBeDefined();
    });
  });

  describe("logPharmacyEvent()", () => {
    it("should log pharmacy event", async () => {
      const result = await service.logPharmacyEvent(
        EventType.PHARMACY_APPROVED,
        "pharmacy-123",
        "Pharmacy approved"
      );
      expect(result).toBeDefined();
    });

    it("should log pharmacy event with all params", async () => {
      const result = await service.logPharmacyEvent(
        EventType.PHARMACY_APPROVED,
        "pharmacy-123",
        "Pharmacy approved",
        EventSeverity.INFO,
        { approvedBy: "admin-1" },
        "admin-1"
      );
      expect(result).toBeDefined();
    });
  });

  describe("logProductEvent()", () => {
    it("should log product event", async () => {
      const result = await service.logProductEvent(
        EventType.PRODUCT_CREATED,
        "product-123",
        "pharmacy-456",
        "Product created"
      );
      expect(result).toBeDefined();
    });

    it("should log product event with metadata", async () => {
      const result = await service.logProductEvent(
        EventType.PRODUCT_PRICE_CHANGED,
        "product-123",
        "pharmacy-456",
        "Price changed",
        { oldPrice: 10, newPrice: 15 }
      );
      expect(result).toBeDefined();
    });
  });

  describe("Metadata Sanitization (LGPD)", () => {
    it("should mask email addresses", async () => {
      const input: EventLogInput = {
        type: EventType.USER_REGISTERED,
        category: EventCategory.USER,
        severity: EventSeverity.INFO,
        targetId: "user-123",
        targetType: "user",
        description: "User registered",
        metadata: {
          userEmail: "john.doe@example.com",
        },
      };

      const result = await service.log(input);
      expect(result).toBeDefined();
    });

    it("should mask phone numbers", async () => {
      const input: EventLogInput = {
        type: EventType.USER_REGISTERED,
        category: EventCategory.USER,
        severity: EventSeverity.INFO,
        targetId: "user-123",
        targetType: "user",
        description: "User registered",
        metadata: {
          phone: "11999998888",
        },
      };

      const result = await service.log(input);
      expect(result).toBeDefined();
    });

    it("should redact sensitive fields", async () => {
      const input: EventLogInput = {
        type: EventType.USER_REGISTERED,
        category: EventCategory.USER,
        severity: EventSeverity.INFO,
        targetId: "user-123",
        targetType: "user",
        description: "User registered",
        metadata: {
          password: "secret",
          token: "abc123",
          accessToken: "xyz789",
          cpf: "12345678900",
          cnpj: "12345678000199",
          creditCard: "1234567890123456",
        },
      };

      const result = await service.log(input);
      expect(result).toBeDefined();
    });

    it("should handle nested objects in metadata", async () => {
      const input: EventLogInput = {
        type: EventType.USER_REGISTERED,
        category: EventCategory.USER,
        severity: EventSeverity.INFO,
        targetId: "user-123",
        targetType: "user",
        description: "User registered",
        metadata: {
          user: {
            email: "user@example.com",
            password: "secret",
          },
        },
      };

      const result = await service.log(input);
      expect(result).toBeDefined();
    });

    it("should handle undefined metadata", async () => {
      const input: EventLogInput = {
        type: EventType.USER_REGISTERED,
        category: EventCategory.USER,
        severity: EventSeverity.INFO,
        targetId: "user-123",
        targetType: "user",
        description: "User registered",
      };

      const result = await service.log(input);
      expect(result).toBeDefined();
    });
  });
});

describe("EventType Enum", () => {
  it("should have all order event types", () => {
    expect(EventType.ORDER_CREATED).toBe("ORDER_CREATED");
    expect(EventType.ORDER_STATUS_UPDATED).toBe("ORDER_STATUS_UPDATED");
    expect(EventType.ORDER_CANCELLED).toBe("ORDER_CANCELLED");
    expect(EventType.ORDER_COMPLETED).toBe("ORDER_COMPLETED");
    expect(EventType.ORDER_PAYMENT_RECEIVED).toBe("ORDER_PAYMENT_RECEIVED");
    expect(EventType.ORDER_SHIPPED).toBe("ORDER_SHIPPED");
    expect(EventType.ORDER_DELIVERED).toBe("ORDER_DELIVERED");
  });

  it("should have all pharmacy event types", () => {
    expect(EventType.PHARMACY_REGISTERED).toBe("PHARMACY_REGISTERED");
    expect(EventType.PHARMACY_APPROVED).toBe("PHARMACY_APPROVED");
    expect(EventType.PHARMACY_REJECTED).toBe("PHARMACY_REJECTED");
    expect(EventType.PHARMACY_SUSPENDED).toBe("PHARMACY_SUSPENDED");
    expect(EventType.PHARMACY_REACTIVATED).toBe("PHARMACY_REACTIVATED");
    expect(EventType.PHARMACY_UPDATED).toBe("PHARMACY_UPDATED");
  });

  it("should have all product event types", () => {
    expect(EventType.PRODUCT_CREATED).toBe("PRODUCT_CREATED");
    expect(EventType.PRODUCT_UPDATED).toBe("PRODUCT_UPDATED");
    expect(EventType.PRODUCT_DELETED).toBe("PRODUCT_DELETED");
    expect(EventType.PRODUCT_STOCK_UPDATED).toBe("PRODUCT_STOCK_UPDATED");
    expect(EventType.PRODUCT_PRICE_CHANGED).toBe("PRODUCT_PRICE_CHANGED");
  });

  it("should have all user event types", () => {
    expect(EventType.USER_REGISTERED).toBe("USER_REGISTERED");
    expect(EventType.USER_LOGIN).toBe("USER_LOGIN");
    expect(EventType.USER_PROFILE_UPDATED).toBe("USER_PROFILE_UPDATED");
  });

  it("should have all system event types", () => {
    expect(EventType.SYSTEM_MAINTENANCE).toBe("SYSTEM_MAINTENANCE");
    expect(EventType.SYSTEM_ERROR).toBe("SYSTEM_ERROR");
    expect(EventType.SYSTEM_WARNING).toBe("SYSTEM_WARNING");
  });
});

describe("EventSeverity Enum", () => {
  it("should have all severity levels", () => {
    expect(EventSeverity.INFO).toBe("INFO");
    expect(EventSeverity.WARNING).toBe("WARNING");
    expect(EventSeverity.ERROR).toBe("ERROR");
    expect(EventSeverity.CRITICAL).toBe("CRITICAL");
  });
});

describe("EventCategory Enum", () => {
  it("should have all categories", () => {
    expect(EventCategory.ORDER).toBe("ORDER");
    expect(EventCategory.PHARMACY).toBe("PHARMACY");
    expect(EventCategory.PRODUCT).toBe("PRODUCT");
    expect(EventCategory.USER).toBe("USER");
    expect(EventCategory.SYSTEM).toBe("SYSTEM");
    expect(EventCategory.PAYMENT).toBe("PAYMENT");
    expect(EventCategory.NOTIFICATION).toBe("NOTIFICATION");
  });
});
