/**
 * 📊 Adherence Routes - Unit Tests
 * 
 * Testes unitários das rotas de aderência
 * Usa mocks do Firestore
 */

import request from "supertest";
import express, { Express, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { adherenceRouter } from "./adherence.routes";
import { errorHandler } from "../middleware/error-handler";
import { clearMockData } from "../../__tests__/setup";

// Firebase Admin mockado no setup.ts global
const db = admin.firestore();

describe("📊 Adherence Routes - Unit Tests", () => {
  let app: Express;
  const testPartnerId = "test-partner-adherence";
  const testPatientId = "test-patient-adherence-123";
  const testMedicationId = "test-medication-adherence-123";

  afterAll(() => {
    clearMockData();
  });

  beforeEach(async () => {
    // Criar dados de teste no Firestore mock ANTES de cada teste
    // porque o setup global limpa os dados antes de cada teste
    
    // Criar paciente de teste
    await db.collection("patients").doc(testPatientId).set({
      partnerId: testPartnerId,
      name: "Paciente Aderência",
      status: "active",
      createdAt: new Date().toISOString(),
    });

    // Criar medicamento de teste
    await db.collection("medications").doc(testMedicationId).set({
      partnerId: testPartnerId,
      patientId: testPatientId,
      name: "Metformina",
      dosage: "500mg",
      frequency: "daily",
      status: "active",
      createdAt: new Date().toISOString(),
    });

    // Criar histórico de doses
    await db.collection("dose_history").add({
      patientId: testPatientId,
      medicationId: testMedicationId,
      medicationName: "Metformina",
      dosage: "500mg",
      scheduledTime: new Date("2024-01-15T08:00:00Z"),
      takenAt: new Date("2024-01-15T08:15:00Z"),
      status: "taken",
      createdAt: new Date().toISOString(),
    });

    await db.collection("dose_history").add({
      patientId: testPatientId,
      medicationId: testMedicationId,
      medicationName: "Metformina",
      dosage: "500mg",
      scheduledTime: new Date("2024-01-14T08:00:00Z"),
      status: "missed",
      createdAt: new Date().toISOString(),
    });

    await db.collection("dose_history").add({
      patientId: testPatientId,
      medicationId: testMedicationId,
      medicationName: "Metformina",
      dosage: "500mg",
      scheduledTime: new Date("2024-01-13T08:00:00Z"),
      takenAt: new Date("2024-01-13T08:05:00Z"),
      status: "taken",
      createdAt: new Date().toISOString(),
    });

    // Configurar Express com middleware de autenticação simulado
    app = express();
    app.use(express.json());
    
    // Middleware para simular autenticação com partnerId
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).partnerId = testPartnerId;
      next();
    });
    
    app.use("/v1/adherence", adherenceRouter);
    app.use(errorHandler);
  });

  describe("GET /v1/adherence/:patientId", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve retornar métricas de aderência do paciente", async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}`);

        expect(response.status).toBe(200);
        expect(response.body.patientId).toBe(testPatientId);
        expect(response.body).toHaveProperty("metrics");
        expect(response.body.metrics).toHaveProperty("totalDoses");
        expect(response.body.metrics).toHaveProperty("takenDoses");
        expect(response.body.metrics).toHaveProperty("missedDoses");
        expect(response.body.metrics).toHaveProperty("adherenceRate");
      });

      it("deve calcular taxa de aderência corretamente", async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}`);

        expect(response.status).toBe(200);
        // 2 taken de 3 total = 66.67%
        expect(response.body.metrics.totalDoses).toBe(3);
        expect(response.body.metrics.takenDoses).toBe(2);
        expect(response.body.metrics.missedDoses).toBe(1);
        expect(response.body.metrics.adherenceRate).toBeCloseTo(66.67, 1);
      });

      it("deve filtrar por período de tempo", async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}?startDate=2024-01-14&endDate=2024-01-15`);

        expect(response.status).toBe(200);
        expect(response.body.period.startDate).toBe("2024-01-14");
        expect(response.body.period.endDate).toBe("2024-01-15");
      });

      it("deve filtrar por medicamento específico", async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}?medicationId=${testMedicationId}`);

        expect(response.status).toBe(200);
        expect(response.body.byMedication).toBeNull(); // Quando filtrado por med, não retorna breakdown
      });

      it("deve incluir aderência por medicamento quando não filtrado", async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}`);

        expect(response.status).toBe(200);
        expect(response.body.byMedication).toBeDefined();
        expect(Array.isArray(response.body.byMedication)).toBe(true);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se paciente não existe", async () => {
        const response = await request(app)
          .get("/v1/adherence/non-existent-patient");

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se paciente pertence a outro partner", async () => {
        // Criar paciente de outro partner
        const otherPatientId = "other-partner-patient-adherence";
        await db.collection("patients").doc(otherPatientId).set({
          partnerId: "other-partner",
          name: "Outro Paciente",
          status: "active",
        });

        const response = await request(app)
          .get(`/v1/adherence/${otherPatientId}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("GET /v1/adherence/:patientId/history", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve retornar histórico de doses do paciente", async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}/history`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("data");
        expect(response.body).toHaveProperty("pagination");
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it("deve filtrar histórico por status taken", async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}/history?status=taken`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
      });

      it("deve filtrar histórico por status missed", async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}/history?status=missed`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
      });

      it("deve filtrar histórico por medicamento", async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}/history?medicationId=${testMedicationId}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
      });

      it("deve respeitar limit e offset", async () => {
        const response = await request(app)
          .get(`/v1/adherence/${testPatientId}/history?limit=10&offset=0`);

        expect(response.status).toBe(200);
        expect(response.body.pagination.limit).toBe(10);
        expect(response.body.pagination.offset).toBe(0);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se paciente não existe", async () => {
        const response = await request(app)
          .get("/v1/adherence/non-existent/history");

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se paciente pertence a outro partner", async () => {
        // Criar paciente de outro partner
        const otherPatientId = "other-patient-history";
        await db.collection("patients").doc(otherPatientId).set({
          partnerId: "other-partner",
          name: "Outro Paciente",
          status: "active",
        });

        const response = await request(app)
          .get(`/v1/adherence/${otherPatientId}/history`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("POST /v1/adherence/confirm", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve confirmar dose tomada", async () => {
        const scheduledTime = new Date("2024-01-16T08:00:00Z").toISOString();

        const response = await request(app)
          .post("/v1/adherence/confirm")
          .send({
            patientId: testPatientId,
            medicationId: testMedicationId,
            scheduledTime,
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.status).toBe("taken");
        expect(response.body.patientId).toBe(testPatientId);
        expect(response.body.medicationId).toBe(testMedicationId);
      });

      it("deve confirmar dose com horário específico de tomada", async () => {
        const scheduledTime = new Date("2024-01-16T12:00:00Z").toISOString();
        const takenAt = new Date("2024-01-16T12:30:00Z").toISOString();

        const response = await request(app)
          .post("/v1/adherence/confirm")
          .send({
            patientId: testPatientId,
            medicationId: testMedicationId,
            scheduledTime,
            takenAt,
          });

        expect(response.status).toBe(201);
        expect(response.body.status).toBe("taken");
      });

      it("deve confirmar dose com notas", async () => {
        const scheduledTime = new Date("2024-01-16T20:00:00Z").toISOString();

        const response = await request(app)
          .post("/v1/adherence/confirm")
          .send({
            patientId: testPatientId,
            medicationId: testMedicationId,
            scheduledTime,
            notes: "Tomado com refeição",
          });

        expect(response.status).toBe(201);
        expect(response.body.notes).toBe("Tomado com refeição");
      });

      it("deve incluir nome e dosagem do medicamento no registro", async () => {
        const scheduledTime = new Date().toISOString();

        const response = await request(app)
          .post("/v1/adherence/confirm")
          .send({
            patientId: testPatientId,
            medicationId: testMedicationId,
            scheduledTime,
          });

        expect(response.status).toBe(201);
        expect(response.body.medicationName).toBe("Metformina");
        expect(response.body.dosage).toBe("500mg");
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 400 se patientId não fornecido", async () => {
        const response = await request(app)
          .post("/v1/adherence/confirm")
          .send({
            medicationId: testMedicationId,
            scheduledTime: new Date().toISOString(),
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se medicationId não fornecido", async () => {
        const response = await request(app)
          .post("/v1/adherence/confirm")
          .send({
            patientId: testPatientId,
            scheduledTime: new Date().toISOString(),
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se scheduledTime não fornecido", async () => {
        const response = await request(app)
          .post("/v1/adherence/confirm")
          .send({
            patientId: testPatientId,
            medicationId: testMedicationId,
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 404 se paciente não existe", async () => {
        const response = await request(app)
          .post("/v1/adherence/confirm")
          .send({
            patientId: "non-existent-patient",
            medicationId: testMedicationId,
            scheduledTime: new Date().toISOString(),
          });

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 404 se medicamento não existe", async () => {
        const response = await request(app)
          .post("/v1/adherence/confirm")
          .send({
            patientId: testPatientId,
            medicationId: "non-existent-medication",
            scheduledTime: new Date().toISOString(),
          });

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se paciente pertence a outro partner", async () => {
        // Criar paciente de outro partner
        const otherPatientId = "other-patient-confirm";
        await db.collection("patients").doc(otherPatientId).set({
          partnerId: "other-partner",
          name: "Outro Paciente",
          status: "active",
        });

        const response = await request(app)
          .post("/v1/adherence/confirm")
          .send({
            patientId: otherPatientId,
            medicationId: testMedicationId,
            scheduledTime: new Date().toISOString(),
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se medicamento pertence a outro partner", async () => {
        // Criar medicamento de outro partner
        const otherMedId = "other-med-confirm";
        await db.collection("medications").doc(otherMedId).set({
          partnerId: "other-partner",
          patientId: testPatientId,
          name: "Outro Med",
          dosage: "100mg",
          status: "active",
        });

        const response = await request(app)
          .post("/v1/adherence/confirm")
          .send({
            patientId: testPatientId,
            medicationId: otherMedId,
            scheduledTime: new Date().toISOString(),
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });
});
