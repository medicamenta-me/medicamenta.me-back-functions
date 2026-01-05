/**
 * Jest Global Setup
 * Configuração global para todos os testes
 * - Inicializa Firebase Admin com mocks
 * - Define variáveis de ambiente para testes
 * - Configura mocks globais do Firestore
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Configurações de ambiente ANTES de qualquer import do Firebase
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Configurações de teste para PagSeguro
process.env.PAGSEGURO_EMAIL = "test@pagseguro.com";
process.env.PAGSEGURO_TOKEN = "test-token-123456";
process.env.PAGSEGURO_ENVIRONMENT = "sandbox";

// Configurações de teste para Stripe
process.env.STRIPE_SECRET_KEY = "sk_test_mock_key";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

// Configurações de teste para Google Cloud Vision
process.env.GOOGLE_CLOUD_PROJECT = "test-project";

// In-memory store para simular Firestore
const mockFirestoreData: Record<string, Record<string, any>> = {};

// Helper functions para o mock store
function getCollectionData(collection: string): Record<string, any> {
  if (!mockFirestoreData[collection]) {
    mockFirestoreData[collection] = {};
  }
  return mockFirestoreData[collection];
}

function clearMockData(): void {
  Object.keys(mockFirestoreData).forEach((key) => {
    delete mockFirestoreData[key];
  });
}

// Helper para set nested value
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

// Mock DocumentReference
const createMockDocRef = (collectionPath: string, docId: string): any => ({
  id: docId,
  path: `${collectionPath}/${docId}`,
  get: jest.fn().mockImplementation(async () => {
    const data = getCollectionData(collectionPath)[docId];
    return {
      exists: !!data,
      data: () => data ? JSON.parse(JSON.stringify(data)) : null,
      id: docId,
      ref: createMockDocRef(collectionPath, docId),
    };
  }),
  set: jest.fn().mockImplementation(async (data: any, options?: any) => {
    const collectionData = getCollectionData(collectionPath);
    if (options?.merge) {
      collectionData[docId] = { ...collectionData[docId], ...data };
    } else {
      collectionData[docId] = { ...data };
    }
    return Promise.resolve();
  }),
  update: jest.fn().mockImplementation(async (data: any) => {
    const collectionData = getCollectionData(collectionPath);
    if (!collectionData[docId]) {
      throw new Error(`Document ${docId} does not exist`);
    }
    // Suporte para campos aninhados com dot notation
    Object.entries(data).forEach(([key, value]) => {
      if (key.includes(".")) {
        setNestedValue(collectionData[docId], key, value);
      } else {
        collectionData[docId][key] = value;
      }
    });
    return Promise.resolve();
  }),
  delete: jest.fn().mockImplementation(async () => {
    const collectionData = getCollectionData(collectionPath);
    delete collectionData[docId];
    return Promise.resolve();
  }),
  collection: (subCollectionPath: string) => createMockCollection(`${collectionPath}/${docId}/${subCollectionPath}`),
});

// Mock Query
const createMockQuery = (collectionPath: string, docs: any[]): any => ({
  get: jest.fn().mockImplementation(async () => ({
    empty: docs.length === 0,
    size: docs.length,
    docs: docs.map((doc) => ({
      id: doc.id,
      data: () => doc.data,
      ref: createMockDocRef(collectionPath, doc.id),
      exists: true,
    })),
    forEach: (callback: (doc: any) => void) => {
      docs.forEach((doc) =>
        callback({
          id: doc.id,
          data: () => doc.data,
          ref: createMockDocRef(collectionPath, doc.id),
          exists: true,
        })
      );
    },
  })),
  where: jest.fn().mockImplementation((field: string, op: string, value: any) => {
    const filteredDocs = docs.filter((doc) => {
      const fieldValue = doc.data[field];
      switch (op) {
        case "==":
          return fieldValue === value;
        case "!=":
          return fieldValue !== value;
        case "<":
          return fieldValue < value;
        case "<=":
          return fieldValue <= value;
        case ">":
          return fieldValue > value;
        case ">=":
          return fieldValue >= value;
        case "array-contains":
          return Array.isArray(fieldValue) && fieldValue.includes(value);
        case "in":
          return Array.isArray(value) && value.includes(fieldValue);
        default:
          return true;
      }
    });
    return createMockQuery(collectionPath, filteredDocs);
  }),
  orderBy: jest.fn().mockImplementation(() => {
    return createMockQuery(collectionPath, docs);
  }),
  limit: jest.fn().mockImplementation((n: number) => {
    return createMockQuery(collectionPath, docs.slice(0, n));
  }),
  offset: jest.fn().mockImplementation((n: number) => {
    return createMockQuery(collectionPath, docs.slice(n));
  }),
  startAfter: jest.fn().mockReturnThis(),
  endBefore: jest.fn().mockReturnThis(),
});

// Mock CollectionReference
const createMockCollection = (collectionPath: string): any => {
  const collectionRef: any = {
    id: collectionPath.split("/").pop(),
    path: collectionPath,
    doc: jest.fn().mockImplementation((docId?: string) => {
      const id = docId || `auto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return createMockDocRef(collectionPath, id);
    }),
    add: jest.fn().mockImplementation(async (data: any) => {
      const id = `auto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const collectionData = getCollectionData(collectionPath);
      collectionData[id] = { ...data };
      return createMockDocRef(collectionPath, id);
    }),
    get: jest.fn().mockImplementation(async () => {
      const collectionData = getCollectionData(collectionPath);
      const docs = Object.entries(collectionData).map(([id, data]) => ({
        id,
        data,
      }));
      return {
        empty: docs.length === 0,
        size: docs.length,
        docs: docs.map((doc) => ({
          id: doc.id,
          data: () => doc.data,
          ref: createMockDocRef(collectionPath, doc.id),
          exists: true,
        })),
        forEach: (callback: (doc: any) => void) => {
          docs.forEach((doc) =>
            callback({
              id: doc.id,
              data: () => doc.data,
              ref: createMockDocRef(collectionPath, doc.id),
              exists: true,
            })
          );
        },
      };
    }),
    where: jest.fn().mockImplementation((field: string, op: string, value: any) => {
      const collectionData = getCollectionData(collectionPath);
      const docs = Object.entries(collectionData)
        .map(([id, data]) => ({ id, data }))
        .filter((doc) => {
          const fieldValue = doc.data[field];
          switch (op) {
            case "==":
              return fieldValue === value;
            case "!=":
              return fieldValue !== value;
            case "<":
              return fieldValue < value;
            case "<=":
              return fieldValue <= value;
            case ">":
              return fieldValue > value;
            case ">=":
              return fieldValue >= value;
            case "array-contains":
              return Array.isArray(fieldValue) && fieldValue.includes(value);
            case "in":
              return Array.isArray(value) && value.includes(fieldValue);
            default:
              return true;
          }
        });
      return createMockQuery(collectionPath, docs);
    }),
    orderBy: jest.fn().mockImplementation(() => {
      const collectionData = getCollectionData(collectionPath);
      const docs = Object.entries(collectionData).map(([id, data]) => ({ id, data }));
      return createMockQuery(collectionPath, docs);
    }),
    limit: jest.fn().mockImplementation((n: number) => {
      const collectionData = getCollectionData(collectionPath);
      const docs = Object.entries(collectionData)
        .map(([id, data]) => ({ id, data }))
        .slice(0, n);
      return createMockQuery(collectionPath, docs);
    }),
    offset: jest.fn().mockImplementation((n: number) => {
      const collectionData = getCollectionData(collectionPath);
      const docs = Object.entries(collectionData)
        .map(([id, data]) => ({ id, data }))
        .slice(n);
      return createMockQuery(collectionPath, docs);
    }),
  };
  return collectionRef;
};

// Mock Batch
const createMockBatch = (): any => {
  const operations: (() => Promise<void>)[] = [];
  return {
    set: jest.fn().mockImplementation((docRef: any, data: any, options?: any) => {
      operations.push(() => docRef.set(data, options));
    }),
    update: jest.fn().mockImplementation((docRef: any, data: any) => {
      operations.push(() => docRef.update(data));
    }),
    delete: jest.fn().mockImplementation((docRef: any) => {
      operations.push(() => docRef.delete());
    }),
    commit: jest.fn().mockImplementation(async () => {
      await Promise.all(operations.map((op) => op()));
    }),
  };
};

// Mock Firestore
const mockFirestore = jest.fn().mockImplementation(() => ({
  collection: (path: string) => createMockCollection(path),
  doc: (path: string) => {
    const parts = path.split("/");
    const docId = parts.pop()!;
    const collectionPath = parts.join("/");
    return createMockDocRef(collectionPath, docId);
  },
  batch: () => createMockBatch(),
  runTransaction: jest.fn().mockImplementation(async (callback: any) => {
    const transaction = {
      get: async (docRef: any) => docRef.get(),
      set: (docRef: any, data: any, options?: any) => docRef.set(data, options),
      update: (docRef: any, data: any) => docRef.update(data),
      delete: (docRef: any) => docRef.delete(),
    };
    return callback(transaction);
  }),
}));

// Mock Firebase Admin
jest.mock("firebase-admin", () => {
  const originalModule = jest.requireActual("firebase-admin");
  return {
    ...originalModule,
    apps: [{ name: "test-app" }],
    initializeApp: jest.fn().mockReturnValue({ name: "test-app" }),
    firestore: Object.assign(mockFirestore, {
      FieldValue: {
        serverTimestamp: jest.fn().mockReturnValue(new Date().toISOString()),
        increment: jest.fn().mockImplementation((n: number) => ({ _increment: n })),
        arrayUnion: jest.fn().mockImplementation((...elements: any[]) => ({ _arrayUnion: elements })),
        arrayRemove: jest.fn().mockImplementation((...elements: any[]) => ({ _arrayRemove: elements })),
        delete: jest.fn().mockReturnValue({ _delete: true }),
      },
      Timestamp: {
        now: jest.fn().mockReturnValue({ toDate: () => new Date(), seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }),
        fromDate: jest.fn().mockImplementation((date: Date) => ({
          toDate: () => date,
          seconds: Math.floor(date.getTime() / 1000),
          nanoseconds: 0,
        })),
      },
    }),
    auth: jest.fn().mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: "test-user", email: "test@test.com" }),
      getUser: jest.fn().mockResolvedValue({ uid: "test-user", email: "test@test.com" }),
      createUser: jest.fn().mockResolvedValue({ uid: "new-user" }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    }),
    storage: jest.fn().mockReturnValue({
      bucket: jest.fn().mockReturnValue({
        file: jest.fn().mockReturnValue({
          save: jest.fn().mockResolvedValue(undefined),
          delete: jest.fn().mockResolvedValue(undefined),
          getSignedUrl: jest.fn().mockResolvedValue(["https://mock-signed-url.com"]),
        }),
      }),
    }),
  };
});

// Exporta utilitários para uso nos testes
export { clearMockData, getCollectionData, mockFirestoreData };

// Limpa dados mock antes de cada teste
beforeEach(() => {
  clearMockData();
});

// Log de confirmação (apenas para debug em modo verbose)
if (process.env.JEST_VERBOSE === "true") {
  console.log("✅ Jest Setup: Firebase Admin mockado com in-memory store");
  console.log("   - Firestore: In-memory mock");
  console.log("   - Auth: Mocked");
  console.log("   - Storage: Mocked");
}
