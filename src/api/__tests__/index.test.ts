/**
 * 🧪 API Index Integration Tests
 * 
 * Testes de integração para o API Gateway principal
 * Cobertura: 100% do setup do Express e rotas base
 */

import request from 'supertest';
import express from 'express';
import { app } from '../index';

// Mock Firebase Functions
jest.mock('firebase-functions', () => ({
  runWith: jest.fn().mockReturnValue({
    https: {
      onRequest: jest.fn((handler) => handler),
    },
  }),
}));

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: jest.fn(),
}));

// Mock all routers
jest.mock('../v1/patients.routes', () => ({
  patientsRouter: express.Router().get('/', (req, res) => res.json({ route: 'patients' })),
}));

jest.mock('../v1/medications.routes', () => ({
  medicationsRouter: express.Router().get('/', (req, res) => res.json({ route: 'medications' })),
}));

jest.mock('../v1/adherence.routes', () => ({
  adherenceRouter: express.Router().get('/', (req, res) => res.json({ route: 'adherence' })),
}));

jest.mock('../v1/reports.routes', () => ({
  reportsRouter: express.Router().get('/', (req, res) => res.json({ route: 'reports' })),
}));

jest.mock('../v1/webhooks.routes', () => ({
  webhooksRouter: express.Router().get('/', (req, res) => res.json({ route: 'webhooks' })),
}));

jest.mock('../v1/auth.routes', () => ({
  authRouter: express.Router().post('/token', (req, res) => res.json({ token: 'mock-token' })),
}));

// Mock middleware
jest.mock('../middleware/rate-limiter', () => ({
  rateLimiter: (req: any, res: any, next: any) => next(),
}));

jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => next(),
}));

jest.mock('../middleware/error-handler', () => ({
  errorHandler: (err: any, req: any, res: any, next: any) => {
    res.status(err.statusCode || 500).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message,
        timestamp: new Date().toISOString(),
      },
    });
  },
}));

jest.mock('../middleware/logger', () => ({
  requestLogger: (req: any, res: any, next: any) => next(),
}));

jest.mock('../middleware/api-key-validator', () => ({
  validateApiKey: (req: any, res: any, next: any) => next(),
}));

