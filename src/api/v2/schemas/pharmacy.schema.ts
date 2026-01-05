/**
 * 🏥 Pharmacy Validation Schemas - Zod
 * 
 * Esquemas de validação para todas as operações de farmácias.
 * Segue princípios SOLID (Single Responsibility) e Clean Code.
 * 
 * @module schemas/pharmacy
 * @version 2.0.0
 */

import { z } from "zod";
import { AddressSchema } from "./order.schema";

// ============================================
// Enums
// ============================================

export const PharmacyStatusEnum = z.enum([
  "pending",
  "active",
  "suspended",
  "inactive",
  "rejected",
]);

// ============================================
// Sub-schemas
// ============================================

/**
 * Horário de funcionamento
 */
export const WorkingHoursSchema = z.object({
  monday: z.object({ open: z.string(), close: z.string(), closed: z.boolean().optional() }).optional(),
  tuesday: z.object({ open: z.string(), close: z.string(), closed: z.boolean().optional() }).optional(),
  wednesday: z.object({ open: z.string(), close: z.string(), closed: z.boolean().optional() }).optional(),
  thursday: z.object({ open: z.string(), close: z.string(), closed: z.boolean().optional() }).optional(),
  friday: z.object({ open: z.string(), close: z.string(), closed: z.boolean().optional() }).optional(),
  saturday: z.object({ open: z.string(), close: z.string(), closed: z.boolean().optional() }).optional(),
  sunday: z.object({ open: z.string(), close: z.string(), closed: z.boolean().optional() }).optional(),
});

/**
 * Dados bancários
 */
export const BankAccountSchema = z.object({
  bankCode: z.string().length(3, "Bank code must be 3 digits"),
  bankName: z.string().max(100).optional(),
  agency: z.string().max(10),
  account: z.string().max(20),
  accountDigit: z.string().max(2).optional(),
  accountType: z.enum(["checking", "savings"]),
  holderName: z.string().max(200),
  holderDocument: z.string().max(18), // CPF or CNPJ
});

// ============================================
// Create Pharmacy Schema
// ============================================

/**
 * Schema para registro de farmácia
 * POST /v2/pharmacies
 */
export const CreatePharmacySchema = z.object({
  // Required fields
  name: z.string()
    .min(3, "Pharmacy name must have at least 3 characters")
    .max(200, "Pharmacy name must have at most 200 characters"),
  cnpj: z.string()
    .regex(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{14}$/, "Invalid CNPJ format"),
  email: z.string()
    .email("Invalid email address"),
  address: AddressSchema.extend({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),

  // Optional fields
  phone: z.string()
    .regex(/^\(\d{2}\)\s?\d{4,5}-?\d{4}$|^\d{10,11}$/, "Invalid phone format")
    .optional(),
  whatsapp: z.string()
    .regex(/^\d{10,11}$/, "Invalid WhatsApp format")
    .optional(),
  website: z.string()
    .url("Invalid website URL")
    .optional(),
  
  // Delivery settings
  hasDelivery: z.boolean().default(true),
  deliveryRadius: z.number()
    .min(1, "Delivery radius must be at least 1 km")
    .max(50, "Delivery radius must be at most 50 km")
    .optional(),
  shippingCost: z.number()
    .min(0, "Shipping cost cannot be negative")
    .optional(),
  freeShipping: z.boolean().default(false),
  freeShippingMinValue: z.number()
    .min(0)
    .optional(),
  estimatedDeliveryTime: z.string()
    .max(50, "Estimated delivery time too long")
    .optional(), // Ex: "1-2 horas"

  // Working hours
  workingHours: WorkingHoursSchema.optional(),
  
  // Branding
  logoUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  description: z.string().max(1000).optional(),
  
  // Documents
  responsiblePharmacist: z.string().max(200).optional(),
  crf: z.string().max(20).optional(), // Conselho Regional de Farmácia
  alvara: z.string().max(50).optional(), // Alvará de funcionamento
  
  // Bank account for payments
  bankAccount: BankAccountSchema.optional(),
}).strict();

/**
 * Schema para atualização de farmácia
 * PATCH /v2/pharmacies/:id
 */
export const UpdatePharmacySchema = CreatePharmacySchema.partial();

// ============================================
// Pharmacy Search Schema
// ============================================

/**
 * Schema para parâmetros de busca de farmácias
 * GET /v2/pharmacies
 */
export const PharmacySearchSchema = z.object({
  // Text search
  q: z.string().max(200).optional(),
  
  // Filters
  status: PharmacyStatusEnum.optional(),
  city: z.string().max(100).optional(),
  state: z.string().length(2).optional(),
  hasDelivery: z.enum(["true", "false"]).transform(v => v === "true").optional(),
  freeShipping: z.enum(["true", "false"]).transform(v => v === "true").optional(),
  isOpen: z.enum(["true", "false"]).transform(v => v === "true").optional(),
  
  // Pagination & Sorting
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum(["createdAt", "name", "rating", "distance"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * Schema para busca de farmácias próximas
 * GET /v2/pharmacies/nearby
 */
export const NearbyPharmaciesSchema = z.object({
  lat: z.coerce.number()
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90"),
  lng: z.coerce.number()
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180"),
  radius: z.coerce.number()
    .min(1, "Radius must be at least 1 km")
    .max(100, "Radius must be at most 100 km")
    .default(5),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  hasDelivery: z.enum(["true", "false"]).transform(v => v === "true").optional(),
  isOpen: z.enum(["true", "false"]).transform(v => v === "true").optional(),
});

// ============================================
// Admin Actions Schema
// ============================================

/**
 * Schema para aprovação de farmácia
 * POST /v2/admin/pharmacies/:id/approve
 */
export const ApprovePharmacySchema = z.object({
  notes: z.string().max(500).optional(),
  reviewedDocuments: z.array(z.string()).optional(),
});

/**
 * Schema para suspensão de farmácia
 * POST /v2/admin/pharmacies/:id/suspend
 */
export const SuspendPharmacySchema = z.object({
  reason: z.string()
    .min(10, "Reason must have at least 10 characters")
    .max(500, "Reason must have at most 500 characters"),
  duration: z.enum(["temporary", "permanent"]).default("temporary"),
  endDate: z.string().datetime().optional(), // Para suspensão temporária
  notifyPharmacy: z.boolean().default(true),
});

/**
 * Schema para rejeição de farmácia
 * POST /v2/admin/pharmacies/:id/reject
 */
export const RejectPharmacySchema = z.object({
  reason: z.string()
    .min(10, "Reason must have at least 10 characters")
    .max(500, "Reason must have at most 500 characters"),
  canReapply: z.boolean().default(true),
  reapplyAfterDays: z.number().int().min(0).max(365).default(30),
});

// ============================================
// Type Exports
// ============================================

export type PharmacyStatus = z.infer<typeof PharmacyStatusEnum>;
export type WorkingHours = z.infer<typeof WorkingHoursSchema>;
export type BankAccount = z.infer<typeof BankAccountSchema>;
export type CreatePharmacyInput = z.infer<typeof CreatePharmacySchema>;
export type UpdatePharmacyInput = z.infer<typeof UpdatePharmacySchema>;
export type PharmacySearchParams = z.infer<typeof PharmacySearchSchema>;
export type NearbyPharmaciesParams = z.infer<typeof NearbyPharmaciesSchema>;
export type ApprovePharmacyInput = z.infer<typeof ApprovePharmacySchema>;
export type SuspendPharmacyInput = z.infer<typeof SuspendPharmacySchema>;
export type RejectPharmacyInput = z.infer<typeof RejectPharmacySchema>;
