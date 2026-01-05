# 📡 API Endpoints Documentation

**Base URL (Production):** `https://us-central1-medicamenta-me.cloudfunctions.net/api`  
**Base URL (Local):** `http://localhost:5001/medicamenta-me/us-central1/api`

**Version:** 2.0.0  
**Last Updated:** January 3, 2026

---

## 📋 API Overview

| API | Endpoints | Status | Testes |
|-----|-----------|--------|--------|
| API v1 (Legacy) | 25+ | ✅ Stable | 474 |
| **API v2 (New)** | **28** | ✅ **Complete** | **130** |

---

## 🔐 Authentication

### API Key Authentication
Include your API key in the request header:
```
X-API-Key: your_api_key_here
```

### JWT Authentication
For user-specific operations, include JWT token:
```
Authorization: Bearer your_jwt_token_here
```

---

## 📋 Available Endpoints

### 1. Health & Info

#### GET `/health`
Check API health status

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-12T10:00:00.000Z",
  "version": "1.0.0",
  "uptime": 123456
}
```

#### GET `/`
API information and available endpoints

**Response:**
```json
{
  "name": "Medicamenta.me Public API",
  "version": "1.0.0",
  "description": "RESTful API for healthcare partner integrations",
  "documentation": "/docs",
  "endpoints": {
    "auth": "/v1/auth",
    "patients": "/v1/patients",
    "medications": "/v1/medications",
    "adherence": "/v1/adherence",
    "reports": "/v1/reports",
    "webhooks": "/v1/webhooks"
  }
}
```

---

### 2. Authentication Routes (`/v1/auth`)

#### POST `/v1/auth/login`
Authenticate and receive JWT token

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name"
  },
  "expiresIn": 86400
}
```

#### POST `/v1/auth/register`
Register new user

