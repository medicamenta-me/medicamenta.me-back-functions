/**
 * 🔔 Webhooks Routes - Integration Tests
 * 
 * Testes de integração para rotas de webhooks
 * Usa Firebase Emulator (não mocks)
 */

import request from 'supertest';
import express, { Application } from 'express';
import * as admin from 'firebase-admin';
import { webhooksRouter } from '../webhooks.routes';
import { errorHandler } from '../../middleware/error-handler';

// Firebase Admin já inicializado no setup.ts global
const db = admin.firestore();

// Test constants
const testPartnerId = 'test-partner-webhooks-' + Date.now();
const otherPartnerId = 'other-partner-webhooks-' + Date.now();

// Mock auth middleware to inject partnerId
const mockAuthMiddleware = (req: any, res: any, next: any) => {
  req.partnerId = testPartnerId;
  next();
};

describe('🔔 Webhooks Routes - Integration Tests', () => {
  let app: Application;
  let createdWebhookId: string;

  afterAll(async () => {
    // Cleanup: Delete all test webhooks
    const webhooksSnapshot = await db.collection('webhooks')
      .where('partnerId', 'in', [testPartnerId, otherPartnerId])
      .get();

    const deletePromises = webhooksSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deletePromises);
  }, 30000);

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(mockAuthMiddleware);
    app.use('/v1/webhooks', webhooksRouter);
    app.use(errorHandler);
  });

  describe('POST /v1/webhooks', () => {
    describe('✅ Cenários Positivos', () => {
      it('deve criar webhook com dados completos', async () => {
        const webhookData = {
          url: 'https://example.com/webhook',
          events: ['patient.created', 'medication.updated'],
          secret: 'test-secret-123',
        };

        const response = await request(app)
          .post('/v1/webhooks')
          .send(webhookData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.url).toBe(webhookData.url);
        expect(response.body.events).toEqual(webhookData.events);
        expect(response.body.secret).toBeDefined();
        expect(response.body.status).toBe('active');

        createdWebhookId = response.body.id;
      });

      it('deve gerar secret automaticamente se não fornecido', async () => {
        const webhookData = {
          url: 'https://example.com/webhook2',
          events: ['dose.taken'],
        };

        const response = await request(app)
          .post('/v1/webhooks')
          .send(webhookData);

        expect(response.status).toBe(201);
        expect(response.body.secret).toBeDefined();
        expect(response.body.secret).toMatch(/^whsec_[a-f0-9]{64}$/);
      });
    });

    describe('❌ Cenários Negativos', () => {
      it('deve retornar 400 se url está faltando', async () => {
        const response = await request(app)
          .post('/v1/webhooks')
          .send({ events: ['patient.created'] });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 400 se events está faltando', async () => {
        const response = await request(app)
          .post('/v1/webhooks')
          .send({ url: 'https://example.com/webhook' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 400 se URL é inválida', async () => {
        const response = await request(app)
          .post('/v1/webhooks')
          .send({
            url: 'invalid-url',
            events: ['patient.created'],
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 400 se eventos são inválidos', async () => {
        const response = await request(app)
          .post('/v1/webhooks')
          .send({
            url: 'https://example.com/webhook',
            events: ['invalid.event', 'another.invalid'],
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe('GET /v1/webhooks', () => {
    describe('✅ Cenários Positivos', () => {
      it('deve listar webhooks do parceiro', async () => {
        const response = await request(app)
          .get('/v1/webhooks');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body).toHaveProperty('total');
        expect(response.body.data.length).toBeGreaterThan(0);
      });

      it('não deve expor secrets na listagem', async () => {
        const response = await request(app)
          .get('/v1/webhooks');

        expect(response.status).toBe(200);
        response.body.data.forEach((webhook: any) => {
          expect(webhook.secret).toBe('***');
        });
      });
    });
  });

  describe('GET /v1/webhooks/:id', () => {
    describe('✅ Cenários Positivos', () => {
      it('deve retornar webhook específico', async () => {
        const response = await request(app)
          .get(`/v1/webhooks/${createdWebhookId}`);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(createdWebhookId);
        expect(response.body).toHaveProperty('url');
        expect(response.body).toHaveProperty('events');
        expect(response.body).toHaveProperty('secret');
      });
    });

    describe('❌ Cenários Negativos', () => {
      it('deve retornar 404 se webhook não existe', async () => {
        const response = await request(app)
          .get('/v1/webhooks/nonexistent-webhook-id');

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 403 se tentar acessar webhook de outro parceiro', async () => {
        // Create webhook with other partner
        const otherWebhookRef = await db.collection('webhooks').add({
          partnerId: otherPartnerId,
          url: 'https://other.com/webhook',
          events: ['patient.created'],
          secret: 'other-secret',
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app)
          .get(`/v1/webhooks/${otherWebhookRef.id}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe('DELETE /v1/webhooks/:id', () => {
    describe('✅ Cenários Positivos', () => {
      it('deve deletar webhook', async () => {
        // Create temp webhook
        const tempWebhookData = {
          url: 'https://temp.com/webhook',
          events: ['dose.missed'],
        };

        const createResponse = await request(app)
          .post('/v1/webhooks')
          .send(tempWebhookData);

        const tempWebhookId = createResponse.body.id;

        const response = await request(app)
          .delete(`/v1/webhooks/${tempWebhookId}`);

        expect(response.status).toBe(204);

        // Verify deletion
        const webhookDoc = await db.collection('webhooks').doc(tempWebhookId).get();
        expect(webhookDoc.exists).toBe(false);
      });
    });

    describe('❌ Cenários Negativos', () => {
      it('deve retornar 404 se webhook não existe', async () => {
        const response = await request(app)
          .delete('/v1/webhooks/nonexistent-webhook-id');

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 403 se tentar deletar webhook de outro parceiro', async () => {
        const otherWebhookRef = await db.collection('webhooks').add({
          partnerId: otherPartnerId,
          url: 'https://other2.com/webhook',
          events: ['medication.deleted'],
          secret: 'other-secret-2',
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app)
          .delete(`/v1/webhooks/${otherWebhookRef.id}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe('POST /v1/webhooks/:id/test', () => {
    describe('✅ Cenários Positivos', () => {
      it('deve enviar webhook de teste', async () => {
        const response = await request(app)
          .post(`/v1/webhooks/${createdWebhookId}/test`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('message');
        // Note: teste real falhará pois URL não existe, mas deve responder corretamente
      });
    });

    describe('❌ Cenários Negativos', () => {
      it('deve retornar 404 se webhook não existe', async () => {
        const response = await request(app)
          .post('/v1/webhooks/nonexistent-webhook-id/test');

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 403 se tentar testar webhook de outro parceiro', async () => {
        const otherWebhookRef = await db.collection('webhooks').add({
          partnerId: otherPartnerId,
          url: 'https://other3.com/webhook',
          events: ['adherence.low'],
          secret: 'other-secret-3',
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app)
          .post(`/v1/webhooks/${otherWebhookRef.id}/test`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });
});
