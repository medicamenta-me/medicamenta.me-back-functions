/**
 * 🧪 API Error Class Tests
 * 
 * Testes unitários completos para ApiError e ApiErrors helpers
 * Cobertura: 100%
 */

import { ApiError, ApiErrors } from '../api-error';

describe('ApiError', () => {
  describe('✅ Construtor', () => {
    it('deve criar erro com todos os parâmetros', () => {
      const error = new ApiError(
        400,
        'BAD_REQUEST',
        'Invalid input',
        { field: 'email' }
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.name).toBe('ApiError');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.message).toBe('Invalid input');
      expect(error.details).toEqual({ field: 'email' });
    });

    it('deve criar erro sem details', () => {
      const error = new ApiError(500, 'SERVER_ERROR', 'Something went wrong');

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('SERVER_ERROR');
      expect(error.message).toBe('Something went wrong');
      expect(error.details).toBeUndefined();
    });

    it('deve manter stack trace adequado', () => {
      const error = new ApiError(404, 'NOT_FOUND', 'Resource not found');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ApiError');
    });
  });

  describe('✅ toJSON', () => {
    it('deve serializar erro completo com details', () => {
      const error = new ApiError(
        400,
        'VALIDATION_ERROR',
        'Email is invalid',
        { field: 'email', value: 'invalid-email' }
      );

      const json = error.toJSON();

      expect(json).toHaveProperty('error');
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(json.error.message).toBe('Email is invalid');
      expect(json.error.statusCode).toBe(400);
      expect(json.error.details).toEqual({
        field: 'email',
        value: 'invalid-email'
      });
      expect(json.error.timestamp).toBeDefined();
      expect(new Date(json.error.timestamp).getTime()).not.toBeNaN();
    });

    it('deve serializar erro sem details', () => {
      const error = new ApiError(401, 'UNAUTHORIZED', 'Token expired');

      const json = error.toJSON();

      expect(json.error.code).toBe('UNAUTHORIZED');
      expect(json.error.message).toBe('Token expired');
      expect(json.error.statusCode).toBe(401);
      expect(json.error.details).toBeUndefined();
      expect(json.error.timestamp).toBeDefined();
    });

    it('deve ter timestamp válido no formato ISO', () => {
      const beforeTime = new Date().getTime();
      const error = new ApiError(500, 'ERROR', 'Test');
      const json = error.toJSON();
      const afterTime = new Date().getTime();
      const errorTime = new Date(json.error.timestamp).getTime();

      expect(json.error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(errorTime).toBeGreaterThanOrEqual(beforeTime);
      expect(errorTime).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('✅ Herança de Error', () => {
    it('deve ser capturado em try-catch como Error', () => {
      expect(() => {
        throw new ApiError(500, 'TEST_ERROR', 'Test message');
      }).toThrow(Error);
    });

    it('deve ser capturado em try-catch como ApiError', () => {
      expect(() => {
        throw new ApiError(500, 'TEST_ERROR', 'Test message');
      }).toThrow(ApiError);
    });

    it('deve preservar mensagem em throw', () => {
      expect(() => {
        throw new ApiError(404, 'NOT_FOUND', 'User not found');
      }).toThrow('User not found');
    });
  });
});

describe('ApiErrors Helpers', () => {
  describe('✅ UNAUTHORIZED', () => {
    it('deve criar erro 401 com mensagem padrão', () => {
      const error = ApiErrors.UNAUTHORIZED();

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Unauthorized');
      expect(error.details).toBeUndefined();
    });

    it('deve criar erro 401 com mensagem customizada', () => {
      const error = ApiErrors.UNAUTHORIZED('Token inválido');

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Token inválido');
    });
  });

  describe('✅ FORBIDDEN', () => {
    it('deve criar erro 403 com mensagem padrão', () => {
      const error = ApiErrors.FORBIDDEN();

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('Forbidden');
      expect(error.details).toBeUndefined();
    });

    it('deve criar erro 403 com mensagem customizada', () => {
      const error = ApiErrors.FORBIDDEN('Sem permissão para esta ação');

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('Sem permissão para esta ação');
    });
  });

  describe('✅ NOT_FOUND', () => {
    it('deve criar erro 404 para usuário', () => {
      const error = ApiErrors.NOT_FOUND('User');

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('User not found');
    });

    it('deve criar erro 404 para produto', () => {
      const error = ApiErrors.NOT_FOUND('Product');

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Product not found');
    });

    it('deve criar erro 404 para qualquer recurso', () => {
      const error = ApiErrors.NOT_FOUND('Medication');

      expect(error.message).toBe('Medication not found');
    });
  });

  describe('✅ VALIDATION_ERROR', () => {
    it('deve criar erro 400 com detalhes de validação', () => {
      const validationDetails = {
        email: 'Email is required',
        password: 'Password must be at least 8 characters'
      };
      const error = ApiErrors.VALIDATION_ERROR(validationDetails);

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Validation failed');
      expect(error.details).toEqual(validationDetails);
    });

    it('deve criar erro 400 com array de erros', () => {
      const validationDetails = [
        { field: 'email', message: 'Invalid format' },
        { field: 'age', message: 'Must be positive' }
      ];
      const error = ApiErrors.VALIDATION_ERROR(validationDetails);

      expect(error.details).toEqual(validationDetails);
      expect(error.details).toHaveLength(2);
    });

    it('deve criar erro 400 com details vazio', () => {
      const error = ApiErrors.VALIDATION_ERROR({});

      expect(error.details).toEqual({});
    });
  });

  describe('✅ RATE_LIMIT_EXCEEDED', () => {
    it('deve criar erro 429 com retryAfter', () => {
      const error = ApiErrors.RATE_LIMIT_EXCEEDED(60);

      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.message).toBe('Too many requests');
      expect(error.details).toEqual({ retryAfter: 60 });
    });

    it('deve criar erro 429 com retryAfter = 0', () => {
      const error = ApiErrors.RATE_LIMIT_EXCEEDED(0);

      expect(error.details).toEqual({ retryAfter: 0 });
    });

    it('deve criar erro 429 com retryAfter alto', () => {
      const error = ApiErrors.RATE_LIMIT_EXCEEDED(3600);

      expect(error.details.retryAfter).toBe(3600);
    });
  });

  describe('✅ INTERNAL_ERROR', () => {
    it('deve criar erro 500 com mensagem padrão', () => {
      const error = ApiErrors.INTERNAL_ERROR();

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.message).toBe('Internal server error');
      expect(error.details).toBeUndefined();
    });

    it('deve criar erro 500 com mensagem customizada', () => {
      const error = ApiErrors.INTERNAL_ERROR('Database connection failed');

      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Database connection failed');
    });
  });

  describe('✅ SERVICE_UNAVAILABLE', () => {
    it('deve criar erro 503 com mensagem padrão', () => {
      const error = ApiErrors.SERVICE_UNAVAILABLE();

      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.message).toBe('Service temporarily unavailable');
      expect(error.details).toBeUndefined();
    });

    it('deve criar erro 503 com mensagem customizada', () => {
      const error = ApiErrors.SERVICE_UNAVAILABLE('Manutenção programada');

      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('Manutenção programada');
    });
  });

  describe('✅ Integração: Serialização de Helpers', () => {
    it('deve serializar UNAUTHORIZED corretamente', () => {
      const error = ApiErrors.UNAUTHORIZED('Invalid token');
      const json = error.toJSON();

      expect(json.error.statusCode).toBe(401);
      expect(json.error.code).toBe('UNAUTHORIZED');
      expect(json.error.message).toBe('Invalid token');
    });

    it('deve serializar VALIDATION_ERROR com details', () => {
      const error = ApiErrors.VALIDATION_ERROR({ field: 'email' });
      const json = error.toJSON();

      expect(json.error.statusCode).toBe(400);
      expect(json.error.details).toEqual({ field: 'email' });
    });

    it('deve serializar RATE_LIMIT_EXCEEDED com retryAfter', () => {
      const error = ApiErrors.RATE_LIMIT_EXCEEDED(120);
      const json = error.toJSON();

      expect(json.error.statusCode).toBe(429);
      expect(json.error.details.retryAfter).toBe(120);
    });
  });

  describe('❌ Edge Cases', () => {
    it('deve lidar com statusCode negativo', () => {
      const error = new ApiError(-1, 'INVALID', 'Test');

      expect(error.statusCode).toBe(-1);
    });

    it('deve lidar com code vazio', () => {
      const error = new ApiError(400, '', 'Empty code');

      expect(error.code).toBe('');
    });

    it('deve lidar com message vazio', () => {
      const error = new ApiError(500, 'ERROR', '');

      expect(error.message).toBe('');
    });

    it('deve lidar com details null', () => {
      const error = new ApiError(400, 'ERROR', 'Test', null);

      expect(error.details).toBeNull();
    });

    it('deve lidar com details undefined explícito', () => {
      const error = new ApiError(400, 'ERROR', 'Test', undefined);

      expect(error.details).toBeUndefined();
    });

    it('deve lidar com details complexo (objeto aninhado)', () => {
      const complexDetails = {
        user: { id: '123', email: 'test@example.com' },
        metadata: { timestamp: Date.now(), source: 'api' }
      };
      const error = new ApiError(400, 'ERROR', 'Test', complexDetails);

      expect(error.details).toEqual(complexDetails);
      expect(error.toJSON().error.details).toEqual(complexDetails);
    });

    it('deve lidar com resource NOT_FOUND vazio', () => {
      const error = ApiErrors.NOT_FOUND('');

      expect(error.message).toBe(' not found');
    });

    it('deve lidar com VALIDATION_ERROR com null', () => {
      const error = ApiErrors.VALIDATION_ERROR(null);

      expect(error.details).toBeNull();
    });

    it('deve lidar com RATE_LIMIT_EXCEEDED com número negativo', () => {
      const error = ApiErrors.RATE_LIMIT_EXCEEDED(-10);

      expect(error.details.retryAfter).toBe(-10);
    });
  });
});