**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "secure_password",
  "name": "New User"
}
```

#### POST `/v1/auth/refresh`
Refresh JWT token

**Request:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

---

### 3. Patients Routes (`/v1/patients`)
**Requires:** API Key + JWT Authentication

#### GET `/v1/patients`
List all patients

**Query Parameters:**
- `limit` (number, default: 20)
- `offset` (number, default: 0)
- `search` (string, optional)

**Response:**
```json
{
  "patients": [
    {
      "id": "patient_id",
      "name": "Patient Name",
      "email": "patient@example.com",
      "dateOfBirth": "1990-01-01",
      "phone": "+5511999999999",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "total": 100,
  "limit": 20,
  "offset": 0
}
```

#### GET `/v1/patients/:patientId`
Get patient details

**Response:**
```json
{
  "id": "patient_id",
  "name": "Patient Name",
  "email": "patient@example.com",
  "dateOfBirth": "1990-01-01",
  "phone": "+5511999999999",
  "address": {
    "street": "Rua Example",
    "number": "123",
    "city": "São Paulo",
    "state": "SP",
    "zipCode": "01234-567"
  },
  "medications": [],
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-11-12T10:00:00.000Z"
}
```

#### POST `/v1/patients`
Create new patient

**Request:**
```json
{
  "name": "New Patient",
  "email": "patient@example.com",
  "dateOfBirth": "1990-01-01",
  "phone": "+5511999999999"
}
```

#### PATCH `/v1/patients/:patientId`
Update patient information

#### DELETE `/v1/patients/:patientId`
Delete patient (soft delete)

---

### 4. Medications Routes (`/v1/medications`)
**Requires:** API Key + JWT Authentication

#### GET `/v1/medications`
List medications for authenticated user

**Query Parameters:**
- `patientId` (string, required)
- `status` (string: active, inactive, all)
- `limit` (number)
- `offset` (number)

**Response:**
```json
{
  "medications": [
    {
      "id": "medication_id",
      "name": "Medication Name",
      "dosage": "10mg",
      "frequency": "2x ao dia",
      "schedule": ["08:00", "20:00"],
      "startDate": "2025-01-01",
      "endDate": "2025-12-31",
      "status": "active",
      "prescriptionUrl": "https://storage.googleapis.com/...",
      "notes": "Tomar com água"
    }
  ],
  "total": 5
}
```

#### GET `/v1/medications/:medicationId`
Get medication details

#### POST `/v1/medications`
Create new medication

**Request:**
```json
{
  "patientId": "patient_id",
  "name": "Medication Name",
  "dosage": "10mg",
  "frequency": "2x ao dia",
  "schedule": ["08:00", "20:00"],
  "startDate": "2025-01-01",
  "endDate": "2025-12-31"
}
```

#### PATCH `/v1/medications/:medicationId`
Update medication

#### DELETE `/v1/medications/:medicationId`
Delete medication

---

### 5. Adherence Routes (`/v1/adherence`)
**Requires:** API Key + JWT Authentication

#### GET `/v1/adherence`
Get adherence statistics

**Query Parameters:**
- `patientId` (string, required)
- `startDate` (string, ISO date)
- `endDate` (string, ISO date)
- `medicationId` (string, optional)

**Response:**
```json
{
  "patientId": "patient_id",
  "period": {
    "start": "2025-11-01",
    "end": "2025-11-12"
  },
  "statistics": {
    "totalDoses": 100,
    "takenDoses": 85,
    "missedDoses": 15,
    "adherenceRate": 85.0
  },
  "byMedication": [
    {
      "medicationId": "medication_id",
      "medicationName": "Medication Name",
      "totalDoses": 20,
      "takenDoses": 18,
      "adherenceRate": 90.0
    }
  ]
}
```

#### POST `/v1/adherence/record`
Record medication taken

**Request:**
```json
{
  "patientId": "patient_id",
  "medicationId": "medication_id",
  "scheduledTime": "08:00",
  "takenTime": "08:15",
  "status": "taken",
  "notes": "Tomei com café"
}
```

---

### 6. Reports Routes (`/v1/reports`)
**Requires:** API Key + JWT Authentication

#### GET `/v1/reports/adherence`
Generate adherence report

**Query Parameters:**
- `patientId` (string, required)
- `startDate` (string, ISO date)
- `endDate` (string, ISO date)
- `format` (string: json, pdf, csv)

#### GET `/v1/reports/medications`
Generate medications report

#### GET `/v1/reports/export`
Export patient data

---

### 7. Webhooks Routes (`/v1/webhooks`)
**Requires:** API Key

#### POST `/v1/webhooks/stripe`
Stripe webhook handler

**Headers:**
- `stripe-signature` (required)

#### POST `/v1/webhooks/pagseguro`
PagSeguro webhook handler

---

## 🔥 Firebase Cloud Functions (Triggers)

### Stripe Functions

#### `createStripeCheckoutSession`
**Trigger:** Firestore onCreate
**Path:** `users/{userId}/checkout_sessions/{sessionId}`

Creates a Stripe Checkout Session when a new document is created.

#### `handleStripeWebhook`
**Trigger:** HTTPS
**Path:** `/stripeWebhook`

Handles Stripe webhook events (payment success, subscription updates, etc.)

#### `cancelStripeSubscription`
**Trigger:** Firestore onDelete
**Path:** `users/{userId}/subscriptions/{subscriptionId}`

Cancels Stripe subscription when document is deleted.

---

### PagSeguro Functions

#### `createPagSeguroSubscription`
**Trigger:** Firestore onCreate
**Path:** `users/{userId}/pagseguro_subscriptions/{subscriptionId}`

Creates PagSeguro subscription.

#### `handlePagSeguroNotification`
**Trigger:** HTTPS
**Path:** `/pagSeguroNotification`

Handles PagSeguro webhook notifications.

#### `cancelPagSeguroSubscription`
**Trigger:** Firestore onDelete
**Path:** `users/{userId}/pagseguro_subscriptions/{subscriptionId}`

Cancels PagSeguro subscription.

---

### OCR Functions

#### `processReceiptOCR`
**Trigger:** Cloud Storage
**Path:** `gs://{bucket}/receipts/{userId}/{receiptId}`

Processes uploaded receipt images using Google Cloud Vision API.

**Response Structure:**
```json
{
  "receiptId": "receipt_id",
  "userId": "user_id",
  "extractedText": "Full OCR text",
  "medications": [
    {
      "name": "Medication Name",
      "dosage": "10mg",
      "quantity": "30 comp",
      "confidence": 0.95
    }
  ],
  "processedAt": "2025-11-12T10:00:00.000Z"
}
```

---

## 📊 Rate Limits

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Authentication | 10 requests | 1 minute |
| Read Operations | 100 requests | 1 minute |
| Write Operations | 50 requests | 1 minute |
| Webhooks | 1000 requests | 1 minute |

---

## ⚠️ Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

**Error Response Format:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "timestamp": "2025-11-12T10:00:00.000Z",
    "requestId": "req_123456",
    "details": {
      "field": "email",
      "value": "invalid-email"
    }
  }
}
```

---

## 🔗 Interactive Documentation

**Swagger UI:** `/api-docs`  
**OpenAPI Spec:** `/openapi.json`

---

## 🚀 API v2 Endpoints (NEW - January 2026)

A API v2 fornece endpoints otimizados para integração completa entre todos os projetos da plataforma Medicamenta.me.

**Base URL v2:** `/api/v2`  
**Status:** ✅ **28 endpoints implementados + 130 testes unitários**

---

### 10. Orders Routes (`/api/v2/orders`) ✅
**Descrição:** Gestão completa de pedidos do marketplace  
**Testes:** 37 testes unitários (100% cobertura)

#### GET `/api/v2/orders`
Listar pedidos com paginação

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `status` (string, optional): pending, processing, shipped, delivered, cancelled
- `userId` (string, optional)
- `pharmacyId` (string, optional)

**Response:**
```json
{
  "data": [
    {
      "id": "order_123",
      "userId": "user_456",
      "pharmacyId": "pharmacy_789",
      "status": "pending",
      "total": 150.00,
      "items": [...],
      "createdAt": "2026-01-03T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### POST `/api/v2/orders`
Criar novo pedido

**Request:**
```json
{
  "userId": "user_456",
  "pharmacyId": "pharmacy_789",
  "items": [
    { "productId": "prod_001", "quantity": 2 }
  ],
  "shippingAddress": {
    "street": "Rua Example",
    "number": "123",
    "city": "São Paulo",
    "state": "SP",
    "zipCode": "01234-567"
  }
}
```

#### GET `/api/v2/orders/:id`
Obter detalhes do pedido

#### PUT `/api/v2/orders/:id/status`
Atualizar status do pedido

**Request:**
```json
{
  "status": "shipped",
  "trackingCode": "BR123456789"
}
```

#### POST `/api/v2/orders/:id/cancel`
Cancelar pedido

**Request:**
```json
{
  "reason": "Cliente solicitou cancelamento"
}
```

#### POST `/api/v2/orders/:id/refund`
Solicitar reembolso

**Request:**
```json
{
  "reason": "Produto com defeito",
  "amount": 50.00
}
```

#### GET `/api/v2/orders/tracking/:id`
Obter informações de tracking

---

### 11. Products Routes (`/api/v2/products`) ✅
**Descrição:** Gestão completa de produtos do marketplace  
**Testes:** 31 testes unitários (100% cobertura)

#### GET `/api/v2/products`
Listar produtos com paginação e filtros

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `category` (string, optional)
- `pharmacyId` (string, optional)
- `minPrice` (number, optional)
- `maxPrice` (number, optional)
- `inStock` (boolean, optional)

**Response:**
```json
{
  "data": [
    {
      "id": "prod_001",
      "name": "Paracetamol 500mg",
      "description": "Analgésico e antitérmico",
      "price": 15.90,
      "category": "analgesics",
      "pharmacyId": "pharmacy_789",
      "stock": 100,
      "active": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 500,
    "totalPages": 25
  }
}
```

#### GET `/api/v2/products/search`
Buscar produtos por termo

**Query Parameters:**
- `q` (string, required): termo de busca
- `page` (number, default: 1)
- `limit` (number, default: 20)

#### GET `/api/v2/products/categories`
Listar todas as categorias de produtos

**Response:**
```json
{
  "categories": [
    { "id": "analgesics", "name": "Analgésicos", "count": 150 },
    { "id": "antibiotics", "name": "Antibióticos", "count": 80 }
  ]
}
```

#### GET `/api/v2/products/:id`
Obter detalhes do produto

#### POST `/api/v2/products`
Criar novo produto (requer autenticação de farmácia)

#### PUT `/api/v2/products/:id`
Atualizar produto

#### DELETE `/api/v2/products/:id`
Remover produto (soft delete)

#### PUT `/api/v2/products/:id/stock`
Atualizar estoque do produto

**Request:**
```json
{
  "stock": 50,
  "operation": "set"  // ou "add", "subtract"
}
```

---

### 12. Pharmacies Routes (`/api/v2/pharmacies`) ✅
**Descrição:** Gestão completa de farmácias do marketplace  
**Testes:** 25 testes unitários (100% cobertura)

#### GET `/api/v2/pharmacies`
Listar farmácias com paginação

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `status` (string, optional): active, inactive, pending
- `city` (string, optional)
- `state` (string, optional)

**Response:**
```json
{
  "data": [
    {
      "id": "pharmacy_789",
      "name": "Farmácia Central",
      "cnpj": "12.345.678/0001-90",
      "email": "contato@farmaciacentral.com",
      "phone": "+5511999999999",
      "address": {...},
      "status": "active",
      "rating": 4.5
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

#### GET `/api/v2/pharmacies/nearby`
Buscar farmácias próximas por geolocalização

**Query Parameters:**
- `lat` (number, required): latitude
- `lng` (number, required): longitude
- `radius` (number, default: 10): raio em km
- `limit` (number, default: 20)

**Response:**
```json
{
  "pharmacies": [
    {
      "id": "pharmacy_789",
      "name": "Farmácia Central",
      "distance": 1.5,
      "address": {...}
    }
  ]
}
```

#### GET `/api/v2/pharmacies/:id`
Obter detalhes da farmácia

#### POST `/api/v2/pharmacies`
Criar nova farmácia (requer autenticação admin)

#### PUT `/api/v2/pharmacies/:id`
Atualizar farmácia

#### GET `/api/v2/pharmacies/:id/products`
Listar produtos de uma farmácia específica

---

### 13. Financial Routes (`/api/v2/financial`) ✅
**Descrição:** Gestão financeira de assinaturas, faturas e reembolsos  
**Testes:** 37 testes unitários (100% cobertura)

#### GET `/api/v2/financial/subscriptions`
Listar assinaturas

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `status` (string, optional): active, cancelled, expired
- `pharmacyId` (string, optional)

**Response:**
```json
{
  "data": [
    {
      "id": "sub_001",
      "pharmacyId": "pharmacy_789",
      "plan": "premium",
      "status": "active",
      "amount": 299.00,
      "startDate": "2026-01-01",
      "endDate": "2026-12-31"
    }
  ],
  "pagination": {...}
}
```

#### GET `/api/v2/financial/subscriptions/:id`
Obter detalhes da assinatura

#### GET `/api/v2/financial/invoices`
Listar faturas

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `status` (string, optional): pending, paid, overdue, cancelled
- `pharmacyId` (string, optional)
- `startDate` (date, optional)
- `endDate` (date, optional)

#### GET `/api/v2/financial/refunds`
Listar solicitações de reembolso

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `status` (string, optional): pending, approved, rejected
- `orderId` (string, optional)

#### POST `/api/v2/financial/refunds/:id/approve`
Aprovar solicitação de reembolso

**Response:** `204 No Content`

#### POST `/api/v2/financial/refunds/:id/reject`
Rejeitar solicitação de reembolso

**Request:**
```json
{
  "reason": "Fora do prazo de reembolso"
}
```

**Response:** `204 No Content`

#### GET `/api/v2/financial/stats`
Obter estatísticas financeiras

**Query Parameters:**
- `startDate` (date, optional)
- `endDate` (date, optional)
- `pharmacyId` (string, optional)

**Response:**
```json
{
  "totalRevenue": 150000.00,
  "totalRefunds": 5000.00,
  "activeSubscriptions": 45,
  "pendingInvoices": 12,
  "period": {
    "start": "2026-01-01",
    "end": "2026-01-31"
  }
}
```

---

## 📊 API v2 Summary

| Módulo | Endpoints | Testes | Status |
|--------|-----------|--------|--------|
| Orders | 7 | 37 | ✅ 100% |
| Products | 8 | 31 | ✅ 100% |
| Pharmacies | 6 | 25 | ✅ 100% |
| Financial | 7 | 37 | ✅ 100% |
| **TOTAL** | **28** | **130** | ✅ **DONE** |

---

## 📞 Support

- **Email:** api-support@medicamenta.me
- **Documentation:** https://docs.medicamenta.me
- **Status Page:** https://status.medicamenta.me

---

_Last updated: January 3, 2026_
