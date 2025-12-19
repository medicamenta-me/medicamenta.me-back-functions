/**
 * 📈 Reports Routes - Integration Tests
 * 
 * Testes de integração para rotas de relatórios
 * Usa Firebase Emulator (não mocks)
 */

import request from 'supertest';
import express, { Application } from 'express';
import * as admin from 'firebase-admin';
import { reportsRouter } from '../reports.routes';
import { errorHandler } from '../../middleware/error-handler';

// Firebase Admin já inicializado no setup.ts global
const db = admin.firestore();

// Test constants
const testPartnerId = 'test-partner-reports-' + Date.now();
const testPatientId = 'test-patient-reports-' + Date.now();
const testMedicationId = 'test-medication-reports-' + Date.now();

// Mock auth middleware to inject partnerId
const mockAuthMiddleware = (req: any, res: any, next: any) => {
  req.partnerId = testPartnerId;
  next();
};

describe('📈 Reports Routes - Integration Tests', () => {
  let app: Application;

  beforeAll(async () => {
    // Create test patient
    await db.collection('patients').doc(testPatientId).set({
      partnerId: testPartnerId,
      name: 'Test Patient Reports',
      dateOfBirth: new Date('1990-01-01'),
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create test medication
    await db.collection('medications').doc(testMedicationId).set({
      partnerId: testPartnerId,
      patientId: testPatientId,
      name: 'Test Medication',
      dosage: '10mg',
      frequency: 'daily',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create dose history for reports
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await db.collection('dose_history').add({
      patientId: testPatientId,
      medicationId: testMedicationId,
      scheduledTime: yesterday,
      status: 'taken',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('dose_history').add({
      patientId: testPatientId,
      medicationId: testMedicationId,
      scheduledTime: new Date(),
      status: 'missed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }, 30000);

  afterAll(async () => {
    // Cleanup: Delete all test data
    await db.collection('patients').doc(testPatientId).delete();
    await db.collection('medications').doc(testMedicationId).delete();

    // Delete dose history
    const doseSnapshot = await db.collection('dose_history')
      .where('patientId', '==', testPatientId)
      .get();

    const deletePromises = doseSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deletePromises);
  }, 30000);

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(mockAuthMiddleware);
    app.use('/v1/reports', reportsRouter);
    app.use(errorHandler);
  });

  describe('GET /v1/reports/adherence', () => {
    describe('✅ Cenários Positivos', () => {
      it('deve retornar relatório de aderência de todos os pacientes', async () => {
        const response = await request(app)
          .get('/v1/reports/adherence');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('report', 'adherence');
        expect(response.body).toHaveProperty('generatedAt');
        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('summary');
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
      });

      it('deve filtrar por patientId específico', async () => {
        const response = await request(app)
          .get(`/v1/reports/adherence?patientId=${testPatientId}`);

        expect(response.status).toBe(200);
        expect(response.body.data.length).toBe(1);
        expect(response.body.data[0].patientId).toBe(testPatientId);
      });

      it('deve filtrar por período de datas', async () => {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        const endDate = new Date();

        const response = await request(app)
          .get(`/v1/reports/adherence?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`);

        expect(response.status).toBe(200);
        expect(response.body.period.startDate).toBeDefined();
        expect(response.body.period.endDate).toBeDefined();
      });

      it('deve incluir métricas detalhadas por paciente', async () => {
        const response = await request(app)
          .get('/v1/reports/adherence');

        expect(response.status).toBe(200);
        const patientData = response.body.data[0];
        expect(patientData).toHaveProperty('patientId');
        expect(patientData).toHaveProperty('patientName');
        expect(patientData).toHaveProperty('medicationsCount');
        expect(patientData).toHaveProperty('totalDoses');
        expect(patientData).toHaveProperty('takenDoses');
        expect(patientData).toHaveProperty('missedDoses');
        expect(patientData).toHaveProperty('adherenceRate');
      });

      it('deve calcular taxa média de aderência no sumário', async () => {
        const response = await request(app)
          .get('/v1/reports/adherence');

        expect(response.status).toBe(200);
        expect(response.body.summary).toHaveProperty('totalPatients');
        expect(response.body.summary).toHaveProperty('averageAdherence');
        expect(typeof response.body.summary.averageAdherence).toBe('number');
      });
    });
  });

  describe('GET /v1/reports/compliance', () => {
    describe('✅ Cenários Positivos', () => {
      it('deve retornar relatório de compliance', async () => {
        const response = await request(app)
          .get('/v1/reports/compliance');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('report', 'compliance');
        expect(response.body).toHaveProperty('generatedAt');
        expect(response.body).toHaveProperty('partnerId', testPartnerId);
        expect(response.body).toHaveProperty('metrics');
      });

      it('deve incluir métricas gerais do parceiro', async () => {
        const response = await request(app)
          .get('/v1/reports/compliance');

        expect(response.status).toBe(200);
        expect(response.body.metrics).toHaveProperty('totalPatients');
        expect(response.body.metrics).toHaveProperty('activePatients');
        expect(response.body.metrics).toHaveProperty('totalMedications');
        expect(response.body.metrics.totalPatients).toBeGreaterThan(0);
      });

      it('deve incluir métricas dos últimos 30 dias', async () => {
        const response = await request(app)
          .get('/v1/reports/compliance');

        expect(response.status).toBe(200);
        expect(response.body.metrics).toHaveProperty('last30Days');
        expect(response.body.metrics.last30Days).toHaveProperty('totalDoses');
        expect(response.body.metrics.last30Days).toHaveProperty('takenDoses');
        expect(response.body.metrics.last30Days).toHaveProperty('missedDoses');
        expect(response.body.metrics.last30Days).toHaveProperty('adherenceRate');
      });
    });
  });

  describe('POST /v1/reports/export', () => {
    describe('✅ Cenários Positivos', () => {
      it('deve exportar relatório em formato JSON', async () => {
        const response = await request(app)
          .post('/v1/reports/export')
          .send({ reportType: 'adherence', format: 'json' });

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
      });

      it('deve aceitar formato CSV', async () => {
        const response = await request(app)
          .post('/v1/reports/export')
          .send({ reportType: 'compliance', format: 'csv' });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/csv');
      });

      it('deve usar formato JSON por padrão', async () => {
        const response = await request(app)
          .post('/v1/reports/export')
          .send({ reportType: 'adherence' });

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
      });
    });

    describe('❌ Cenários Negativos', () => {
      it('deve retornar 400 se reportType está faltando', async () => {
        const response = await request(app)
          .post('/v1/reports/export')
          .send({ format: 'json' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 400 se reportType é inválido', async () => {
        const response = await request(app)
          .post('/v1/reports/export')
          .send({ reportType: 'invalid-report-type', format: 'json' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 400 se formato é inválido', async () => {
        const response = await request(app)
          .post('/v1/reports/export')
          .send({ reportType: 'adherence', format: 'invalid-format' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });
    });
  });
});
