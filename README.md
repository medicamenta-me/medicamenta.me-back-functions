# 🔧 Medicamenta.me - Backend API

**Versão:** 3.0  
**Última Atualização:** 05 de janeiro de 2026  
**Status:** ✅ Produção

---

## 📋 Visão Geral

Backend centralizado da plataforma Medicamenta.me, implementado como Firebase Cloud Functions. Fornece API RESTful (v1/v2), integração com gateways de pagamento (Stripe, PagSeguro), OCR para receitas médicas, e sistema completo de auditoria.

---

## 📊 Métricas do Projeto

| Métrica | Valor | Status |
|---------|-------|--------|
| **Testes Unitários** | 1.213 | ✅ 100% passing |
| **Cobertura** | 86.84% | ✅ Acima do threshold |
| **Endpoints API** | 59 | ✅ Documentados |
| **Cloud Functions** | 20+ | ✅ Produção |
| **Build Errors** | 0 | ✅ |
| **Lint Errors** | 0 | ✅ |
| **Vulnerabilidades** | 0 | ✅ |

---

## 🛠️ Stack Tecnológica

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| **Node.js** | 22.x | Runtime |
| **TypeScript** | 5.6 | Linguagem |
| **Firebase Functions** | 6.x | Serverless Framework |
| **Express** | 4.x | API Gateway |
| **Zod** | 3.x | Validação de schemas |
| **Jest** | 29.x | Testes |
| **Swagger** | 5.x | Documentação API |

### Integrações

| Serviço | Propósito |
|---------|-----------|
| **Firebase Auth** | Autenticação |
| **Firestore** | Banco de dados |
| **Cloud Storage** | Armazenamento de arquivos |
| **Cloud Vision** | OCR de receitas |
| **Stripe** | Pagamentos internacionais |
| **PagSeguro** | Pagamentos Brasil |
| **FCM** | Push notifications |

---

## 🏗️ Arquitetura

### Diagrama de Alto Nível

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLOUD FUNCTIONS                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        EXPRESS API GATEWAY                        │   │
│  │                                                                    │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │   │
│  │  │    Auth    │  │   Logger   │  │ RateLimiter│  │   Cache    │  │   │
│  │  │ Middleware │  │ Middleware │  │ Middleware │  │ Middleware │  │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │   │
│  │                                                                    │   │
│  │  ┌─────────────────────┐    ┌─────────────────────────────────┐  │   │
│  │  │      API v1         │    │           API v2                 │  │   │
│  │  │  /v1/patients       │    │  /v2/orders    /v2/admin        │  │   │
│  │  │  /v1/medications    │    │  /v2/products  /v2/pharmacies   │  │   │
│  │  └─────────────────────┘    └─────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐                     │
│  │  FIRESTORE TRIGGERS  │  │   SCHEDULED JOBS     │                     │
│  │  onOrderCreated      │  │  cleanupExpired      │                     │
│  │  onOrderStatusUpdate │  │  syncAnalytics       │                     │
│  │  onPharmacyApproved  │  │  sendReminders       │                     │
│  └──────────────────────┘  └──────────────────────┘                     │
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐                     │
│  │   PAYMENT WEBHOOKS   │  │      OCR SERVICE     │                     │
│  │  Stripe webhooks     │  │  Cloud Vision API    │                     │
│  │  PagSeguro webhooks  │  │  Prescription parser │                     │
│  └──────────────────────┘  └──────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              FIREBASE                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Firestore  │  │    Auth     │  │   Storage   │  │     FCM     │    │
│  │   (NoSQL)   │  │  (Users)    │  │  (Files)    │  │   (Push)    │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Estrutura de Diretórios

