/**
 * 📊 Adherence Routes - Integration Tests
 * 
 * Testes de integração para rotas de controle de aderência
 * Usa Firebase Emulator (não mocks)
 */

import request from 'supertest';
import express, { Application } from 'express';
import * as admin from 'firebase-admin';
import { adherenceRouter } from '../adherence.routes';
import { errorHandler } from '../../middleware/error-handler';

// Firebase Admin já inicializado no setup.ts global
const db = admin.firestore();

// Test constants
const testPartnerId = 'test-partner-adherence-' + Date.now();
const otherPartnerId = 'other-partner-' + Date.now();
const testPatientId = 'test-patient-adherence-' + Date.now();
const testMedicationId = 'test-medication-adherence-' + Date.now();

// Mock auth middleware to inject partnerId
const mockAuthMiddleware = (req: any, res: any, next: any) => {
  req.partnerId = testPartnerId;
  next();
};

describe('📊 Adherence Routes - Integration Tests', () => {
  let app: Application;

  beforeAll(async () => {
    // Create test patient
    await db.collection('patients').doc(testPatientId).set({
      partnerId: testPartnerId,
      name: 'Test Patient Adherence',
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
      totalDoses: 0,
      takenDoses: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create test dose history records
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await db.collection('dose_history').add({
      patientId: testPatientId,
      medicationId: testMedicationId,
      medicationName: 'Test Medication',
      dosage: '10mg',
      scheduledTime: yesterday,
      takenAt: yesterday,
      status: 'taken',
      source: 'test',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('dose_history').add({
      patientId: testPatientId,
      medicationId: testMedicationId,
      medicationName: 'Test Medication',
      dosage: '10mg',
      scheduledTime: new Date(),
      takenAt: null,
      status: 'missed',
      source: 'test',
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

    // Delete patients and medications from other partner
    const otherPatientsSnapshot = await db.collection('patients')
      .where('partnerId', '==', otherPartnerId)
      .get();
    
    const otherMedicationsSnapshot = await db.collection('medications')
      .where('partnerId', '==', otherPartnerId)
      .get();

    const otherDeletePromises = [
      ...otherPatientsSnapshot.docs.map(doc => doc.ref.delete()),
      ...otherMedicationsSnapshot.docs.map(doc => doc.ref.delete()),
    ];

    await Promise.all(otherDeletePromises);
  }, 30000);

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(mockAuthMiddleware);
    app.use('/v1/adherence', adherenceRouter);
    app.use(errorHandler);
  });

  describe('GET /v1/adherence/:patientId', () => {
    describe('✅ Cenários Positivos', () => {
      it('deve retornar métricas de aderência do paciente', async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('patientId', testPatientId);
        expect(response.body).toHaveProperty('metrics');
        expect(response.body.metrics).toHaveProperty('totalDoses');
        expect(response.body.metrics).toHaveProperty('takenDoses');
        expect(response.body.metrics).toHaveProperty('missedDoses');
        expect(response.body.metrics).toHaveProperty('adherenceRate');
        expect(response.body.metrics.totalDoses).toBeGreaterThanOrEqual(2);
      });

      it('deve filtrar por medicação específica', async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}?medicationId=${testMedicationId}`);

        expect(response.status).toBe(200);
        expect(response.body.metrics.totalDoses).toBeGreaterThanOrEqual(2);
      });

      it('deve filtrar por período de datas', async () => {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        const endDate = new Date();

        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`);

        expect(response.status).toBe(200);
        expect(response.body.period.startDate).toBeDefined();
        expect(response.body.period.endDate).toBeDefined();
      });

      it('deve filtrar apenas por startDate (sem endDate)', async () => {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);

        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}?startDate=${startDate.toISOString()}`);

        expect(response.status).toBe(200);
        expect(response.body.period.startDate).toBeDefined();
        expect(response.body.period.endDate).toBeNull();
      });

      it('deve filtrar apenas por endDate (sem startDate)', async () => {
        const endDate = new Date();

        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}?endDate=${endDate.toISOString()}`);

        expect(response.status).toBe(200);
        expect(response.body.period.startDate).toBeNull();
        expect(response.body.period.endDate).toBeDefined();
      });

      it('deve incluir breakdown por medicação', async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('byMedication');
        expect(Array.isArray(response.body.byMedication)).toBe(true);
      });
    });

    describe('❌ Cenários Negativos', () => {
      it('deve retornar 404 se paciente não existe', async () => {
        const response = await request(app)
          .get('/v1/adherence/nonexistent-patient-id');

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 403 se tentar acessar paciente de outro parceiro', async () => {
        // Create patient with other partner
        const otherPatientId = 'other-patient-' + Date.now();
        await db.collection('patients').doc(otherPatientId).set({
          partnerId: otherPartnerId,
          name: 'Other Patient',
          dateOfBirth: new Date('1995-01-01'),
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app)
          .get(`/v1/adherence/${otherPatientId}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe('GET /v1/adherence/:patientId/history', () => {
    describe('✅ Cenários Positivos', () => {
      it('deve retornar histórico de doses do paciente', async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}/history`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body).toHaveProperty('pagination');
        expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      });

      it('deve filtrar por status', async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}/history?status=taken`);

        expect(response.status).toBe(200);
        expect(response.body.data.every((d: any) => d.status === 'taken')).toBe(true);
      });

      it('deve filtrar por medicação', async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}/history?medicationId=${testMedicationId}`);

        expect(response.status).toBe(200);
        expect(response.body.data.every((d: any) => d.medicationId === testMedicationId)).toBe(true);
      });

      it('deve respeitar paginação', async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}/history?limit=1&offset=0`);

        expect(response.status).toBe(200);
        expect(response.body.pagination.limit).toBe(1);
        expect(response.body.pagination.offset).toBe(0);
      });
    });

    describe('❌ Cenários Negativos', () => {
      it('deve retornar 404 se paciente não existe', async () => {
        const response = await request(app)
          .get('/v1/adherence/nonexistent-patient-id/history');

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 403 se tentar acessar histórico de outro parceiro', async () => {
        const otherPatientId = 'other-patient-history-' + Date.now();
        await db.collection('patients').doc(otherPatientId).set({
          partnerId: otherPartnerId,
          name: 'Other Patient',
          dateOfBirth: new Date('1995-01-01'),
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app)
          .get(`/v1/adherence/${otherPatientId}/history`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe('POST /v1/adherence/confirm', () => {
    describe('✅ Cenários Positivos', () => {
      it('deve confirmar dose tomada com dados completos', async () => {
        const doseData = {
          patientId: testPatientId,
          medicationId: testMedicationId,
          scheduledTime: new Date().toISOString(),
          takenAt: new Date().toISOString(),
          notes: 'Tomado no horário',
        };

        const response = await request(app)
          .post('/v1/adherence/confirm')
          .send(doseData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.patientId).toBe(testPatientId);
        expect(response.body.medicationId).toBe(testMedicationId);
        expect(response.body.status).toBe('taken');
      });

      it('deve confirmar dose com dados mínimos', async () => {
        const doseData = {
          patientId: testPatientId,
          medicationId: testMedicationId,
          scheduledTime: new Date().toISOString(),
        };

        const response = await request(app)
          .post('/v1/adherence/confirm')
          .send(doseData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.status).toBe('taken');
      });
    });

    describe('❌ Cenários Negativos', () => {
      it('deve retornar 400 se patientId está faltando', async () => {
        const response = await request(app)
          .post('/v1/adherence/confirm')
          .send({
            medicationId: testMedicationId,
            scheduledTime: new Date().toISOString(),
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 400 se medicationId está faltando', async () => {
        const response = await request(app)
          .post('/v1/adherence/confirm')
          .send({
            patientId: testPatientId,
            scheduledTime: new Date().toISOString(),
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 400 se scheduledTime está faltando', async () => {
        const response = await request(app)
          .post('/v1/adherence/confirm')
          .send({
            patientId: testPatientId,
            medicationId: testMedicationId,
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 404 se paciente não existe', async () => {
        const response = await request(app)
          .post('/v1/adherence/confirm')
          .send({
            patientId: 'nonexistent-patient',
            medicationId: testMedicationId,
            scheduledTime: new Date().toISOString(),
          });

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 404 se medicação não existe', async () => {
        const response = await request(app)
          .post('/v1/adherence/confirm')
          .send({
            patientId: testPatientId,
            medicationId: 'nonexistent-medication',
            scheduledTime: new Date().toISOString(),
          });

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 403 se tentar confirmar dose para paciente de outro parceiro', async () => {
        const otherPatientId = 'other-patient-confirm-' + Date.now();
        await db.collection('patients').doc(otherPatientId).set({
          partnerId: otherPartnerId,
          name: 'Other Patient',
          dateOfBirth: new Date('1995-01-01'),
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app)
          .post('/v1/adherence/confirm')
          .send({
            patientId: otherPatientId,
            medicationId: testMedicationId,
            scheduledTime: new Date().toISOString(),
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });

      it('deve retornar 403 se tentar confirmar dose com medicação de outro parceiro', async () => {
        const otherMedicationId = 'other-medication-' + Date.now();
        await db.collection('medications').doc(otherMedicationId).set({
          partnerId: otherPartnerId,
          patientId: testPatientId,
          name: 'Other Medication',
          dosage: '20mg',
          frequency: 'daily',
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app)
          .post('/v1/adherence/confirm')
          .send({
            patientId: testPatientId,
            medicationId: otherMedicationId,
            scheduledTime: new Date().toISOString(),
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });
});
