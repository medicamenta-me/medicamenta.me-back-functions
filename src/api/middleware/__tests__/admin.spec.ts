/**
 * 🧪 Admin Middleware Tests
 * 
 * Testes unitários para middleware de autenticação admin
 * Coverage target: 100% lines, branches, statements, functions
 * 
 * @module __tests__/middleware/admin.spec
 */

import { Request, Response, NextFunction } from "express";
import { 
  adminOnly, 
  requireRole, 
  requirePermission,
  AdminRole,
  AdminUser,
  ADMIN_PERMISSIONS 
} from "../admin";
import { ApiError } from "../../utils/api-error";

// Mock firebase-admin
const mockVerifyIdToken = jest.fn();
const mockFirestoreGet = jest.fn();
const mockFirestoreDoc = jest.fn(() => ({ get: mockFirestoreGet }));
const mockFirestoreCollection = jest.fn(() => ({ doc: mockFirestoreDoc }));

jest.mock("firebase-admin", () => ({
  auth: jest.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
  firestore: jest.fn(() => ({
    collection: mockFirestoreCollection,
  })),
}));

describe("Admin Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockReq = {
      headers: {},
      admin: undefined,
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe("adminOnly", () => {
    describe("✅ Cenários de Sucesso", () => {
      it("deve autenticar admin válido com token Bearer", async () => {
        // Arrange
        mockReq.headers = { authorization: "Bearer valid-token" };
        mockVerifyIdToken.mockResolvedValue({
          uid: "admin-123",
          email: "admin@test.com",
        });
        mockFirestoreGet.mockResolvedValue({
          exists: true,
          data: () => ({
            role: "admin",
            status: "active",
            email: "admin@test.com",
            permissions: ["view_orders", "manage_orders"],
          }),
        });

        // Act
        await adminOnly(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
        expect(mockReq.admin).toBeDefined();
        expect(mockReq.admin?.uid).toBe("admin-123");
        expect(mockReq.admin?.role).toBe("admin");
        expect(mockReq.admin?.permissions).toEqual(["view_orders", "manage_orders"]);
      });

      it("deve usar email do Firestore quando não há email no token", async () => {
        // Arrange
        mockReq.headers = { authorization: "Bearer valid-token" };
        mockVerifyIdToken.mockResolvedValue({
          uid: "admin-123",
          // email não definido no token
        });
        mockFirestoreGet.mockResolvedValue({
          exists: true,
          data: () => ({
            role: "super_admin",
            status: "active",
            email: "firestore-admin@test.com",
            permissions: [],
          }),
        });

        // Act
        await adminOnly(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockReq.admin?.email).toBe("firestore-admin@test.com");
      });

      it("deve incluir partnerId quando presente", async () => {
        // Arrange
        mockReq.headers = { authorization: "Bearer valid-token" };
        mockVerifyIdToken.mockResolvedValue({
          uid: "admin-123",
          email: "partner@test.com",
        });
        mockFirestoreGet.mockResolvedValue({
          exists: true,
          data: () => ({
            role: "moderator",
            status: "active",
            partnerId: "partner-456",
            permissions: [],
          }),
        });

        // Act
        await adminOnly(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockReq.admin?.partnerId).toBe("partner-456");
      });

      it("deve definir permissions como array vazio quando undefined", async () => {
        // Arrange
        mockReq.headers = { authorization: "Bearer valid-token" };
        mockVerifyIdToken.mockResolvedValue({
          uid: "admin-123",
          email: "admin@test.com",
        });
        mockFirestoreGet.mockResolvedValue({
          exists: true,
          data: () => ({
            role: "support",
            status: "active",
            // permissions undefined
          }),
        });

        // Act
        await adminOnly(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockReq.admin?.permissions).toEqual([]);
      });
    });

    describe("❌ Cenários de Erro", () => {
      it("deve retornar 401 se authorization header não existe", async () => {
        // Arrange
        mockReq.headers = {};

        // Act
        await adminOnly(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe("UNAUTHORIZED");
      });

      it("deve retornar 401 se scheme não é Bearer", async () => {
        // Arrange
        mockReq.headers = { authorization: "Basic some-token" };

        // Act
        await adminOnly(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe("UNAUTHORIZED");
      });

      it("deve retornar 401 se token não existe após Bearer", async () => {
        // Arrange
        mockReq.headers = { authorization: "Bearer " };

        // Act
        await adminOnly(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(401);
      });

      it("deve retornar 401 se verifyIdToken falha", async () => {
        // Arrange
        mockReq.headers = { authorization: "Bearer invalid-token" };
        mockVerifyIdToken.mockRejectedValue(new Error("Token expired"));

        // Act
        await adminOnly(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe("INVALID_TOKEN");
      });

      it("deve retornar 403 se usuário não é admin (doc não existe)", async () => {
        // Arrange
        mockReq.headers = { authorization: "Bearer valid-token" };
        mockVerifyIdToken.mockResolvedValue({
          uid: "user-123",
          email: "user@test.com",
        });
        mockFirestoreGet.mockResolvedValue({
          exists: false,
        });

        // Act
        await adminOnly(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe("FORBIDDEN");
      });

      it("deve retornar 403 se admin está suspenso", async () => {
        // Arrange
        mockReq.headers = { authorization: "Bearer valid-token" };
        mockVerifyIdToken.mockResolvedValue({
          uid: "admin-123",
          email: "admin@test.com",
        });
        mockFirestoreGet.mockResolvedValue({
          exists: true,
          data: () => ({
            role: "admin",
            status: "suspended",
          }),
        });

        // Act
        await adminOnly(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe("ACCOUNT_SUSPENDED");
      });

      it("deve retornar 403 se admin está inativo", async () => {
        // Arrange
        mockReq.headers = { authorization: "Bearer valid-token" };
        mockVerifyIdToken.mockResolvedValue({
          uid: "admin-123",
          email: "admin@test.com",
        });
        mockFirestoreGet.mockResolvedValue({
          exists: true,
          data: () => ({
            role: "admin",
            status: "inactive",
          }),
        });

        // Act
        await adminOnly(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe("ACCOUNT_SUSPENDED");
      });
    });
  });

  describe("requireRole", () => {
    describe("✅ Cenários de Sucesso", () => {
      it("deve permitir acesso para role permitida (super_admin)", async () => {
        // Arrange
        mockReq.admin = {
          uid: "admin-123",
          email: "admin@test.com",
          role: "super_admin",
          permissions: [],
        };
        const middleware = requireRole("super_admin", "admin");

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
      });

      it("deve permitir acesso para qualquer role na lista", async () => {
        // Arrange
        mockReq.admin = {
          uid: "admin-123",
          email: "admin@test.com",
          role: "moderator",
          permissions: [],
        };
        const middleware = requireRole("admin", "moderator", "support");

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
      });

      it("deve chamar adminOnly se req.admin não está definido e autenticar", async () => {
        // Arrange
        mockReq.headers = { authorization: "Bearer valid-token" };
        mockReq.admin = undefined;
        mockVerifyIdToken.mockResolvedValue({
          uid: "admin-123",
          email: "admin@test.com",
        });
        mockFirestoreGet.mockResolvedValue({
          exists: true,
          data: () => ({
            role: "admin",
            status: "active",
            permissions: [],
          }),
        });
        const middleware = requireRole("admin");

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
        expect(mockReq.admin?.role).toBe("admin");
      });
    });

    describe("❌ Cenários de Erro", () => {
      it("deve retornar 403 se role não está na lista permitida", async () => {
        // Arrange
        mockReq.admin = {
          uid: "admin-123",
          email: "admin@test.com",
          role: "support",
          permissions: [],
        };
        const middleware = requireRole("super_admin", "admin");

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe("INSUFFICIENT_PERMISSIONS");
        expect(error.message).toContain("super_admin, admin");
      });

      it("deve retornar 403 se autenticação falha (sem admin após adminOnly)", async () => {
        // Arrange
        mockReq.headers = {};
        mockReq.admin = undefined;
        const middleware = requireRole("admin");

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe("FORBIDDEN");
      });
    });
  });

  describe("requirePermission", () => {
    describe("✅ Cenários de Sucesso", () => {
      it("deve permitir acesso para super_admin (bypass de permissões)", async () => {
        // Arrange
        mockReq.admin = {
          uid: "admin-123",
          email: "admin@test.com",
          role: "super_admin",
          permissions: [], // mesmo sem permissões, super_admin tem acesso
        };
        const middleware = requirePermission("manage_orders", "process_refunds");

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
      });

      it("deve permitir acesso se admin tem todas as permissões requeridas", async () => {
        // Arrange
        mockReq.admin = {
          uid: "admin-123",
          email: "admin@test.com",
          role: "admin",
          permissions: ["view_orders", "manage_orders", "cancel_orders"],
        };
        const middleware = requirePermission("view_orders", "manage_orders");

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
      });

      it("deve permitir acesso com uma única permissão", async () => {
        // Arrange
        mockReq.admin = {
          uid: "admin-123",
          email: "admin@test.com",
          role: "moderator",
          permissions: ["view_pharmacies"],
        };
        const middleware = requirePermission("view_pharmacies");

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
      });

      it("deve chamar adminOnly se req.admin não está definido e autenticar", async () => {
        // Arrange
        mockReq.headers = { authorization: "Bearer valid-token" };
        mockReq.admin = undefined;
        mockVerifyIdToken.mockResolvedValue({
          uid: "admin-123",
          email: "admin@test.com",
        });
        mockFirestoreGet.mockResolvedValue({
          exists: true,
          data: () => ({
            role: "admin",
            status: "active",
            permissions: ["view_orders"],
          }),
        });
        const middleware = requirePermission("view_orders");

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith();
      });
    });

    describe("❌ Cenários de Erro", () => {
      it("deve retornar 403 se admin não tem todas as permissões", async () => {
        // Arrange
        mockReq.admin = {
          uid: "admin-123",
          email: "admin@test.com",
          role: "admin",
          permissions: ["view_orders"],
        };
        const middleware = requirePermission("view_orders", "manage_orders");

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe("INSUFFICIENT_PERMISSIONS");
        expect(error.message).toContain("view_orders, manage_orders");
      });

      it("deve retornar 403 se admin não tem nenhuma permissão", async () => {
        // Arrange
        mockReq.admin = {
          uid: "admin-123",
          email: "admin@test.com",
          role: "support",
          permissions: [],
        };
        const middleware = requirePermission("process_refunds");

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(403);
      });

      it("deve retornar 403 se autenticação falha", async () => {
        // Arrange
        mockReq.headers = {};
        mockReq.admin = undefined;
        const middleware = requirePermission("view_orders");

        // Act
        await middleware(mockReq as Request, mockRes as Response, mockNext);

        // Assert
        expect(mockNext).toHaveBeenCalledWith(expect.any(ApiError));
        const error = (mockNext as jest.Mock).mock.calls[0][0] as ApiError;
        expect(error.statusCode).toBe(403);
      });
    });
  });

  describe("ADMIN_PERMISSIONS", () => {
    it("deve exportar todas as permissões de Orders", () => {
      expect(ADMIN_PERMISSIONS.VIEW_ORDERS).toBe("view_orders");
      expect(ADMIN_PERMISSIONS.MANAGE_ORDERS).toBe("manage_orders");
      expect(ADMIN_PERMISSIONS.CANCEL_ORDERS).toBe("cancel_orders");
      expect(ADMIN_PERMISSIONS.PROCESS_REFUNDS).toBe("process_refunds");
    });

    it("deve exportar todas as permissões de Pharmacies", () => {
      expect(ADMIN_PERMISSIONS.VIEW_PHARMACIES).toBe("view_pharmacies");
      expect(ADMIN_PERMISSIONS.APPROVE_PHARMACIES).toBe("approve_pharmacies");
      expect(ADMIN_PERMISSIONS.SUSPEND_PHARMACIES).toBe("suspend_pharmacies");
    });

    it("deve exportar todas as permissões de Products", () => {
      expect(ADMIN_PERMISSIONS.VIEW_PRODUCTS).toBe("view_products");
      expect(ADMIN_PERMISSIONS.MANAGE_PRODUCTS).toBe("manage_products");
    });

    it("deve exportar todas as permissões de Users", () => {
      expect(ADMIN_PERMISSIONS.VIEW_USERS).toBe("view_users");
      expect(ADMIN_PERMISSIONS.MANAGE_USERS).toBe("manage_users");
    });

    it("deve exportar todas as permissões de Financial", () => {
      expect(ADMIN_PERMISSIONS.VIEW_FINANCIAL).toBe("view_financial");
      expect(ADMIN_PERMISSIONS.MANAGE_FINANCIAL).toBe("manage_financial");
    });

    it("deve exportar permissão de Audit", () => {
      expect(ADMIN_PERMISSIONS.VIEW_AUDIT).toBe("view_audit");
    });

    it("deve exportar permissão de System", () => {
      expect(ADMIN_PERMISSIONS.MANAGE_SYSTEM).toBe("manage_system");
    });
  });

  describe("AdminRole Type", () => {
    it("deve aceitar todas as roles válidas", () => {
      const validRoles: AdminRole[] = ["super_admin", "admin", "moderator", "support"];
      expect(validRoles).toHaveLength(4);
    });
  });

  describe("AdminUser Interface", () => {
    it("deve criar AdminUser com campos obrigatórios", () => {
      const adminUser: AdminUser = {
        uid: "123",
        email: "test@test.com",
        role: "admin",
        permissions: ["view_orders"],
      };
      expect(adminUser.uid).toBe("123");
      expect(adminUser.partnerId).toBeUndefined();
    });

    it("deve criar AdminUser com partnerId opcional", () => {
      const adminUser: AdminUser = {
        uid: "123",
        email: "test@test.com",
        role: "moderator",
        permissions: [],
        partnerId: "partner-456",
      };
      expect(adminUser.partnerId).toBe("partner-456");
    });
  });
});