```
src/
├── index.ts                    # Entry point - exporta todas as functions
├── api/
│   ├── index.ts               # Express app principal
│   ├── swagger.ts             # Documentação OpenAPI 3.0
│   ├── cold-start-optimizer.ts # Otimização de cold start
│   ├── middleware/
│   │   ├── auth.ts            # JWT validation + Firebase Auth
│   │   ├── admin.ts           # Admin-only middleware
│   │   ├── rate-limiter.ts    # Rate limiting por IP/user
│   │   ├── cache.middleware.ts # Response caching (LRU)
│   │   ├── validation.ts      # Zod schema validation
│   │   ├── logger.ts          # Structured logging
│   │   └── error-handler.ts   # Global error handler
│   ├── v1/
│   │   ├── patients.routes.ts # CRUD pacientes
│   │   └── medications.routes.ts
│   ├── v2/
│   │   ├── orders.routes.ts   # Pedidos marketplace
│   │   ├── products.routes.ts # Produtos
│   │   ├── pharmacies.routes.ts # Farmácias
│   │   ├── financial.routes.ts # Financeiro
│   │   ├── schemas/           # Zod schemas para validação
│   │   └── admin/             # Endpoints administrativos
│   │       ├── orders.admin.ts
│   │       ├── pharmacies.admin.ts
│   │       ├── products.admin.ts
│   │       └── audit.admin.ts
│   ├── services/
│   │   ├── audit.service.ts   # Auditoria centralizada
│   │   └── query-optimizer.ts # Otimização de queries
│   └── utils/
│       └── api-error.ts       # Custom error classes
├── services/
│   └── lgpd.service.ts        # Conformidade LGPD
├── triggers/
│   ├── orders.ts              # onOrderCreated, onOrderStatusUpdated
│   ├── pharmacies.ts          # onPharmacyCreated, onPharmacyApproved
│   └── products.ts            # onProductCreated, onProductUpdated
├── utils/
│   ├── structured-logger.ts   # Logger estruturado (JSON)
│   ├── memory-profiler.ts     # Profiling de memória
│   └── validators.ts          # Validadores customizados
├── ocr-cloud-vision.ts        # OCR de receitas médicas
├── stripe-functions.ts        # Webhooks e integração Stripe
├── pagseguro-functions.ts     # Webhooks e integração PagSeguro
└── __tests__/                 # Testes unitários
```

---

## 🔌 API Endpoints

### API v1 - Legado (Pacientes/Medicamentos)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/v1/patients` | Listar pacientes |
| POST | `/v1/patients` | Criar paciente |
| GET | `/v1/patients/:id` | Buscar paciente |
| PUT | `/v1/patients/:id` | Atualizar paciente |
| DELETE | `/v1/patients/:id` | Remover paciente |
| GET | `/v1/medications` | Listar medicamentos |
| POST | `/v1/medications` | Criar medicamento |

### API v2 - Marketplace

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/v2/orders` | Listar pedidos do usuário |
| POST | `/v2/orders` | Criar pedido |
| GET | `/v2/orders/:id` | Detalhes do pedido |
| GET | `/v2/products` | Buscar produtos |
| GET | `/v2/products/:id` | Detalhes do produto |
| GET | `/v2/pharmacies` | Listar farmácias |
| GET | `/v2/pharmacies/nearby` | Farmácias próximas |
| GET | `/v2/pharmacies/:id` | Detalhes da farmácia |

### API v2 - Admin (Backoffice)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/v2/admin/orders/stats` | Estatísticas de pedidos |
| PATCH | `/v2/admin/orders/:id/status` | Atualizar status |
| POST | `/v2/admin/orders/:id/cancel` | Cancelar pedido |
| POST | `/v2/admin/orders/:id/refund` | Processar reembolso |
| GET | `/v2/admin/pharmacies/pending` | Farmácias pendentes |
| POST | `/v2/admin/pharmacies/:id/approve` | Aprovar farmácia |
| POST | `/v2/admin/pharmacies/:id/suspend` | Suspender farmácia |
| GET | `/v2/admin/audit` | Logs de auditoria |
| GET | `/v2/admin/audit/export` | Exportar auditoria |

### Documentação Swagger

**URL:** `/api-docs/`

---

## 🔒 Segurança

### Autenticação

- **Firebase Auth:** JWT tokens validados em cada request
- **Admin Middleware:** Verificação de claims `admin: true`
- **API Keys:** Para integrações externas

