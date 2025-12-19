# 🎯 SPRINT 3 - Cloud Functions Tests

**Data Início:** 16/12/2025  
**Previsão:** 80h (2 semanas)  
**Objetivo:** Implementar testes completos para todas as Cloud Functions (Stripe, PagSeguro, OCR)

---

## 📊 Status Atual

### Sprints Anteriores
- ✅ **Sprint 1:** Middleware Tests (63 testes, 98.22% coverage)
- ✅ **Sprint 2:** API Routes Tests (110 testes, 97.3% pass rate)

### Sprint 3 - Escopo
- ⏳ Stripe Functions (8 functions, ~40h)
- ⏳ PagSeguro Functions (7 functions, ~35h)
- ⏳ OCR Functions (2 functions, ~5h)

**Total Esperado:** ~150 testes

---

## 🎯 OBJETIVOS

1. **100% Cobertura de Cloud Functions**
   - Testes unitários para todas as functions
   - Testes de integração com APIs externas (mocked)
   - Testes de webhooks

2. **Padrões de Teste**
   - Uso de Firebase Test SDK
   - Mock de Stripe SDK
   - Mock de PagSeguro API
   - Mock de Cloud Vision API
   - Cenários positivos, negativos e edge cases

3. **Documentação**
   - Atualizar TESTING-GUIDE.md
   - Atualizar BACKEND-ROADMAP.md
   - Criar exemplos de uso

---

## 📋 INVENTÁRIO DE FUNCTIONS

### 1. Stripe Functions (8 functions)

#### 1.1 createStripeCheckoutSession
- **Tipo:** HTTP Callable
- **Testes:** 10 cenários
- **Tempo:** 6h

**Cenários:**
- ✅ Deve criar sessão com priceId válido
- ✅ Deve criar customer se não existe
- ✅ Deve reutilizar customer existente
- ✅ Deve aplicar trial de 7 dias
- ✅ Deve aplicar cupom se fornecido
- ❌ Deve retornar erro se não autenticado
- ❌ Deve retornar erro se priceId ausente
- ❌ Deve retornar erro se usuário já tem assinatura ativa
- ⚠️ Deve lidar com falha na API Stripe
- ⚠️ Deve lidar com customer duplicado

#### 1.2 handleStripeWebhook
- **Tipo:** HTTP Request
- **Testes:** 25 cenários (eventos múltiplos)
- **Tempo:** 12h

**Eventos a testar:**
- checkout.session.completed
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.payment_succeeded
- invoice.payment_failed
- payment_intent.succeeded
- payment_intent.payment_failed

#### 1.3 cancelStripeSubscription
- **Tipo:** HTTP Callable
- **Testes:** 8 cenários
- **Tempo:** 4h

#### 1.4 updateStripeSubscription
- **Tipo:** HTTP Callable
- **Testes:** 10 cenários
- **Tempo:** 5h

#### 1.5 createStripePortalSession
- **Tipo:** HTTP Callable
- **Testes:** 6 cenários
- **Tempo:** 3h

#### 1.6 listStripeInvoices
- **Tipo:** HTTP Callable
- **Testes:** 8 cenários
- **Tempo:** 4h

#### 1.7 getStripeSubscriptionStatus
- **Tipo:** HTTP Callable
- **Testes:** 6 cenários
- **Tempo:** 3h

#### 1.8 handleStripeSubscriptionSchedule
- **Tipo:** Background/Scheduled
- **Testes:** 7 cenários
- **Tempo:** 3h

**Total Stripe:** 80 testes, 40h

---

### 2. PagSeguro Functions (7 functions)

#### 2.1 createPagSeguroSubscription
- **Tipo:** HTTP Callable
- **Testes:** 10 cenários
- **Tempo:** 6h

#### 2.2 handlePagSeguroNotification
- **Tipo:** HTTP Request
- **Testes:** 20 cenários
- **Tempo:** 10h

#### 2.3 cancelPagSeguroSubscription
- **Tipo:** HTTP Callable
- **Testes:** 8 cenários
- **Tempo:** 4h

#### 2.4 getPagSeguroTransactionStatus
- **Tipo:** HTTP Callable
- **Testes:** 8 cenários
- **Tempo:** 4h

#### 2.5 generatePagSeguroBoleto
- **Tipo:** HTTP Callable
- **Testes:** 8 cenários
- **Tempo:** 4h

#### 2.6 generatePagSeguroPix
- **Tipo:** HTTP Callable
- **Testes:** 8 cenários
- **Tempo:** 4h

#### 2.7 processPagSeguroRefund
- **Tipo:** HTTP Callable
- **Testes:** 8 cenários
- **Tempo:** 3h

**Total PagSeguro:** 70 testes, 35h

---

### 3. OCR Functions (2 functions)

#### 3.1 processReceiptOCR
- **Tipo:** Storage Trigger
- **Testes:** 12 cenários
- **Tempo:** 4h

