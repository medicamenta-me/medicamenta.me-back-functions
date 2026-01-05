/**
 * 🏢 Admin Routes - API v2
 * 
 * Endpoints administrativos para o Backoffice.
 * Todas as rotas requerem autenticação de admin.
 * 
 * @module api/v2/admin
 * @version 2.0.0
 */

import { Router } from "express";
import { adminOnly } from "../../middleware/admin";
import { ordersAdminRouter } from "./orders.admin";
import { pharmaciesAdminRouter } from "./pharmacies.admin";
import { productsAdminRouter } from "./products.admin";
import { auditAdminRouter } from "./audit.admin";

const router = Router();

// Middleware global - todas rotas admin requerem autenticação
router.use(adminOnly);

// Mount admin sub-routers
router.use("/orders", ordersAdminRouter);
router.use("/pharmacies", pharmaciesAdminRouter);
router.use("/products", productsAdminRouter);
router.use("/audit", auditAdminRouter);

export const adminRouter = router;