### Rate Limiting

```typescript
// Configuração por rota
const rateLimits = {
  '/v2/orders': { windowMs: 60000, max: 30 },
  '/v2/admin/*': { windowMs: 60000, max: 100 },
  '/v2/products': { windowMs: 60000, max: 60 }
};
```

### LGPD Compliance

- **Data Export:** Exportação de dados do usuário (Art. 18, V)
- **Data Deletion:** Anonimização com verificação de retenção legal
- **Consent Management:** Gestão de consentimentos por finalidade
- **Audit Trail:** Log de todas as operações em dados pessoais

---

## 📝 Logging Estruturado

### Formato do Log

```json
{
  "timestamp": "2026-01-05T12:00:00.000Z",
  "level": "info",
  "correlationId": "uuid-v4",
  "service": "medicamenta-api",
  "action": "order.created",
  "userId": "user123",
  "resourceType": "order",
  "resourceId": "order456",
  "durationMs": 145,
  "memoryUsageMB": 128,
  "sensitiveDataMasked": true,
  "aiHints": {
    "severity": "low",
    "suggestedAction": null,
    "requiresAttention": false
  }
}
```

### Mascaramento LGPD

Dados sensíveis automaticamente mascarados:
- CPF, CNPJ
- Email, Telefone
- Tokens, Senhas
- Dados de saúde

---

## 🚀 Comandos

### Desenvolvimento

```bash
# Instalar dependências
npm install

# Build
npm run build

# Watch mode
npm run build:watch

# Emuladores Firebase
npm run serve

# Testes
npm test

# Testes com coverage
npm test -- --coverage

# Lint
npm run lint

# Lint fix
npm run lint:fix
```

### Deploy

```bash
# Deploy completo
npm run deploy

# Deploy específico
firebase deploy --only functions:api
firebase deploy --only functions:stripeWebhook
```

---

## ⚙️ Configuração

### Variáveis de Ambiente

```bash
# Firebase Config
firebase functions:config:set \
  stripe.secret_key="sk_live_..." \
  stripe.webhook_secret="whsec_..." \
  pagseguro.email="..." \
  pagseguro.token="..." \
  pagseguro.sandbox="false"
```

### Cold Start Optimization

```typescript
// minInstances mantém functions warm
export const api = functions
  .runWith({
    minInstances: 1,
    memory: '256MB',
    timeoutSeconds: 60
  })
  .https.onRequest(app);
```

---

## 🧪 Testes

### Estrutura de Testes

```
src/__tests__/
├── api/
│   ├── middleware/
│   │   ├── auth.spec.ts
│   │   ├── cache.spec.ts
│   │   └── rate-limiter.spec.ts
│   └── v2/
│       ├── orders.spec.ts
│       ├── products.spec.ts
│       └── admin/
│           ├── orders.admin.spec.ts
│           └── pharmacies.admin.spec.ts
├── triggers/
│   ├── orders.test.ts
│   └── pharmacies.test.ts
├── services/
│   └── lgpd.service.spec.ts
└── utils/
    └── structured-logger.spec.ts
```

### Coverage Thresholds

```javascript
// jest.config.js
coverageThreshold: {
  global: {
    branches: 78,
    functions: 80,
    lines: 80,
    statements: 80
  }
}
```

---

## 📚 Documentação Adicional

| Documento | Descrição |
|-----------|-----------|
| [API-ENDPOINTS.md](./API-ENDPOINTS.md) | Documentação detalhada de todos os endpoints |
| [TESTING-GUIDE.md](./TESTING-GUIDE.md) | Guia de testes |
| [INTEGRATIONS-SETUP.md](./INTEGRATIONS-SETUP.md) | Setup de integrações (Stripe, PagSeguro) |

---

## 🔗 Links

- **Swagger UI:** https://us-central1-medicamenta-me.cloudfunctions.net/api/api-docs/
- **Firebase Console:** https://console.firebase.google.com/project/medicamenta-me
- **Documentação Firebase Functions:** https://firebase.google.com/docs/functions

---

*Última atualização: 05/01/2026*
