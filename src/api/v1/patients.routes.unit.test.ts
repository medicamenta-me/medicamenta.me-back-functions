/**
 * 👤 Patients Routes - Unit Tests
 * 
 * Testes unitários das rotas de pacientes
 * Usa mocks do Firestore
 */

import request from "supertest";
import express, { Express, Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { patientsRouter } from "./patients.routes";
import { errorHandler } from "../middleware/error-handler";
import { clearMockData } from "../../__tests__/setup";

// Firebase Admin mockado no setup.ts global
const db = admin.firestore();

describe("👤 Patients Routes - Unit Tests", () => {
  let app: Express;
  const testPartnerId = "test-partner-patients";
  const testPatientId = "test-patient-unit-123";

  afterAll(() => {
    clearMockData();
  });

  beforeEach(async () => {
    // Criar dados de teste no Firestore mock ANTES de cada teste
    // porque o setup global limpa os dados antes de cada teste
    
    // Criar paciente de teste
    await db.collection("patients").doc(testPatientId).set({
      partnerId: testPartnerId,
      name: "João da Silva",
      email: "joao@teste.com",
      phone: "+5511999999999",
      dateOfBirth: new Date("1990-01-15"),
      gender: "male",
      status: "active",
      medicalConditions: ["diabetes"],
      allergies: ["penicilina"],
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
    
    app.use("/v1/patients", patientsRouter);
    app.use(errorHandler);
  });

  describe("POST /v1/patients", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve criar paciente com dados completos", async () => {
        const response = await request(app)
          .post("/v1/patients")
          .send({
            name: "Maria Santos",
            email: "maria@teste.com",
            phone: "+5511988888888",
            dateOfBirth: "1985-06-20",
            gender: "female",
            address: {
              street: "Rua das Flores, 123",
              city: "São Paulo",
              state: "SP",
              zipCode: "01234-567",
            },
            emergencyContact: {
              name: "José Santos",
              phone: "+5511977777777",
              relationship: "spouse",
            },
            medicalConditions: ["hipertensão"],
            allergies: ["aspirina"],
            metadata: { source: "app_mobile" },
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.name).toBe("Maria Santos");
        expect(response.body.email).toBe("maria@teste.com");
        expect(response.body.status).toBe("active");
      });

      it("deve criar paciente com campos mínimos obrigatórios", async () => {
        const response = await request(app)
          .post("/v1/patients")
          .send({
            name: "Pedro Alves",
            dateOfBirth: "2000-03-10",
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.name).toBe("Pedro Alves");
        expect(response.body.email).toBeNull();
        expect(response.body.phone).toBeNull();
      });

      it("deve criar paciente com condições médicas e alergias vazias", async () => {
        const response = await request(app)
          .post("/v1/patients")
          .send({
            name: "Ana Lima",
            dateOfBirth: "1995-12-01",
            medicalConditions: [],
            allergies: [],
          });

        expect(response.status).toBe(201);
        expect(response.body.medicalConditions).toEqual([]);
        expect(response.body.allergies).toEqual([]);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 400 se name não fornecido", async () => {
        const response = await request(app)
          .post("/v1/patients")
          .send({
            dateOfBirth: "1990-01-01",
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se dateOfBirth não fornecido", async () => {
        const response = await request(app)
          .post("/v1/patients")
          .send({
            name: "Paciente Teste",
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se nome e data de nascimento vazios", async () => {
        const response = await request(app)
          .post("/v1/patients")
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("GET /v1/patients/:id", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve retornar paciente por ID", async () => {
        const response = await request(app)
          .get(`/v1/patients/${testPatientId}`);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(testPatientId);
        expect(response.body.name).toBe("João da Silva");
        expect(response.body.email).toBe("joao@teste.com");
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se paciente não existe", async () => {
        const response = await request(app)
          .get("/v1/patients/non-existent-id");

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se paciente pertence a outro partner", async () => {
        // Criar paciente de outro partner
        const otherPatientId = "other-partner-patient";
        await db.collection("patients").doc(otherPatientId).set({
          partnerId: "other-partner",
          name: "Outro Paciente",
          dateOfBirth: new Date("1990-01-01"),
          status: "active",
        });

        const response = await request(app)
          .get(`/v1/patients/${otherPatientId}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });

  describe("GET /v1/patients", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve listar pacientes do partner", async () => {
        const response = await request(app)
          .get("/v1/patients");

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("data");
        expect(response.body).toHaveProperty("pagination");
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it("deve filtrar por status", async () => {
        const response = await request(app)
          .get("/v1/patients?status=active");

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
      });

      it("deve respeitar limit e offset", async () => {
        const response = await request(app)
          .get("/v1/patients?limit=5&offset=0");

        expect(response.status).toBe(200);
        expect(response.body.pagination.limit).toBe(5);
        expect(response.body.pagination.offset).toBe(0);
      });

      it("deve filtrar por busca no nome", async () => {
        const response = await request(app)
          .get("/v1/patients?search=João");

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
      });

      it("deve filtrar por busca no email", async () => {
        const response = await request(app)
          .get("/v1/patients?search=joao@teste");

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
      });
    });
  });

  describe("PATCH /v1/patients/:id", () => {
    describe("✅ Cenários Positivos", () => {
      it("deve atualizar nome do paciente", async () => {
        const response = await request(app)
          .patch(`/v1/patients/${testPatientId}`)
          .send({ name: "João da Silva Junior" });

        expect(response.status).toBe(200);
        expect(response.body.name).toBe("João da Silva Junior");
      });

      it("deve atualizar email", async () => {
        const response = await request(app)
          .patch(`/v1/patients/${testPatientId}`)
          .send({ email: "joao.novo@teste.com" });

        expect(response.status).toBe(200);
        expect(response.body.email).toBe("joao.novo@teste.com");
      });

      it("deve atualizar telefone", async () => {
        const response = await request(app)
          .patch(`/v1/patients/${testPatientId}`)
          .send({ phone: "+5511888888888" });

        expect(response.status).toBe(200);
        expect(response.body.phone).toBe("+5511888888888");
      });

      it("deve atualizar condições médicas", async () => {
        const response = await request(app)
          .patch(`/v1/patients/${testPatientId}`)
          .send({ medicalConditions: ["diabetes", "hipertensão"] });

        expect(response.status).toBe(200);
        expect(response.body.medicalConditions).toContain("diabetes");
        expect(response.body.medicalConditions).toContain("hipertensão");
      });

      it("deve atualizar alergias", async () => {
        const response = await request(app)
          .patch(`/v1/patients/${testPatientId}`)
          .send({ allergies: ["penicilina", "dipirona"] });

        expect(response.status).toBe(200);
        expect(response.body.allergies).toContain("penicilina");
        expect(response.body.allergies).toContain("dipirona");
      });

      it("deve atualizar status para inativo", async () => {
        const response = await request(app)
          .patch(`/v1/patients/${testPatientId}`)
          .send({ status: "inactive" });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("inactive");
      });

      it("deve atualizar múltiplos campos", async () => {
        const response = await request(app)
          .patch(`/v1/patients/${testPatientId}`)
          .send({
            name: "Nome Atualizado",
            email: "email.novo@teste.com",
            phone: "+5511777777777",
            gender: "male",
          });

        expect(response.status).toBe(200);
        expect(response.body.name).toBe("Nome Atualizado");
        expect(response.body.email).toBe("email.novo@teste.com");
      });

      it("deve atualizar endereço", async () => {
        const response = await request(app)
          .patch(`/v1/patients/${testPatientId}`)
          .send({
            address: {
              street: "Nova Rua, 456",
              city: "Rio de Janeiro",
              state: "RJ",
              zipCode: "20000-000",
            },
          });

        expect(response.status).toBe(200);
        expect(response.body.address.city).toBe("Rio de Janeiro");
      });

      it("deve atualizar contato de emergência", async () => {
        const response = await request(app)
          .patch(`/v1/patients/${testPatientId}`)
          .send({
            emergencyContact: {
              name: "Maria da Silva",
              phone: "+5511666666666",
              relationship: "mother",
            },
          });

        expect(response.status).toBe(200);
        expect(response.body.emergencyContact.name).toBe("Maria da Silva");
      });

      it("deve atualizar metadata", async () => {
        const response = await request(app)
          .patch(`/v1/patients/${testPatientId}`)
          .send({
            metadata: { source: "web", referral: "hospital" },
          });

        expect(response.status).toBe(200);
        expect(response.body.metadata.source).toBe("web");
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se paciente não existe", async () => {
        const response = await request(app)
          .patch("/v1/patients/non-existent-id")
          .send({ name: "Novo Nome" });

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se paciente pertence a outro partner", async () => {
        // Criar paciente de outro partner
        const otherPatientId = "other-patient-patch";
        await db.collection("patients").doc(otherPatientId).set({
          partnerId: "other-partner",
          name: "Outro Paciente",
          dateOfBirth: new Date("1990-01-01"),
          status: "active",
        });

        const response = await request(app)
          .patch(`/v1/patients/${otherPatientId}`)
          .send({ name: "Tentativa de Update" });

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 400 se nenhum campo válido para atualizar", async () => {
        const response = await request(app)
          .patch(`/v1/patients/${testPatientId}`)
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
          .delete(`/v1/patients/${testPatientId}`);

        expect(response.status).toBe(204);
      });

      it("deve deletar paciente permanentemente (hard delete)", async () => {
        // Criar paciente para hard delete
        const hardDeletePatientId = "hard-delete-patient";
        await db.collection("patients").doc(hardDeletePatientId).set({
          partnerId: testPartnerId,
          name: "Paciente Hard Delete",
          dateOfBirth: new Date("1990-01-01"),
          status: "active",
        });

        const response = await request(app)
          .delete(`/v1/patients/${hardDeletePatientId}?hard=true`);

        expect(response.status).toBe(204);
      });
    });

    describe("❌ Cenários Negativos", () => {
      it("deve retornar 404 se paciente não existe", async () => {
        const response = await request(app)
          .delete("/v1/patients/non-existent-id");

        expect(response.status).toBe(404);
        expect(response.body.error).toBeDefined();
      });

      it("deve retornar 403 se paciente pertence a outro partner", async () => {
        // Criar paciente de outro partner
        const otherPatientId = "other-patient-delete";
        await db.collection("patients").doc(otherPatientId).set({
          partnerId: "other-partner",
          name: "Outro Paciente",
          dateOfBirth: new Date("1990-01-01"),
          status: "active",
        });

        const response = await request(app)
          .delete(`/v1/patients/${otherPatientId}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBeDefined();
      });
    });
  });
});
