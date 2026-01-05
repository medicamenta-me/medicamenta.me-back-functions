/**
 * 💊 Medications Routes - Unit Tests
 * 
 * Testes unitários das rotas de medicamentos
 * Usa mocks do Firestore
 */

import request from "supertest";
import express, { Express, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { medicationsRouter } from "./medications.routes";
import { errorHandler } from "../middleware/error-handler";
import { clearMockData } from "../../__tests__/setup";

// Firebase Admin mockado no setup.ts global
const db = admin.firestore();

describe("💊 Medications Routes - Unit Tests", () => {
  let app: Express;
  const testPartnerId = "test-partner-medications";
  const testPatientId = "test-patient-123";
  const testMedicationId = "test-medication-123";

  afterAll(() => {
    clearMockData();
  });

  beforeEach(async () => {
    // Criar dados de teste no Firestore mock ANTES de cada teste
    // porque o setup global limpa os dados antes de cada teste
    
    // Criar paciente de teste
    await db.collection("patients").doc(testPatientId).set({
      partnerId: testPartnerId,
      name: "Paciente Teste",
      status: "active",
      createdAt: new Date().toISOString(),
    });

    // Criar medicamento de teste
    await db.collection("medications").doc(testMedicationId).set({
      partnerId: testPartnerId,
      patientId: testPatientId,
      name: "Paracetamol",
      dosage: "500mg",
      frequency: "daily",
      times: ["08:00", "20:00"],
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Configurar Express com middleware de autenticação simulado
    app = express();
    app.use(express.json());
    
    // Middleware para simular autenticação com partnerId
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).partnerId = testPartnerId;
      next();
    });
    
    app.use("/v1/medications", medicationsRouter);
    app.use(errorHandler);
  });

  describe("POST /v1/medications", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve criar medicamento com dados válidos", async () => {
        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: testPatientId,
            name: "Amoxicilina",
            dosage: "250mg",
            frequency: "twice_daily",
            times: ["08:00", "20:00"],
            instructions: "Tomar com comida",
            prescribedBy: "Dr. Silva",
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.name).toBe("Amoxicilina");
        expect(response.body.dosage).toBe("250mg");
        expect(response.body.frequency).toBe("twice_daily");
        expect(response.body.status).toBe("active");
      });

      it("deve criar medicamento com campos mínimos obrigatórios", async () => {
        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: testPatientId,
            name: "Dipirona",
            dosage: "1g",
            frequency: "daily",
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.name).toBe("Dipirona");
      });

      it("deve criar medicamento com refillReminder e stockQuantity", async () => {
        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: testPatientId,
            name: "Insulina",
            dosage: "10UI",
            frequency: "custom",
            times: ["07:00", "12:00", "19:00"],
            refillReminder: true,
            stockQuantity: 30,
          });

        expect(response.status).toBe(201);
        expect(response.body.refillReminder).toBe(true);
        expect(response.body.stockQuantity).toBe(30);
      });

      it("deve criar medicamento com datas de início e fim", async () => {
        const startDate = new Date().toISOString();
        const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: testPatientId,
            name: "Antibiótico",
            dosage: "500mg",
            frequency: "daily",
            startDate,
            endDate,
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("startDate");
        expect(response.body).toHaveProperty("endDate");
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 400 se patientId não fornecido", async () => {
        const response = await request(app)
          .post("/v1/medications")
          .send({
            name: "Remédio",
            dosage: "100mg",
            frequency: "daily",
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se name não fornecido", async () => {
        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: testPatientId,
            dosage: "100mg",
            frequency: "daily",
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se dosage não fornecido", async () => {
        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: testPatientId,
            name: "Remédio",
            frequency: "daily",
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se frequency não fornecido", async () => {
        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: testPatientId,
            name: "Remédio",
            dosage: "100mg",
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 404 se paciente não existe", async () => {
        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: "non-existent-patient",
            name: "Remédio",
            dosage: "100mg",
            frequency: "daily",
          });

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se paciente pertence a outro partner", async () => {
        // Criar paciente de outro partner
        const otherPatientId = "other-partner-patient";
        await db.collection("patients").doc(otherPatientId).set({
          partnerId: "other-partner",
          name: "Outro Paciente",
          status: "active",
        });

        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: otherPatientId,
            name: "Remédio",
            dosage: "100mg",
            frequency: "daily",
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("GET /v1/medications", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve listar medicamentos do partner", async () => {
        const response = await request(app)
          .get("/v1/medications");

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("data");
        expect(response.body).toHaveProperty("pagination");
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it("deve filtrar por patientId", async () => {
        const response = await request(app)
          .get(`/v1/medications?patientId=${testPatientId}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
      });

      it("deve filtrar por status", async () => {
        const response = await request(app)
          .get("/v1/medications?status=active");

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
      });

      it("deve respeitar limit e offset", async () => {
        const response = await request(app)
          .get("/v1/medications?limit=10&offset=0");

        expect(response.status).toBe(200);
        expect(response.body.pagination.limit).toBe(10);
        expect(response.body.pagination.offset).toBe(0);
      });
    });
  });

  describe("GET /v1/medications/:id", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve retornar medicamento por ID", async () => {
        const response = await request(app)
          .get(`/v1/medications/${testMedicationId}`);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(testMedicationId);
        expect(response.body.name).toBe("Paracetamol");
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se medicamento não existe", async () => {
        const response = await request(app)
          .get("/v1/medications/non-existent-id");

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se medicamento pertence a outro partner", async () => {
        // Criar medicamento de outro partner
        const otherMedId = "other-partner-med";
        await db.collection("medications").doc(otherMedId).set({
          partnerId: "other-partner",
          patientId: "other-patient",
          name: "Outro Med",
          dosage: "100mg",
          frequency: "daily",
          status: "active",
        });

        const response = await request(app)
          .get(`/v1/medications/${otherMedId}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("PATCH /v1/medications/:id", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve atualizar nome do medicamento", async () => {
        const response = await request(app)
          .patch(`/v1/medications/${testMedicationId}`)
          .send({ name: "Paracetamol Atualizado" });

        expect(response.status).toBe(200);
        expect(response.body.name).toBe("Paracetamol Atualizado");
      });

      it("deve atualizar dosagem", async () => {
        const response = await request(app)
          .patch(`/v1/medications/${testMedicationId}`)
          .send({ dosage: "1g" });

        expect(response.status).toBe(200);
        expect(response.body.dosage).toBe("1g");
      });

      it("deve atualizar frequência e horários", async () => {
        const response = await request(app)
          .patch(`/v1/medications/${testMedicationId}`)
          .send({
            frequency: "custom",
            times: ["06:00", "12:00", "18:00", "22:00"],
          });

        expect(response.status).toBe(200);
        expect(response.body.frequency).toBe("custom");
        expect(response.body.times).toHaveLength(4);
      });

      it("deve atualizar status para pausado", async () => {
        const response = await request(app)
          .patch(`/v1/medications/${testMedicationId}`)
          .send({ status: "paused" });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("paused");
      });

      it("deve atualizar múltiplos campos", async () => {
        const response = await request(app)
          .patch(`/v1/medications/${testMedicationId}`)
          .send({
            name: "Novo Nome",
            dosage: "2g",
            instructions: "Novas instruções",
            refillReminder: true,
            stockQuantity: 60,
          });

        expect(response.status).toBe(200);
        expect(response.body.name).toBe("Novo Nome");
        expect(response.body.dosage).toBe("2g");
        expect(response.body.instructions).toBe("Novas instruções");
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se medicamento não existe", async () => {
        const response = await request(app)
          .patch("/v1/medications/non-existent-id")
          .send({ name: "Novo Nome" });

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se medicamento pertence a outro partner", async () => {
        // Criar medicamento de outro partner
        const otherMedId = "other-med-patch";
        await db.collection("medications").doc(otherMedId).set({
          partnerId: "other-partner",
          patientId: "other-patient",
          name: "Outro Med",
          dosage: "100mg",
          frequency: "daily",
          status: "active",
        });

        const response = await request(app)
          .patch(`/v1/medications/${otherMedId}`)
          .send({ name: "Tentativa de Update" });

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("DELETE /v1/medications/:id", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve deletar medicamento (soft delete)", async () => {
        const response = await request(app)
          .delete(`/v1/medications/${testMedicationId}`);

        expect(response.status).toBe(204);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se medicamento não existe", async () => {
        const response = await request(app)
          .delete("/v1/medications/non-existent-id");

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se medicamento pertence a outro partner", async () => {
        // Criar medicamento de outro partner
        const otherMedId = "other-med-delete";
        await db.collection("medications").doc(otherMedId).set({
          partnerId: "other-partner",
          patientId: "other-patient",
          name: "Outro Med",
          dosage: "100mg",
          frequency: "daily",
          status: "active",
        });

        const response = await request(app)
          .delete(`/v1/medications/${otherMedId}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });
});
