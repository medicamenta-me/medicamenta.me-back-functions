/**
 * 💊 Medications Routes - Integration Tests
 * 
 * Tests CRUD operations for medications management
 */

import express, { Express } from "express";
import * as admin from "firebase-admin";
import request from "supertest";
import { medicationsRouter } from "../medications.routes";
import { errorHandler } from "../../middleware/error-handler";

// Firebase Admin já inicializado no setup.ts global
const db = admin.firestore();

describe("💊 Medications Routes - Integration Tests", () => {
  let app: Express;
  const testPartnerId = "test-partner-" + Date.now();
  const testPatientId = "test-patient-" + Date.now();
  let testMedicationId: string;

  // Mock middleware to inject partnerId
  const mockAuthMiddleware = (req: any, res: any, next: any) => {
    req.partnerId = testPartnerId;
    next();
  };

  beforeAll(async () => {
    // Create test patient
    await db.collection("patients").doc(testPatientId).set({
      partnerId: testPartnerId,
      name: "Test Patient",
      email: "patient@test.com",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }, 30000);

  afterAll(async () => {
    // Clean up test data
    await db.collection("patients").doc(testPatientId).delete();

    // Clean up medications
    const medicationsSnapshot = await db
      .collection("medications")
      .where("partnerId", "==", testPartnerId)
      .get();

    const deletePromises = medicationsSnapshot.docs.map((doc) => doc.ref.delete());
    await Promise.all(deletePromises);
  }, 30000);

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(mockAuthMiddleware);
    app.use("/v1/medications", medicationsRouter);
    app.use(errorHandler);
  });

  describe("POST /v1/medications", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve criar medicação com dados completos", async () => {
        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: testPatientId,
            name: "Aspirina",
            dosage: "100mg",
            frequency: "daily",
            times: ["08:00"],
            startDate: "2025-01-01",
            instructions: "Tomar com água",
            prescribedBy: "Dr. Silva",
            refillReminder: true,
            stockQuantity: 30,
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.name).toBe("Aspirina");
        expect(response.body.dosage).toBe("100mg");
        expect(response.body.frequency).toBe("daily");
        expect(response.body.status).toBe("active");
        expect(response.body.partnerId).toBe(testPartnerId);
        expect(response.body.patientId).toBe(testPatientId);

        testMedicationId = response.body.id;
      });

      it("deve criar medicação com dados mínimos", async () => {
        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: testPatientId,
            name: "Ibuprofeno",
            dosage: "200mg",
            frequency: "twice_daily",
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.name).toBe("Ibuprofeno");
        expect(response.body.stockQuantity).toBe(0);
        expect(response.body.refillReminder).toBe(false);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 400 se campos obrigatórios faltando", async () => {
        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: testPatientId,
            name: "Medicamento",
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 404 se paciente não existe", async () => {
        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: "nonexistent-patient",
            name: "Medicamento",
            dosage: "10mg",
            frequency: "daily",
          });

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se tentar criar medicação para paciente de outro parceiro", async () => {
        // Create patient from another partner
        const otherPatientId = "other-patient-" + Date.now();
        await db.collection("patients").doc(otherPatientId).set({
          partnerId: "other-partner",
          name: "Other Patient",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app)
          .post("/v1/medications")
          .send({
            patientId: otherPatientId,
            name: "Medicamento",
            dosage: "10mg",
            frequency: "daily",
          });

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();

        // Cleanup
        await db.collection("patients").doc(otherPatientId).delete();
      });
    });
  });

  describe("GET /v1/medications", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve listar medicações do parceiro", async () => {
        const response = await request(app).get("/v1/medications");

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("data");
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body).toHaveProperty("pagination");
        
        // Verify all medications belong to the partner
        response.body.data.forEach((med: any) => {
          expect(med.partnerId).toBe(testPartnerId);
        });
      });

      it("deve filtrar medicações por patientId", async () => {
        const response = await request(app)
          .get("/v1/medications")
          .query({ patientId: testPatientId });

        expect(response.status).toBe(200);
        expect(response.body.data.length).toBeGreaterThan(0);
        
        response.body.data.forEach((med: any) => {
          expect(med.patientId).toBe(testPatientId);
        });
      });

      it("deve filtrar medicações por status", async () => {
        const response = await request(app)
          .get("/v1/medications")
          .query({ status: "active" });

        expect(response.status).toBe(200);
        
        response.body.data.forEach((med: any) => {
          expect(med.status).toBe("active");
        });
      });

      it("deve respeitar paginação", async () => {
        const response = await request(app)
          .get("/v1/medications")
          .query({ limit: 1, offset: 0 });

        expect(response.status).toBe(200);
        expect(response.body.pagination.limit).toBe(1);
        expect(response.body.pagination.offset).toBe(0);
      });
    });
  });

  describe("GET /v1/medications/:id", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve retornar medicação específica", async () => {
        const response = await request(app).get(`/v1/medications/${testMedicationId}`);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(testMedicationId);
        expect(response.body.name).toBe("Aspirina");
        expect(response.body.partnerId).toBe(testPartnerId);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se medicação não existe", async () => {
        const response = await request(app).get("/v1/medications/nonexistent-id");

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se tentar acessar medicação de outro parceiro", async () => {
        // Create medication for another partner
        const otherMedRef = await db.collection("medications").add({
          partnerId: "other-partner",
          patientId: "other-patient",
          name: "Other Med",
          dosage: "10mg",
          frequency: "daily",
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app).get(`/v1/medications/${otherMedRef.id}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();

        // Cleanup
        await otherMedRef.delete();
      });
    });
  });

  describe("PATCH /v1/medications/:id", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve atualizar medicação", async () => {
        const response = await request(app)
          .patch(`/v1/medications/${testMedicationId}`)
          .send({
            dosage: "150mg",
            frequency: "twice_daily",
            times: ["08:00", "20:00"],
          });

        expect(response.status).toBe(200);
        expect(response.body.dosage).toBe("150mg");
        expect(response.body.frequency).toBe("twice_daily");
        expect(response.body.times).toEqual(["08:00", "20:00"]);
      });

      it("deve atualizar apenas campos fornecidos", async () => {
        const response = await request(app)
          .patch(`/v1/medications/${testMedicationId}`)
          .send({
            stockQuantity: 60,
          });

        expect(response.status).toBe(200);
        expect(response.body.stockQuantity).toBe(60);
        expect(response.body.name).toBe("Aspirina"); // Unchanged
      });

      it("deve lidar com body vazio (nenhum campo para atualizar)", async () => {
        const response = await request(app)
          .patch(`/v1/medications/${testMedicationId}`)
          .send({});

        expect(response.status).toBe(200);
        // Apenas updatedAt deve ser modificado
        expect(response.body).toHaveProperty("updatedAt");
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se medicação não existe", async () => {
        const response = await request(app)
          .patch("/v1/medications/nonexistent-id")
          .send({ dosage: "200mg" });

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se tentar atualizar medicação de outro parceiro", async () => {
        const otherMedRef = await db.collection("medications").add({
          partnerId: "other-partner",
          patientId: "other-patient",
          name: "Other Med",
          dosage: "10mg",
          frequency: "daily",
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app)
          .patch(`/v1/medications/${otherMedRef.id}`)
          .send({ dosage: "200mg" });

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();

        await otherMedRef.delete();
      });
    });
  });

  describe("DELETE /v1/medications/:id", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve deletar medicação (soft delete)", async () => {
        const response = await request(app).delete(`/v1/medications/${testMedicationId}`);

        expect(response.status).toBe(204);

        // Verify soft delete
        const medicationDoc = await db.collection("medications").doc(testMedicationId).get();
        expect(medicationDoc.exists).toBe(true);
        expect(medicationDoc.data()!.status).toBe("deleted");
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se medicação não existe", async () => {
        const response = await request(app).delete("/v1/medications/nonexistent-id");

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se tentar deletar medicação de outro parceiro", async () => {
        const otherMedRef = await db.collection("medications").add({
          partnerId: "other-partner",
          patientId: "other-patient",
          name: "Other Med",
          dosage: "10mg",
          frequency: "daily",
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app).delete(`/v1/medications/${otherMedRef.id}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();

        await otherMedRef.delete();
      });
    });
  });
});
