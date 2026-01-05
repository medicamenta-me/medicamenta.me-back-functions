/**
 * 🚀 API v2 - Main Router
 * 
 * API v2 com recursos de integração entre todos os frontends.
 * Inclui rotas públicas e rotas administrativas (admin).
 * 
 * @version 2.1.0
 */

import { Router } from "express";
import { ordersRouter } from "./orders.routes";
import { productsRouter } from "./products.routes";
import { pharmaciesRouter } from "./pharmacies.routes";
import { financialRouter } from "./financial.routes";
import { adminRouter } from "./admin";

const router = Router();

// Health check
router.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    version: "2.1.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      orders: "/v2/orders",
      products: "/v2/products",
      pharmacies: "/v2/pharmacies",
      financial: "/v2/financial",
      admin: "/v2/admin",
    },
  });
});

// Mount public sub-routers
router.use("/orders", ordersRouter);
router.use("/products", productsRouter);
router.use("/pharmacies", pharmaciesRouter);
router.use("/financial", financialRouter);

// Mount admin router (requires admin authentication)
router.use("/admin", adminRouter);

export const v2Router = router;
