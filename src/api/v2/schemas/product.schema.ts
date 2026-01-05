/**
 * 💊 Product Validation Schemas - Zod
 * 
 * Esquemas de validação para todas as operações de produtos.
 * Segue princípios SOLID (Single Responsibility) e Clean Code.
 * 
 * @module schemas/product
 * @version 2.0.0
 */

import { z } from "zod";

// ============================================
// Enums
// ============================================

export const ProductCategoryEnum = z.enum([
  "analgesics",
  "antibiotics",
  "antiinflammatory",
  "vitamins",
  "supplements",
  "skincare",
  "hygiene",
  "baby",
  "medical_devices",
  "first_aid",
  "cardiovascular",
  "diabetes",
  "respiratory",
  "digestive",
  "neurological",
  "hormonal",
  "ophthalmology",
  "dermatology",
  "other",
]);

export const ProductStatusEnum = z.enum([
  "active",
  "inactive",
  "out_of_stock",
  "discontinued",
]);

// ============================================
// Create Product Schema
// ============================================

/**
 * Schema para criação de produto
 * POST /v2/products
 */
export const CreateProductSchema = z.object({
  // Required fields
  pharmacyId: z.string()
    .min(1, "Pharmacy ID is required")
    .max(128, "Pharmacy ID too long"),
  name: z.string()
    .min(3, "Product name must have at least 3 characters")
    .max(200, "Product name must have at most 200 characters"),
  category: ProductCategoryEnum,
  price: z.number()
    .min(0.01, "Price must be greater than 0")
    .max(999999.99, "Price too high"),
  stock: z.number()
    .int("Stock must be an integer")
    .min(0, "Stock cannot be negative"),

  // Optional fields
  description: z.string()
    .max(2000, "Description must have at most 2000 characters")
    .optional(),
  requiresPrescription: z.boolean().default(false),
  activeIngredient: z.string()
    .max(200, "Active ingredient name too long")
    .optional(),
  manufacturer: z.string()
    .max(200, "Manufacturer name too long")
    .optional(),
  imageUrl: z.string()
    .url("Invalid image URL")
    .optional(),
  sku: z.string()
    .max(50, "SKU too long")
    .optional(),
  barcode: z.string()
    .max(50, "Barcode too long")
    .optional(),
  dosage: z.string()
    .max(100, "Dosage description too long")
    .optional(),
  unit: z.enum(["unit", "box", "bottle", "tube", "pack"]).default("unit"),
  minQuantity: z.number()
    .int()
    .min(1)
    .default(1),
  maxQuantity: z.number()
    .int()
    .min(1)
    .max(100)
    .default(10),
  
  // Pricing
  originalPrice: z.number()
    .min(0)
    .optional(), // Para mostrar desconto
  costPrice: z.number()
    .min(0)
    .optional(), // Preço de custo (interno)
  
  // SEO/Search
  tags: z.array(z.string().max(50)).max(10).optional(),
  searchKeywords: z.string().max(500).optional(),
}).strict();

/**
 * Schema para atualização de produto
 * PATCH /v2/products/:id
 */
export const UpdateProductSchema = CreateProductSchema.partial().omit({ pharmacyId: true });

// ============================================
// Product Search Schema
// ============================================

/**
 * Schema para parâmetros de busca de produtos
 * GET /v2/products
 */
export const ProductSearchSchema = z.object({
  // Text search
  q: z.string().max(200).optional(),
  
  // Filters
  category: ProductCategoryEnum.optional(),
  pharmacyId: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z.enum(["true", "false"]).transform(v => v === "true").optional(),
  requiresPrescription: z.enum(["true", "false"]).transform(v => v === "true").optional(),
  manufacturer: z.string().optional(),
  activeIngredient: z.string().optional(),
  
  // Geolocation (para buscar em farmácias próximas)
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().min(1).max(100).default(10).optional(),
  
  // Pagination & Sorting
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  page: z.coerce.number().int().min(1).optional(), // Alternativa ao offset
  sortBy: z.enum(["createdAt", "price", "name", "rating", "soldCount"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ============================================
// Stock Update Schema
// ============================================

/**
 * Schema para atualização de estoque
 * PATCH /v2/products/:id/stock
 */
export const UpdateStockSchema = z.object({
  action: z.enum(["set", "increment", "decrement"]),
  quantity: z.number()
    .int("Quantity must be an integer")
    .min(0, "Quantity cannot be negative"),
  reason: z.string()
    .max(200, "Reason too long")
    .optional(),
});

// ============================================
// Bulk Operations Schema
// ============================================

/**
 * Schema para atualização em lote de produtos
 * PATCH /v2/products/bulk
 */
export const BulkUpdateProductsSchema = z.object({
  productIds: z.array(z.string())
    .min(1, "At least one product ID is required")
    .max(100, "Maximum 100 products per batch"),
  updates: z.object({
    status: ProductStatusEnum.optional(),
    price: z.number().min(0.01).optional(),
    stock: z.number().int().min(0).optional(),
  }).refine(
    (data) => Object.keys(data).length > 0,
    { message: "At least one update field is required" }
  ),
});

// ============================================
// Type Exports
// ============================================

export type ProductCategory = z.infer<typeof ProductCategoryEnum>;
export type ProductStatus = z.infer<typeof ProductStatusEnum>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
export type ProductSearchParams = z.infer<typeof ProductSearchSchema>;
export type UpdateStockInput = z.infer<typeof UpdateStockSchema>;
export type BulkUpdateProductsInput = z.infer<typeof BulkUpdateProductsSchema>;
