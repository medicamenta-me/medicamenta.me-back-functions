/**
 * 👤 Patients Routes - Integration Tests
 * 
 * Testes de integração para rotas CRUD de pacientes
 * Usa mocks do Firestore
 */

import request from "supertest";
import express, { Application } from "express";
import * as admin from "firebase-admin";
import { patientsRouter } from "../patients.routes";
import { errorHandler } from "../../middleware/error-handler";
import { clearMockData } from "../../../__tests__/setup";

// Firebase Admin mockado no setup.ts global
const db = admin.firestore();

// Test constants
const testPartnerId = "test-partner-patients-" + Date.now();
const otherPartnerId = "other-partner-" + Date.now();

// Mock auth middleware to inject partnerId
const mockAuthMiddleware = (req: any, res: any, next: any) => {
  req.partnerId = testPartnerId;
  next();
};

describe("👤 Patients Routes - Integration Tests", () => {
  let app: Application;
  let createdPatientId: string;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(mockAuthMiddleware);
    app.use("/v1/patients", patientsRouter);
    app.use(errorHandler);
  });

  afterAll(async () => {
    // Cleanup: limpa dados mock
    clearMockData();
  });

  describe("POST /v1/patients", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve criar paciente com dados completos", async () => {
        const patientData = {
          name: "João Silva",
          email: "joao@example.com",
          phone: "+5511999999999",
          dateOfBirth: "1985-03-15",
          gender: "male",
          address: {
            street: "Rua das Flores",
            number: "123",
            city: "São Paulo",
            state: "SP",
            zipCode: "01234-567",
          },
          emergencyContact: {
            name: "Maria Silva",
            phone: "+5511888888888",
            relationship: "spouse",
          },
          medicalConditions: ["diabetes", "hypertension"],
          allergies: ["penicillin"],
          metadata: { source: "web" },
        };

        const response = await request(app)
          .post("/v1/patients")
          .send(patientData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.name).toBe(patientData.name);
        expect(response.body.email).toBe(patientData.email);
        expect(response.body.partnerId).toBe(testPartnerId);
        expect(response.body.status).toBe("active");

        createdPatientId = response.body.id;
      });

      it("deve criar paciente com dados mínimos obrigatórios", async () => {
        const patientData = {
          name: "Maria Santos",
          dateOfBirth: "1990-05-20",
        };

        const response = await request(app)
          .post("/v1/patients")
          .send(patientData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.name).toBe(patientData.name);
        expect(response.body.email).toBeNull();
        expect(response.body.phone).toBeNull();
        expect(response.body.status).toBe("active");
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 400 se name está faltando", async () => {
        const response = await request(app)
          .post("/v1/patients")
          .send({ dateOfBirth: "1990-01-01" });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se dateOfBirth está faltando", async () => {
        const response = await request(app)
          .post("/v1/patients")
          .send({ name: "Test Patient" });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("GET /v1/patients/:id", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve retornar paciente específico por ID", async () => {
        const response = await request(app)
          .get(`/v1/patients/${createdPatientId}`);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(createdPatientId);
        expect(response.body.name).toBe("João Silva");
        expect(response.body.partnerId).toBe(testPartnerId);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se paciente não existe", async () => {
        const response = await request(app)
          .get("/v1/patients/nonexistent-id");

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se tentar acessar paciente de outro parceiro", async () => {
        // Create patient with other partner

        const otherPatientRef = await db.collection("patients").add({
          partnerId: otherPartnerId,
          name: "Other Patient",
          dateOfBirth: new Date("1995-01-01"),
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app)
          .get(`/v1/patients/${otherPatientRef.id}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("GET /v1/patients", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve listar pacientes do parceiro", async () => {
        const response = await request(app)
          .get("/v1/patients");

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("data");
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body).toHaveProperty("pagination");
        
        // Should contain at least the created patient
        expect(response.body.data.length).toBeGreaterThan(0);
        expect(response.body.data[0].partnerId).toBe(testPartnerId);
      });

      it("deve filtrar pacientes por status", async () => {
        const response = await request(app)
          .get("/v1/patients?status=active");

        expect(response.status).toBe(200);
        expect(response.body.data.every((p: any) => p.status === "active")).toBe(true);
      });

      it("deve buscar pacientes por nome (search)", async () => {
        const response = await request(app)
          .get("/v1/patients?search=joão");

        expect(response.status).toBe(200);
        expect(response.body.data.length).toBeGreaterThan(0);
      });

      it("deve respeitar paginação", async () => {
        const response = await request(app)
          .get("/v1/patients?limit=1&offset=0");

        expect(response.status).toBe(200);
        expect(response.body.pagination.limit).toBe(1);
        expect(response.body.pagination.offset).toBe(0);
      });
    });
  });

  describe("PATCH /v1/patients/:id", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve atualizar dados do paciente", async () => {
        const updates = {
          phone: "+5511777777777",
          email: "joao.updated@example.com",
        };

        const response = await request(app)
          .patch(`/v1/patients/${createdPatientId}`)
          .send(updates);

        expect(response.status).toBe(200);
        expect(response.body.phone).toBe(updates.phone);
        expect(response.body.email).toBe(updates.email);
      });

      it("deve atualizar apenas campos fornecidos", async () => {
        const updates = {
          status: "inactive",
        };

        const response = await request(app)
          .patch(`/v1/patients/${createdPatientId}`)
          .send(updates);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("inactive");
        expect(response.body.name).toBe("João Silva"); // Nome não deve mudar
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se paciente não existe", async () => {
        const response = await request(app)
          .patch("/v1/patients/nonexistent-id")
          .send({ name: "Updated" });

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se tentar atualizar paciente de outro parceiro", async () => {

        const otherPatientRef = await db.collection("patients").add({
          partnerId: otherPartnerId,
          name: "Other Patient",
          dateOfBirth: new Date("1995-01-01"),
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app)
          .patch(`/v1/patients/${otherPatientRef.id}`)
          .send({ name: "Hacked" });

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se nenhum campo válido para atualizar", async () => {
        const response = await request(app)
          .patch(`/v1/patients/${createdPatientId}`)
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("DELETE /v1/patients/:id", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve deletar paciente (soft delete)", async () => {
        const response = await request(app)
          .delete(`/v1/patients/${createdPatientId}`);

        expect(response.status).toBe(204);

        // Verify soft delete

        const patientDoc = await db.collection("patients").doc(createdPatientId).get();
        expect(patientDoc.exists).toBe(true);
        expect(patientDoc.data()?.status).toBe("deleted");
      });

      it("deve deletar permanentemente com hard=true", async () => {
        // Create a temporary patient for hard delete test
        const tempPatientData = {
          name: "Temp Patient",
          dateOfBirth: "1992-08-10",
        };

        const createResponse = await request(app)
          .post("/v1/patients")
          .send(tempPatientData);

        const tempPatientId = createResponse.body.id;

        const response = await request(app)
          .delete(`/v1/patients/${tempPatientId}?hard=true`);

        expect(response.status).toBe(204);

        // Verify hard delete

        const patientDoc = await db.collection("patients").doc(tempPatientId).get();
        expect(patientDoc.exists).toBe(false);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se paciente não existe", async () => {
        const response = await request(app)
          .delete("/v1/patients/nonexistent-id");

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se tentar deletar paciente de outro parceiro", async () => {

        const otherPatientRef = await db.collection("patients").add({
          partnerId: otherPartnerId,
          name: "Other Patient",
          dateOfBirth: new Date("1995-01-01"),
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const response = await request(app)
          .delete(`/v1/patients/${otherPatientRef.id}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });
});
