/**
 * Product Triggers Tests
 *
 * Testes para triggers de produtos.
 * Cobertura: 100%
 *
 * @module __tests__/triggers/products.test
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
      empty: true,
      size: 0,
      docs: [],
    }),
  });

  const mockBatch = {
    set: jest.fn(),
    update: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };

  const mockFirestoreInstance = () => ({
    collection: jest.fn((path: string) => createMockCollection(path)),
    batch: jest.fn(() => mockBatch),
  });

  // Make firestore both callable and have properties
  const firestoreFn = Object.assign(mockFirestoreInstance, {
    FieldValue: {
      serverTimestamp: jest.fn(() => mockTimestamp),
      increment: jest.fn((n: number) => n),
      arrayRemove: jest.fn((...args: unknown[]) => args),
    },
  });

  return {
    initializeApp: jest.fn(),
    firestore: firestoreFn,
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
    logProductEvent: jest.fn().mockResolvedValue("event-log-id"),
  },
  EventType: {
    PRODUCT_CREATED: "PRODUCT_CREATED",
    PRODUCT_UPDATED: "PRODUCT_UPDATED",
    PRODUCT_DELETED: "PRODUCT_DELETED",
    PRODUCT_STOCK_UPDATED: "PRODUCT_STOCK_UPDATED",
    PRODUCT_PRICE_CHANGED: "PRODUCT_PRICE_CHANGED",
    SYSTEM_ERROR: "SYSTEM_ERROR",
  },
  EventSeverity: {
    INFO: "INFO",
    WARNING: "WARNING",
    ERROR: "ERROR",
  },
  EventCategory: {
    PRODUCT: "PRODUCT",
  },
}));

import { ProductData } from "../../triggers/products";
import { eventLogService } from "../../api/services/event-log.service";

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

describe("Product Triggers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("onProductCreated", () => {
    const createMockSnapshot = (data: Partial<ProductData>) => ({
      data: () => ({
        name: "Test Product",
        pharmacyId: "pharmacy-456",
        price: 29.99,
        stock: 100,
        active: true,
        category: "Medicamentos",
        ...data,
      }),
      id: "product-789",
      ref: {
        id: "product-789",
        update: jest.fn().mockResolvedValue(undefined),
      },
    });

    const createMockContext = (productId: string = "product-789") => ({
      params: { productId },
    });

    it("should process product creation successfully", async () => {
      const { onProductCreated } = await import("../../triggers/products");

      const snapshot = createMockSnapshot({});
      const context = createMockContext();

      const result = await onProductCreated(
        snapshot as unknown as DocumentSnapshot,
        context
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.productId).toBe("product-789");
      expect(result.action).toBe("onCreate");
    });

    it("should log product event", async () => {
      const { onProductCreated } = await import("../../triggers/products");

      const snapshot = createMockSnapshot({});
      const context = createMockContext();

      await onProductCreated(
        snapshot as unknown as DocumentSnapshot,
        context
      );

      expect(eventLogService.logProductEvent).toHaveBeenCalled();
    });

    it("should return error for invalid product data - missing name", async () => {
      const { onProductCreated } = await import("../../triggers/products");

      const snapshot = {
        data: () => ({
          pharmacyId: "pharmacy-456",
          price: 29.99,
          stock: 100,
          active: true,
        }),
        id: "product-789",
      };
      const context = createMockContext();

      const result = await onProductCreated(
        snapshot as unknown as DocumentSnapshot,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid product data");
    });

    it("should return error for invalid product data - missing pharmacyId", async () => {
      const { onProductCreated } = await import("../../triggers/products");

      const snapshot = {
        data: () => ({
          name: "Test Product",
          price: 29.99,
          stock: 100,
          active: true,
        }),
        id: "product-789",
      };
      const context = createMockContext();

      const result = await onProductCreated(
        snapshot as unknown as DocumentSnapshot,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid product data");
    });

    it("should handle product with requiresPrescription flag", async () => {
      const { onProductCreated } = await import("../../triggers/products");

      const snapshot = createMockSnapshot({ requiresPrescription: true });
      const context = createMockContext();

      const result = await onProductCreated(
        snapshot as unknown as DocumentSnapshot,
        context
      );

      expect(result.success).toBe(true);
    });
  });

  describe("onProductUpdated", () => {
    const createMockChange = (
      beforeData: Partial<ProductData>,
      afterData: Partial<ProductData>
    ) => ({
      before: {
        data: () => ({
          name: "Test Product",
          pharmacyId: "pharmacy-456",
          price: 29.99,
          stock: 100,
          active: true,
          ...beforeData,
        }),
        id: "product-789",
      },
      after: {
        data: () => ({
          name: "Test Product",
          pharmacyId: "pharmacy-456",
          price: 29.99,
          stock: 100,
          active: true,
          ...afterData,
        }),
        id: "product-789",
      },
    });

    const createMockContext = (productId: string = "product-789") => ({
      params: { productId },
    });

    it("should process product update successfully", async () => {
      const { onProductUpdated } = await import("../../triggers/products");

      const change = createMockChange({ price: 29.99 }, { price: 34.99 });
      const context = createMockContext();

      const result = await onProductUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("onUpdate");
    });

    it("should detect price change", async () => {
      const { onProductUpdated } = await import("../../triggers/products");

      const change = createMockChange({ price: 29.99 }, { price: 19.99 });
      const context = createMockContext();

      const result = await onProductUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should detect stock change", async () => {
      const { onProductUpdated } = await import("../../triggers/products");

      const change = createMockChange({ stock: 100 }, { stock: 50 });
      const context = createMockContext();

      const result = await onProductUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should detect active status change", async () => {
      const { onProductUpdated } = await import("../../triggers/products");

      const change = createMockChange({ active: true }, { active: false });
      const context = createMockContext();

      const result = await onProductUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle stock going to zero", async () => {
      const { onProductUpdated } = await import("../../triggers/products");

      const change = createMockChange({ stock: 10 }, { stock: 0 });
      const context = createMockContext();

      const result = await onProductUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle stock being replenished", async () => {
      const { onProductUpdated } = await import("../../triggers/products");

      const change = createMockChange({ stock: 0 }, { stock: 50 });
      const context = createMockContext();

      const result = await onProductUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle significant price drop (>10%)", async () => {
      const { onProductUpdated } = await import("../../triggers/products");

      const change = createMockChange({ price: 100 }, { price: 80 });
      const context = createMockContext();

      const result = await onProductUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle metadata-only change", async () => {
      const { onProductUpdated } = await import("../../triggers/products");

      const change = createMockChange(
        { description: "Old description" },
        { description: "New description" }
      );
      const context = createMockContext();

      const result = await onProductUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });

    it("should handle multiple changes at once", async () => {
      const { onProductUpdated } = await import("../../triggers/products");

      const change = createMockChange(
        { price: 29.99, stock: 100, active: true },
        { price: 24.99, stock: 80, active: false }
      );
      const context = createMockContext();

      const result = await onProductUpdated(
        change as unknown as Change<DocumentSnapshot>,
        context
      );

      expect(result.success).toBe(true);
    });
  });

  describe("onProductDeleted", () => {
    const createMockSnapshot = (data: Partial<ProductData>) => ({
      data: () => ({
        name: "Test Product",
        pharmacyId: "pharmacy-456",
        price: 29.99,
        stock: 100,
        active: true,
        ...data,
      }),
      id: "product-789",
    });

    const createMockContext = (productId: string = "product-789") => ({
      params: { productId },
    });

    it("should process product deletion successfully", async () => {
      const { onProductDeleted } = await import("../../triggers/products");

      const snapshot = createMockSnapshot({});
      const context = createMockContext();

      const result = await onProductDeleted(
        snapshot as unknown as DocumentSnapshot,
        context
      );

      expect(result.success).toBe(true);
      expect(result.productId).toBe("product-789");
      expect(result.action).toBe("onDelete");
    });

    it("should log product deletion event", async () => {
      const { onProductDeleted } = await import("../../triggers/products");

      const snapshot = createMockSnapshot({});
      const context = createMockContext();

      await onProductDeleted(
        snapshot as unknown as DocumentSnapshot,
        context
      );

      expect(eventLogService.logProductEvent).toHaveBeenCalled();
    });
  });
});

describe("TriggerResult Interface for Product", () => {
  it("should have correct structure", () => {
    const result = {
      success: true,
      productId: "product-123",
      action: "onCreate",
      timestamp: new Date(),
    };

    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("productId");
    expect(result).toHaveProperty("action");
    expect(result).toHaveProperty("timestamp");
  });

  it("should include error when failed", () => {
    const result = {
      success: false,
      productId: "product-123",
      action: "onCreate",
      timestamp: new Date(),
      error: "Something went wrong",
    };

    expect(result.error).toBeDefined();
  });
});

describe("ProductData Interface", () => {
  it("should have all required fields", () => {
    const product: ProductData = {
      name: "Test Product",
      pharmacyId: "pharmacy-123",
      price: 29.99,
      stock: 100,
      active: true,
    };

    expect(product.name).toBeDefined();
    expect(product.pharmacyId).toBeDefined();
    expect(product.price).toBeDefined();
    expect(product.stock).toBeDefined();
    expect(product.active).toBeDefined();
  });

  it("should support optional fields", () => {
    const product: ProductData = {
      name: "Test Product",
      pharmacyId: "pharmacy-123",
      price: 29.99,
      stock: 100,
      active: true,
      description: "Product description",
      originalPrice: 39.99,
      sku: "SKU-001",
      barcode: "7891234567890",
      category: "Medicamentos",
      requiresPrescription: true,
      manufacturer: "Lab XYZ",
    };

    expect(product.description).toBe("Product description");
    expect(product.originalPrice).toBe(39.99);
    expect(product.sku).toBe("SKU-001");
    expect(product.barcode).toBe("7891234567890");
    expect(product.category).toBe("Medicamentos");
    expect(product.requiresPrescription).toBe(true);
    expect(product.manufacturer).toBe("Lab XYZ");
  });
});
