/**
 * 🔍 Validation Middleware
 * 
 * Middleware para validação de requests usando Zod schemas.
 * Segue princípios SOLID e Clean Code.
 * 
 * @module middleware/validation
 * @version 2.0.0
 */

import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { ApiError } from "../utils/api-error";

/**
 * Interface para erros de validação formatados
 */
interface ValidationErrorDetail {
  field: string;
  message: string;
  code?: string;
}

/**
 * Formata erros do Zod para formato amigável
 */
function formatZodErrors(error: ZodError): ValidationErrorDetail[] {
  return error.issues.map((e) => ({
    field: e.path.join("."),
    message: e.message,
    code: e.code,
  }));
}

/**
 * Cria middleware de validação para body
 * 
 * @example
 * router.post("/orders", validateBody(CreateOrderSchema), createOrder);
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.body);

      if (!result.success) {
        const errors = formatZodErrors(result.error);
        throw new ApiError(400, "VALIDATION_ERROR", "Request body validation failed", errors);
      }

      // Replace body with validated/transformed data
      req.body = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Cria middleware de validação para query params
 * 
 * @example
 * router.get("/orders", validateQuery(OrderQuerySchema), listOrders);
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.query);

      if (!result.success) {
        const errors = formatZodErrors(result.error);
        throw new ApiError(400, "VALIDATION_ERROR", "Query parameters validation failed", errors);
      }

      // Replace query with validated/transformed data
      (req as any).validatedQuery = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Cria middleware de validação para path params
 * 
 * @example
 * router.get("/orders/:id", validateParams(OrderIdSchema), getOrder);
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.params);

      if (!result.success) {
        const errors = formatZodErrors(result.error);
        throw new ApiError(400, "VALIDATION_ERROR", "Path parameters validation failed", errors);
      }

      // Replace params with validated/transformed data
      (req as any).validatedParams = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware combinado que valida body, query e params
 * 
 * @example
 * router.patch("/orders/:id/status", validate({
 *   body: UpdateOrderStatusSchema,
 *   params: z.object({ id: z.string() }),
 * }), updateOrderStatus);
 */
export function validate<B = any, Q = any, P = any>(schemas: {
  body?: ZodSchema<B>;
  query?: ZodSchema<Q>;
  params?: ZodSchema<P>;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          const errors = formatZodErrors(result.error);
          throw new ApiError(400, "VALIDATION_ERROR", "Path parameters validation failed", errors);
        }
        (req as any).validatedParams = result.data;
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          const errors = formatZodErrors(result.error);
          throw new ApiError(400, "VALIDATION_ERROR", "Query parameters validation failed", errors);
        }
        (req as any).validatedQuery = result.data;
      }

      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          const errors = formatZodErrors(result.error);
          throw new ApiError(400, "VALIDATION_ERROR", "Request body validation failed", errors);
        }
        req.body = result.data;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
