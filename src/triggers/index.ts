/**
 * Triggers Index - Barrel Export
 *
 * Exporta todos os Cloud Functions triggers do sistema.
 *
 * @module triggers
 * @version 1.0.0
 */

// Order Triggers
export {
  onOrderCreated,
  onOrderStatusUpdated,
  OrderStatus,
  OrderData,
  TriggerResult as OrderTriggerResult,
} from "./orders";

// Pharmacy Triggers
export {
  onPharmacyCreated,
  onPharmacyStatusUpdated,
  PharmacyStatus,
  PharmacyData,
  TriggerResult as PharmacyTriggerResult,
} from "./pharmacies";

// Product Triggers
export {
  onProductCreated,
  onProductUpdated,
  onProductDeleted,
  ProductData,
  TriggerResult as ProductTriggerResult,
} from "./products";