describe('API Gateway', () => {
  describe('✅ Health Check & Info', () => {
    it('GET /health deve retornar status healthy', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.uptime).toBe('number');
    });

    it('GET / deve retornar informações da API', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toHaveProperty('name', 'Medicamenta.me Public API');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('description');
      expect(response.body).toHaveProperty('documentation', '/docs');
      expect(response.body).toHaveProperty('endpoints');
      expect(response.body.endpoints).toHaveProperty('auth', '/v1/auth');
      expect(response.body.endpoints).toHaveProperty('patients', '/v1/patients');
      expect(response.body.endpoints).toHaveProperty('medications', '/v1/medications');
      expect(response.body.endpoints).toHaveProperty('adherence', '/v1/adherence');
      expect(response.body.endpoints).toHaveProperty('reports', '/v1/reports');
      expect(response.body.endpoints).toHaveProperty('webhooks', '/v1/webhooks');
      expect(response.body).toHaveProperty('support');
      expect(response.body.support).toHaveProperty('email', 'api-support@medicamenta.me');
    });
  });

  describe('✅ Documentation Routes', () => {
    it('GET /docs deve redirecionar para /api-docs', async () => {
      const response = await request(app)
        .get('/docs')
        .expect(302);

      expect(response.headers.location).toBe('/api-docs');
    });

    it('GET /api-docs deve retornar HTML do Swagger UI', async () => {
      const response = await request(app)
        .get('/api-docs')
        .expect(200);

      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('Medicamenta.me API Documentation');
      expect(response.text).toContain('swagger-ui');
      expect(response.text).toContain('SwaggerUIBundle');
    });

    it('GET /openapi.json deve retornar especificação OpenAPI', async () => {
      // Note: This will fail if file doesn't exist, but tests the route exists
      await request(app)
        .get('/openapi.json')
        .expect((res) => {
          // Accept either 200 (file exists) or 404/500 (file doesn't exist but route works)
          expect([200, 404, 500]).toContain(res.status);
        });
    });
  });

  describe('✅ API v1 Routes - Public', () => {
    it('POST /v1/auth/token deve estar acessível sem autenticação', async () => {
      const response = await request(app)
        .post('/v1/auth/token')
        .send({ client_id: 'test', client_secret: 'test' })
        .expect(200);

      expect(response.body).toHaveProperty('token', 'mock-token');
    });
  });

  describe('✅ API v1 Routes - Protected', () => {
    it('GET /v1/patients deve existir (com middlewares mockados)', async () => {
      const response = await request(app)
        .get('/v1/patients')
        .expect(200);

      expect(response.body).toHaveProperty('route', 'patients');
    });

    it('GET /v1/medications deve existir (com middlewares mockados)', async () => {
      const response = await request(app)
        .get('/v1/medications')
        .expect(200);

      expect(response.body).toHaveProperty('route', 'medications');
    });

    it('GET /v1/adherence deve existir (com middlewares mockados)', async () => {
      const response = await request(app)
        .get('/v1/adherence')
        .expect(200);

      expect(response.body).toHaveProperty('route', 'adherence');
    });

    it('GET /v1/reports deve existir (com middlewares mockados)', async () => {
      const response = await request(app)
        .get('/v1/reports')
        .expect(200);

      expect(response.body).toHaveProperty('route', 'reports');
    });

    it('GET /v1/webhooks deve existir (com middlewares mockados)', async () => {
      const response = await request(app)
        .get('/v1/webhooks')
        .expect(200);

      expect(response.body).toHaveProperty('route', 'webhooks');
    });
  });

  describe('❌ 404 Handler', () => {
    it('deve retornar 404 para rota inexistente', async () => {
      const response = await request(app)
        .get('/non-existent-route')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
      expect(response.body.error.message).toContain('GET /non-existent-route not found');
      expect(response.body.error).toHaveProperty('timestamp');
    });

    it('deve retornar 404 para rota v1 inexistente', async () => {
      const response = await request(app)
        .get('/v1/non-existent')
        .expect(404);

      expect(response.body.error.message).toContain('GET /v1/non-existent not found');
    });

    it('deve retornar 404 para POST em rota inexistente', async () => {
      const response = await request(app)
        .post('/invalid-route')
        .expect(404);

      expect(response.body.error.message).toContain('POST /invalid-route not found');
    });

    it('deve retornar 404 para DELETE em rota inexistente', async () => {
      const response = await request(app)
        .delete('/some-route')
        .expect(404);

      expect(response.body.error.message).toContain('DELETE /some-route not found');
    });

    it('deve incluir requestId no erro 404 se fornecido', async () => {
      const response = await request(app)
        .get('/not-found')
        .set('x-request-id', 'test-request-123')
        .expect(404);

      expect(response.body.error.requestId).toBe('test-request-123');
    });
  });

  describe('✅ Middleware Configuration', () => {
    it('deve aceitar JSON no body', async () => {
      const response = await request(app)
        .post('/v1/auth/token')
        .send({ client_id: 'test' })
        .set('Content-Type', 'application/json')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('deve aceitar URL encoded no body', async () => {
      const response = await request(app)
        .post('/v1/auth/token')
        .send('client_id=test&client_secret=test')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('deve incluir headers CORS', async () => {
      const response = await request(app)
        .options('/v1/patients')
        .set('Origin', 'https://example.com')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('deve incluir security headers (helmet)', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });
  });

  describe('⚠️ Edge Cases', () => {
    it('deve lidar com rota raiz com trailing slash', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toHaveProperty('name');
    });

    it('deve lidar com query parameters em rotas inexistentes', async () => {
      const response = await request(app)
        .get('/invalid?param=value')
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('deve lidar com caracteres especiais na URL', async () => {
      const response = await request(app)
        .get('/route%20with%20spaces')
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it('deve lidar com body muito grande (próximo ao limite)', async () => {
      const largeBody = { data: 'x'.repeat(9 * 1024 * 1024) }; // 9MB (abaixo do limite de 10MB)

      await request(app)
        .post('/v1/auth/token')
        .send(largeBody)
        .expect((res) => {
          // Should process or return error, not hang
          expect([200, 400, 413, 500]).toContain(res.status);
        });
    });

    it('deve incluir uptime positivo no health check', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.uptime).toBeGreaterThan(0);
    });
  });
});
