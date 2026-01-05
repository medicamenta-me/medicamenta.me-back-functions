/**
 * 🧪 Pharmacy Schema Tests
 * 
 * Testes unitários para validações de farmácias.
 */

import {
  CreatePharmacySchema,
  UpdatePharmacySchema,
  PharmacySearchSchema,
  NearbyPharmaciesSchema,
  ApprovePharmacySchema,
  SuspendPharmacySchema,
  RejectPharmacySchema,
  WorkingHoursSchema,
  BankAccountSchema,
} from "../pharmacy.schema";

describe("🏥 Pharmacy Schemas", () => {
  // =========================================
  // WorkingHoursSchema Tests
  // =========================================
  describe("WorkingHoursSchema", () => {
    it("✅ should validate complete working hours", () => {
      const result = WorkingHoursSchema.safeParse({
        monday: { open: "08:00", close: "18:00" },
        tuesday: { open: "08:00", close: "18:00" },
        wednesday: { open: "08:00", close: "18:00" },
        thursday: { open: "08:00", close: "18:00" },
        friday: { open: "08:00", close: "18:00" },
        saturday: { open: "08:00", close: "13:00" },
        sunday: { open: "00:00", close: "00:00", closed: true },
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate partial working hours", () => {
      const result = WorkingHoursSchema.safeParse({
        monday: { open: "09:00", close: "17:00" },
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate empty working hours", () => {
      const result = WorkingHoursSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  // =========================================
  // BankAccountSchema Tests
  // =========================================
  describe("BankAccountSchema", () => {
    const validBankAccount = {
      bankCode: "001",
      bankName: "Banco do Brasil",
      agency: "1234",
      account: "12345678",
      accountDigit: "9",
      accountType: "checking" as const,
      holderName: "Farmacia Teste LTDA",
      holderDocument: "12.345.678/0001-90",
    };

    it("✅ should validate complete bank account", () => {
      const result = BankAccountSchema.safeParse(validBankAccount);
      expect(result.success).toBe(true);
    });

    it("❌ should reject invalid bank code (not 3 digits)", () => {
      const result = BankAccountSchema.safeParse({
        ...validBankAccount,
        bankCode: "1",
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid account type", () => {
      const result = BankAccountSchema.safeParse({
        ...validBankAccount,
        accountType: "investment",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should accept both checking and savings", () => {
      ["checking", "savings"].forEach((type) => {
        const result = BankAccountSchema.safeParse({
          ...validBankAccount,
          accountType: type,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  // =========================================
  // CreatePharmacySchema Tests
  // =========================================
  describe("CreatePharmacySchema", () => {
    const validPharmacy = {
      name: "Farmácia Central",
      cnpj: "12.345.678/0001-90",
      email: "contato@farmaciacentral.com",
      address: {
        street: "Rua das Flores",
        number: "123",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        zipCode: "01234-567",
        latitude: -23.5505,
        longitude: -46.6333,
      },
    };

    it("✅ should validate minimal pharmacy", () => {
      const result = CreatePharmacySchema.safeParse(validPharmacy);
      expect(result.success).toBe(true);
    });

    it("✅ should validate complete pharmacy", () => {
      const result = CreatePharmacySchema.safeParse({
        ...validPharmacy,
        phone: "(11) 98765-4321",
        whatsapp: "11987654321",
        website: "https://farmaciacentral.com",
        hasDelivery: true,
        deliveryRadius: 10,
        shippingCost: 8.99,
        freeShipping: true,
        freeShippingMinValue: 100,
        estimatedDeliveryTime: "1-2 horas",
        workingHours: {
          monday: { open: "08:00", close: "20:00" },
        },
        logoUrl: "https://example.com/logo.png",
        bannerUrl: "https://example.com/banner.png",
        description: "A melhor farmácia da região",
        responsiblePharmacist: "Dr. João Silva",
        crf: "CRF-SP 12345",
        alvara: "ALV-2024-12345",
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject short pharmacy name", () => {
      const result = CreatePharmacySchema.safeParse({
        ...validPharmacy,
        name: "Fa",
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid CNPJ format", () => {
      const result = CreatePharmacySchema.safeParse({
        ...validPharmacy,
        cnpj: "123456789",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should accept CNPJ without punctuation", () => {
      const result = CreatePharmacySchema.safeParse({
        ...validPharmacy,
        cnpj: "12345678000190",
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject invalid email", () => {
      const result = CreatePharmacySchema.safeParse({
        ...validPharmacy,
        email: "invalid-email",
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject address without coordinates", () => {
      const result = CreatePharmacySchema.safeParse({
        ...validPharmacy,
        address: {
          street: "Rua das Flores",
          number: "123",
          neighborhood: "Centro",
          city: "São Paulo",
          state: "SP",
          zipCode: "01234-567",
          // Missing latitude and longitude
        },
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid phone format", () => {
      const result = CreatePharmacySchema.safeParse({
        ...validPharmacy,
        phone: "1234",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should accept valid phone formats", () => {
      const phones = ["(11) 98765-4321", "(11) 3456-7890", "11987654321"];
      phones.forEach((phone) => {
        const result = CreatePharmacySchema.safeParse({
          ...validPharmacy,
          phone,
        });
        expect(result.success).toBe(true);
      });
    });

    it("❌ should reject delivery radius > 50", () => {
      const result = CreatePharmacySchema.safeParse({
        ...validPharmacy,
        deliveryRadius: 51,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid website URL", () => {
      const result = CreatePharmacySchema.safeParse({
        ...validPharmacy,
        website: "not-a-url",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should default hasDelivery to true", () => {
      const result = CreatePharmacySchema.safeParse(validPharmacy);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasDelivery).toBe(true);
      }
    });
  });

  // =========================================
  // UpdatePharmacySchema Tests
  // =========================================
  describe("UpdatePharmacySchema", () => {
    it("✅ should validate partial update", () => {
      const result = UpdatePharmacySchema.safeParse({
        name: "Farmácia Central - Nova",
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate multiple fields update", () => {
      const result = UpdatePharmacySchema.safeParse({
        name: "Farmácia Central - Nova",
        phone: "(11) 99999-9999",
        shippingCost: 12.99,
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate empty update", () => {
      const result = UpdatePharmacySchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  // =========================================
  // PharmacySearchSchema Tests
  // =========================================
  describe("PharmacySearchSchema", () => {
    it("✅ should validate empty search (use defaults)", () => {
      const result = PharmacySearchSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
      }
    });

    it("✅ should validate complete search", () => {
      const result = PharmacySearchSchema.safeParse({
        q: "farmacia",
        status: "active",
        city: "São Paulo",
        state: "SP",
        hasDelivery: "true",
        freeShipping: "true",
        isOpen: "true",
        limit: 50,
        offset: 10,
        sortBy: "rating",
        sortOrder: "desc",
      });
      expect(result.success).toBe(true);
    });

    it("✅ should transform hasDelivery string to boolean", () => {
      const result = PharmacySearchSchema.safeParse({
        hasDelivery: "true",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hasDelivery).toBe(true);
      }
    });

    it("❌ should reject invalid status", () => {
      const result = PharmacySearchSchema.safeParse({
        status: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should accept all valid statuses", () => {
      const statuses = ["pending", "active", "suspended", "inactive", "rejected"];
      statuses.forEach((status) => {
        const result = PharmacySearchSchema.safeParse({ status });
        expect(result.success).toBe(true);
      });
    });
  });

  // =========================================
  // NearbyPharmaciesSchema Tests
  // =========================================
  describe("NearbyPharmaciesSchema", () => {
    it("✅ should validate with required coordinates", () => {
      const result = NearbyPharmaciesSchema.safeParse({
        lat: -23.5505,
        lng: -46.6333,
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate with all options", () => {
      const result = NearbyPharmaciesSchema.safeParse({
        lat: -23.5505,
        lng: -46.6333,
        radius: 10,
        limit: 20,
        hasDelivery: "true",
        isOpen: "true",
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject missing lat", () => {
      const result = NearbyPharmaciesSchema.safeParse({
        lng: -46.6333,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject missing lng", () => {
      const result = NearbyPharmaciesSchema.safeParse({
        lat: -23.5505,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid latitude (> 90)", () => {
      const result = NearbyPharmaciesSchema.safeParse({
        lat: 100,
        lng: -46.6333,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject invalid longitude (> 180)", () => {
      const result = NearbyPharmaciesSchema.safeParse({
        lat: -23.5505,
        lng: 200,
      });
      expect(result.success).toBe(false);
    });

    it("❌ should reject radius > 100", () => {
      const result = NearbyPharmaciesSchema.safeParse({
        lat: -23.5505,
        lng: -46.6333,
        radius: 101,
      });
      expect(result.success).toBe(false);
    });

    it("✅ should default radius to 5", () => {
      const result = NearbyPharmaciesSchema.safeParse({
        lat: -23.5505,
        lng: -46.6333,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.radius).toBe(5);
      }
    });

    it("✅ should coerce string coordinates", () => {
      const result = NearbyPharmaciesSchema.safeParse({
        lat: "-23.5505",
        lng: "-46.6333",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lat).toBe(-23.5505);
        expect(result.data.lng).toBe(-46.6333);
      }
    });
  });

  // =========================================
  // ApprovePharmacySchema Tests
  // =========================================
  describe("ApprovePharmacySchema", () => {
    it("✅ should validate empty approval", () => {
      const result = ApprovePharmacySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("✅ should validate approval with notes", () => {
      const result = ApprovePharmacySchema.safeParse({
        notes: "All documents verified and approved",
        reviewedDocuments: ["cnpj", "alvara", "crf"],
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject notes too long", () => {
      const result = ApprovePharmacySchema.safeParse({
        notes: "x".repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  // =========================================
  // SuspendPharmacySchema Tests
  // =========================================
  describe("SuspendPharmacySchema", () => {
    it("✅ should validate suspension with reason", () => {
      const result = SuspendPharmacySchema.safeParse({
        reason: "Violation of terms of service - selling expired products",
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate temporary suspension with end date", () => {
      const result = SuspendPharmacySchema.safeParse({
        reason: "Pending document verification",
        duration: "temporary",
        endDate: "2026-02-01T00:00:00Z",
        notifyPharmacy: true,
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate permanent suspension", () => {
      const result = SuspendPharmacySchema.safeParse({
        reason: "Repeated violations of platform rules",
        duration: "permanent",
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject short reason", () => {
      const result = SuspendPharmacySchema.safeParse({
        reason: "Bad",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should default duration to temporary", () => {
      const result = SuspendPharmacySchema.safeParse({
        reason: "Pending document verification",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.duration).toBe("temporary");
      }
    });

    it("✅ should default notifyPharmacy to true", () => {
      const result = SuspendPharmacySchema.safeParse({
        reason: "Pending document verification",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.notifyPharmacy).toBe(true);
      }
    });
  });

  // =========================================
  // RejectPharmacySchema Tests
  // =========================================
  describe("RejectPharmacySchema", () => {
    it("✅ should validate rejection with reason", () => {
      const result = RejectPharmacySchema.safeParse({
        reason: "Invalid CNPJ - documents do not match",
      });
      expect(result.success).toBe(true);
    });

    it("✅ should validate rejection with reapply options", () => {
      const result = RejectPharmacySchema.safeParse({
        reason: "Missing required documents - please resubmit",
        canReapply: true,
        reapplyAfterDays: 15,
      });
      expect(result.success).toBe(true);
    });

    it("❌ should reject short reason", () => {
      const result = RejectPharmacySchema.safeParse({
        reason: "Invalid",
      });
      expect(result.success).toBe(false);
    });

    it("✅ should default canReapply to true", () => {
      const result = RejectPharmacySchema.safeParse({
        reason: "Missing required documents",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.canReapply).toBe(true);
      }
    });

    it("✅ should default reapplyAfterDays to 30", () => {
      const result = RejectPharmacySchema.safeParse({
        reason: "Missing required documents",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reapplyAfterDays).toBe(30);
      }
    });

    it("❌ should reject reapplyAfterDays > 365", () => {
      const result = RejectPharmacySchema.safeParse({
        reason: "Missing required documents",
        reapplyAfterDays: 366,
      });
      expect(result.success).toBe(false);
    });
  });
});