**Cenários:**
- ✅ Deve processar imagem válida
- ✅ Deve extrair texto com Cloud Vision
- ✅ Deve identificar medicamentos
- ✅ Deve salvar resultados no Firestore
- ✅ Deve notificar usuário
- ❌ Deve retornar erro se imagem inválida
- ❌ Deve retornar erro se Cloud Vision falhar
- ⚠️ Deve lidar com imagem sem medicamentos
- ⚠️ Deve lidar com OCR de baixa confiança
- ⚠️ Deve lidar com múltiplos medicamentos
- ⚠️ Deve lidar com texto ilegível
- ⚠️ Deve lidar com imagem muito grande

#### 3.2 batchProcessReceipts
- **Tipo:** HTTP Callable
- **Testes:** 8 cenários
- **Tempo:** 1h

**Total OCR:** 20 testes, 5h

---

## 🛠️ FERRAMENTAS E SETUP

### Dependências Necessárias

```json
{
  "devDependencies": {
    "@types/stripe": "^8.0.0",
    "firebase-functions-test": "^3.1.0",
    "nock": "^13.5.0",
    "stripe-mock": "^1.0.0"
  }
}
```

### Mocks Necessários

1. **Stripe Mock:**
```typescript
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn(),
      retrieve: jest.fn()
    },
    checkout: {
      sessions: {
        create: jest.fn()
      }
    }
  }));
});
```

2. **PagSeguro Mock:**
```typescript
// Usar nock para mock HTTP requests
nock('https://ws.pagseguro.uol.com.br')
  .post('/v2/checkout')
  .reply(200, { code: 'CHECKOUT_CODE' });
```

3. **Cloud Vision Mock:**
```typescript
jest.mock('@google-cloud/vision', () => {
  return {
    ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
      textDetection: jest.fn()
    }))
  };
});
```

---

## 📝 ESTRUTURA DE ARQUIVOS

```
src/
├── __tests__/
│   ├── stripe/
│   │   ├── createStripeCheckoutSession.test.ts
│   │   ├── handleStripeWebhook.test.ts
│   │   ├── cancelStripeSubscription.test.ts
│   │   ├── updateStripeSubscription.test.ts
│   │   ├── createStripePortalSession.test.ts
│   │   ├── listStripeInvoices.test.ts
│   │   ├── getStripeSubscriptionStatus.test.ts
│   │   └── handleStripeSubscriptionSchedule.test.ts
│   ├── pagseguro/
│   │   ├── createPagSeguroSubscription.test.ts
│   │   ├── handlePagSeguroNotification.test.ts
│   │   ├── cancelPagSeguroSubscription.test.ts
│   │   ├── getPagSeguroTransactionStatus.test.ts
│   │   ├── generatePagSeguroBoleto.test.ts
│   │   ├── generatePagSeguroPix.test.ts
│   │   └── processPagSeguroRefund.test.ts
│   └── ocr/
│       ├── processReceiptOCR.test.ts
│       └── batchProcessReceipts.test.ts
└── stripe-functions.ts
    pagseguro-functions.ts
    ocr-cloud-vision.ts
```

---

## 📅 CRONOGRAMA

### Semana 1 (40h)
- **Dias 1-2 (16h):** Stripe Functions (1-4)
  - createStripeCheckoutSession
  - handleStripeWebhook
  - cancelStripeSubscription
  - updateStripeSubscription

- **Dias 3-5 (24h):** Stripe Functions (5-8) + PagSeguro (1-3)
  - createStripePortalSession
  - listStripeInvoices
  - getStripeSubscriptionStatus
  - handleStripeSubscriptionSchedule
  - createPagSeguroSubscription
  - handlePagSeguroNotification
  - cancelPagSeguroSubscription

### Semana 2 (40h)
- **Dias 1-3 (24h):** PagSeguro Functions (4-7)
  - getPagSeguroTransactionStatus
  - generatePagSeguroBoleto
  - generatePagSeguroPix
  - processPagSeguroRefund

- **Dias 4-5 (16h):** OCR Functions + Documentação
  - processReceiptOCR
  - batchProcessReceipts
  - Atualizar TESTING-GUIDE.md
  - Atualizar BACKEND-ROADMAP.md
  - Code review e refatoração

---

## ✅ CRITÉRIOS DE ACEITAÇÃO

1. **Cobertura:**
   - ✅ 100% de cobertura de linhas nas Cloud Functions
   - ✅ Todos os cenários positivos testados
   - ✅ Todos os cenários negativos testados
   - ✅ Todos os edge cases testados

2. **Qualidade:**
   - ✅ Todos os testes passando
   - ✅ Sem warnings de lint
   - ✅ Mocks bem estruturados
   - ✅ Testes isolados (sem dependências externas)

3. **Documentação:**
   - ✅ TESTING-GUIDE.md atualizado
   - ✅ BACKEND-ROADMAP.md atualizado
   - ✅ Comentários nos testes
   - ✅ README com instruções

---

## 🎯 PRÓXIMOS PASSOS (Sprint 4)

Após concluir Sprint 3:
- Sprint 4: Testes de utilitários e helpers
- Sprint 5: Testes E2E completos
- Sprint 6: Performance e load testing

---

**Status:** 📋 Planejamento completo  
**Início:** Aguardando aprovação  
**Responsável:** Time de desenvolvimento
