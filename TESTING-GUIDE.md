# 🧪 Testing Guide - Backend Functions

**Última atualização:** 18/12/2025

---

## ⚠️ PRÉ-REQUISITO: Firebase Emulators

**IMPORTANTE:** Os testes requerem que o **Firestore Emulator** esteja rodando!

### Iniciar Emulators (Terminal separado)

```bash
# Opção 1: Script npm
npm run emulators:start

# Opção 2: Firebase CLI direto
firebase emulators:start --only firestore

# Verificar se está rodando
# PowerShell: Test-NetConnection localhost -Port 8080
# Browser: http://localhost:4000
```

**Porta:** Firestore Emulator = `localhost:8080`

---

## 📋 Testes Disponíveis

### 1. Build Test ✅
```bash
npm run build
```
**Status:** ✅ Passando (0 erros TypeScript)

### 2. Lint Test
```bash
npm run lint
```

### 3. Unit Tests ✅
```bash
# ATENÇÃO: Requer emulators rodando!
npm test
```
**Status:** 🟡 222/351 testes passando (129 aguardando emulator)

---

## 🎯 Sprint 1: Middleware Tests (63 testes) ✅

Testes de integração para todos os middlewares de API.

### Coverage: 98.22%

```bash
npm test -- middleware
```

### Arquivos Testados:
- `auth.middleware.test.ts` - Autenticação e JWT (18 testes)
- `rate-limiter.middleware.test.ts` - Rate limiting (13 testes)
- `api-key.middleware.test.ts` - API keys validation (10 testes)
- `error-handler.middleware.test.ts` - Error handling (12 testes)
- `request-logger.middleware.test.ts` - Logging (10 testes)

### Resultados:
```
Test Suites: 5 passed, 5 total
Tests:       63 passed, 63 total
Time:        ~25s
Coverage:    98.22%
```

---

## 🎯 Sprint 2: API Routes Tests (110 testes) ✅

Testes de integração para todas as rotas da API v1.

```bash
npm test -- routes
```

### Arquivos Testados:

#### 1. auth.routes.test.ts (19 testes)
- POST /v1/auth/login - Login com email/senha
- POST /v1/auth/register - Registro de usuários
- POST /v1/auth/refresh - Refresh tokens
- GET /v1/auth/me - Dados do usuário autenticado
- POST /v1/auth/logout - Logout

```bash
npm test -- auth.routes
```

#### 2. medications.routes.test.ts (19 testes)
- GET /v1/medications - Listar medicações
- POST /v1/medications - Criar medicação
- GET /v1/medications/:id - Obter medicação
- PUT /v1/medications/:id - Atualizar medicação
- DELETE /v1/medications/:id - Deletar medicação

```bash
npm test -- medications.routes
```

#### 3. patients.routes.test.ts (20 testes)
- GET /v1/patients - Listar pacientes
- POST /v1/patients - Criar paciente
- GET /v1/patients/:id - Obter paciente
- PUT /v1/patients/:id - Atualizar paciente
- DELETE /v1/patients/:id - Deletar paciente

```bash
npm test -- patients.routes
```

#### 4. adherence.routes.test.ts (21 testes)
- GET /v1/adherence/:patientId - Métricas de aderência
- GET /v1/adherence/:patientId/history - Histórico de doses
- POST /v1/adherence/confirm - Confirmar dose tomada

```bash
npm test -- adherence.routes
```

#### 5. reports.routes.test.ts (14 testes)
- GET /v1/reports/adherence - Relatório de aderência
- GET /v1/reports/compliance - Relatório de compliance
- POST /v1/reports/export - Exportar relatórios (JSON/CSV)

```bash
npm test -- reports.routes
```

#### 6. webhooks.routes.test.ts (17 testes)
- POST /v1/webhooks - Criar webhook
- GET /v1/webhooks - Listar webhooks
- GET /v1/webhooks/:id - Obter webhook
- DELETE /v1/webhooks/:id - Deletar webhook
- POST /v1/webhooks/:id/test - Testar webhook delivery

```bash
npm test -- webhooks.routes
```

### Resultados Sprint 2:
```
Test Suites: 6 passed, 6 total
Tests:       107 passed, 3 skipped, 110 total
Time:        ~55s
Pass Rate:   97.3% (107/110)
```

**Nota:** 1 teste de auth.routes.test.ts pode falhar ocasionalmente devido a eventual consistency do Firebase Emulator.

### Padrões Aplicados:

1. **Lazy Initialization:**
   ```typescript
   const getDb = () => admin.firestore();
   ```

2. **Integration Tests:**
   - Firebase Emulator (Firestore)
   - Sem mocks (testes de integração reais)
   - Mock de auth middleware para injetar partnerId

3. **Error Handling:**
   ```typescript
   try {
     // logic
   } catch (error) {
     next(error);
   }
   ```

4. **Test Structure:**
   ```typescript
   beforeAll(() => {
     // Setup test data
   });
   
   afterAll(async () => {
     // Cleanup Firestore
   });
   ```

---

## 🧪 Executar Todos os Testes

```bash
# Todos os testes
npm test

# Com coverage
npm test -- --coverage

# Sem coverage (mais rápido)
npm test -- --no-coverage

# Watch mode
npm test -- --watch

# Específico por arquivo
npm test -- auth.routes.test.ts
```

---

## 🔥 Testando com Emuladores Firebase

### Iniciar Emuladores

```bash
# Apenas Functions
firebase emulators:start --only functions

# Functions + Firestore + Auth
firebase emulators:start --only functions,firestore,auth

# Todos os emuladores
firebase emulators:start
```

### URLs dos Emuladores

- **Functions:** http://localhost:5001
- **Firestore:** http://localhost:8080
- **Auth:** http://localhost:9099
- **Emulator UI:** http://localhost:4000

---

## 📡 Testando Endpoints da API

### 1. Health Check

```bash
# Produção
curl https://us-central1-medicamenta-me.cloudfunctions.net/api/health

# Local (emulators)
curl http://localhost:5001/medicamenta-me/us-central1/api/health
```

**Resposta esperada:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-12T...",
  "version": "1.0.0",
  "uptime": 123456
}
```

### 2. API Info

```bash
curl http://localhost:5001/medicamenta-me/us-central1/api/
```

### 3. Endpoints Protegidos

**Login (obter JWT):**
```bash
curl -X POST http://localhost:5001/medicamenta-me/us-central1/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

**Usar JWT para acessar endpoints:**
```bash
# Substituir YOUR_JWT_TOKEN pelo token recebido no login
curl http://localhost:5001/medicamenta-me/us-central1/api/v1/patients \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "X-API-Key: test_api_key"
```

---

## 💳 Testando Stripe

### 1. Checkout Session

```bash
# Criar documento no Firestore para trigger
# users/{userId}/checkout_sessions/{sessionId}
```

**Dados do documento:**
```json
{
  "plan": "premium",
  "billingInterval": "monthly",
  "email": "customer@example.com",
  "successUrl": "https://app.medicamenta.me/success",
  "cancelUrl": "https://app.medicamenta.me/cancel"
}
```

### 2. Webhook Testing (Local)

```bash
# Instalar Stripe CLI
# Windows: scoop install stripe
# Mac: brew install stripe

# Login
stripe login

# Forward webhooks para emulador local
stripe listen --forward-to http://localhost:5001/medicamenta-me/us-central1/handleStripeWebhook

# Em outro terminal, trigger evento
stripe trigger checkout.session.completed
```

### 3. Cartões de Teste

| Card Number | Scenario |
|------------|----------|
| 4242 4242 4242 4242 | Sucesso |
| 4000 0000 0000 0002 | Decline |
| 4000 0000 0000 9995 | Insufficient funds |
| 4000 0027 6000 3184 | 3D Secure required |

**Dados para teste:**
- Expiry: Qualquer data futura (ex: 12/34)
- CVC: Qualquer 3 dígitos (ex: 123)
- ZIP: Qualquer 5 dígitos (ex: 12345)

---

## 🇧🇷 Testando PagSeguro

### 1. Ambiente Sandbox

```bash
# Configure .env.local com credenciais sandbox
PAGSEGURO_ENV=sandbox
PAGSEGURO_EMAIL=sandbox-email@test.com
PAGSEGURO_TOKEN=sandbox_token
```

### 2. Criar Assinatura

```bash
# Criar documento no Firestore
# users/{userId}/pagseguro_subscriptions/{subscriptionId}
```

**Dados do documento:**
```json
{
  "plan": "premium",
  "billingInterval": "monthly",
  "customerEmail": "customer@example.com",
  "customerName": "Test Customer",
  "customerPhone": "+5511999999999"
}
```

### 3. Testar Notificações

```bash
# PagSeguro envia notificações POST
curl -X POST http://localhost:5001/medicamenta-me/us-central1/handlePagSeguroNotification \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "notificationCode=TEST_NOTIFICATION_CODE&notificationType=transaction"
```

---

## 📸 Testando OCR (Cloud Vision)

### 1. Upload de Imagem

```javascript
// Frontend - upload para Storage
const storageRef = ref(storage, `receipts/${userId}/${receiptId}.jpg`);
await uploadBytes(storageRef, file);
```

### 2. Trigger Automático

Quando imagem é uploaded, a function `processReceiptOCR` é ativada automaticamente.

### 3. Verificar Resultado

```javascript
// Ler resultado do Firestore
const docRef = doc(db, `users/${userId}/ocr_results/${receiptId}`);
const docSnap = await getDoc(docRef);
console.log(docSnap.data());
```

**Resposta esperada:**
```json
{
  "receiptId": "receipt_123",
  "userId": "user_123",
  "extractedText": "FARMÁCIA XYZ\nDipirona 500mg...",
  "medications": [
    {
      "name": "Dipirona",
      "dosage": "500mg",
      "quantity": "30 comprimidos",
      "confidence": 0.95
    }
  ],
  "processedAt": "2025-11-12T..."
}
```

---

## 🧪 Collection de Testes (Postman/Insomnia)

### Importar Collection

Crie arquivo `medicamenta-api.postman_collection.json`:

```json
{
  "info": {
    "name": "Medicamenta.me API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "url": "{{baseUrl}}/health"
      }
    },
    {
      "name": "API Info",
      "request": {
        "method": "GET",
        "url": "{{baseUrl}}/"
      }
    },
    {
      "name": "Login",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/v1/auth/login",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"test@example.com\",\n  \"password\": \"password123\"\n}"
        }
      }
    },
    {
      "name": "List Patients",
      "request": {
        "method": "GET",
        "url": "{{baseUrl}}/v1/patients",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{jwt_token}}"
          },
          {
            "key": "X-API-Key",
            "value": "{{api_key}}"
          }
        ]
      }
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:5001/medicamenta-me/us-central1/api"
    },
    {
      "key": "jwt_token",
      "value": ""
    },
    {
      "key": "api_key",
      "value": "test_api_key"
    }
  ]
}
```

---

## 📊 Logs e Debugging

### Ver Logs Locais

```bash
# Durante execução dos emulators
# Logs aparecem no terminal automaticamente
```

### Ver Logs de Produção

```bash
# Todos os logs
firebase functions:log

# Logs de uma function específica
firebase functions:log --only api

# Últimas 100 linhas
firebase functions:log --lines 100

# Logs em tempo real
firebase functions:log --follow
```

### Cloud Console

```bash
# Abrir console de logs
https://console.cloud.google.com/logs/query?project=medicamenta-me
```

**Filtros úteis:**
```
resource.type="cloud_function"
resource.labels.function_name="api"
severity="ERROR"
```

---

## ⚡ Performance Testing

### Artillery (Load Testing)

```bash
# Instalar
npm install -g artillery

# Criar config artillery.yml
artillery quick --count 10 --num 100 http://localhost:5001/medicamenta-me/us-central1/api/health
```

### k6 (Load Testing)

```bash
# Instalar k6
# https://k6.io/docs/getting-started/installation/

# Criar script test.js
import http from 'k6/http';

export default function() {
  http.get('http://localhost:5001/medicamenta-me/us-central1/api/health');
}

# Executar
k6 run --vus 10 --duration 30s test.js
```

---

## 🎯 Sprint 3: Cloud Functions Tests (76 testes) 🔄

Testes unitários e de integração para Cloud Functions (Stripe, PagSeguro, OCR).

### Status: 35% completo (6/17 funções)

```bash
npm test -- __tests__
```

### 📸 OCR Functions (21 testes) ✅ COMPLETO

#### processImageWithCloudVision.test.ts (12 cenários)
**Coverage:** 97.18% statements | 82.25% branches | 100% functions

```bash
npm test -- processImageWithCloudVision.test.ts
```

**Positivos:**
- ✅ Processar imagem e extrair texto
- ✅ Retornar blocks individuais
- ✅ Processar sem scanId

**Negativos:**
- ✅ Erro se não autenticado
- ✅ Erro se imageData/userId ausente
- ✅ Erro se processar imagem de outro usuário
- ✅ Success:false se nenhum texto detectado

**Edge Cases:**
- ✅ Falha na API Cloud Vision
- ✅ Imagem base64 inválida
- ✅ Imagem muito grande
- ✅ Detections sem boundingPoly

#### autoProcessLowConfidenceScans.test.ts (9 cenários)
Trigger Firestore que processa automaticamente scans com confiança < 70%

```bash
npm test -- autoProcessLowConfidenceScans.test.ts
```

**Positivos:**
- ✅ Processar automaticamente baixa confiança
- ✅ Manter engine original se melhor

**Negativos:**
- ✅ NÃO processar se confiança >= 70%
- ✅ NÃO processar se já processado
- ✅ Salvar erros apropriadamente

**Edge Cases:**
- ✅ Erro da API
- ✅ Confidence=0

---

### 🔵 Stripe Functions (43 testes) ⏳ 38% (3/8 funções)

#### createStripeCheckoutSession.test.ts (10 cenários)
```bash
npm test -- createStripeCheckoutSession.test.ts
```

#### stripeWebhook.test.ts (25 cenários)
Testa todos eventos webhook do Stripe
```bash
npm test -- stripeWebhook.test.ts
```

#### cancelReactivate.test.ts (8 cenários)
```bash
npm test -- cancelReactivate.test.ts
```

**Pendente:**
- getStripeSubscriptionStatus
- createStripeCustomerPortal
- listStripeInvoices
- updateStripeSubscription
- handleStripeSubscriptionSchedule

---

### 🟠 PagSeguro Functions (12 testes) ⏳ 14% (1/7 funções)

#### createPagSeguroSubscription.test.ts (12 cenários)
```bash
npm test -- createPagSeguroSubscription.test.ts
```

**Pendente:**
- handlePagSeguroNotification
- cancelPagSeguroSubscription
- getPagSeguroTransactionStatus
- generatePagSeguroBoleto
- generatePagSeguroPix
- processPagSeguroRefund

---

### Executar Todos Testes Sprint 3

```bash
# OCR apenas
npm test -- src/__tests__/ocr

# Stripe apenas
npm test -- src/__tests__/stripe

# PagSeguro apenas
npm test -- src/__tests__/pagseguro

# Todos
npm test -- src/__tests__
```

---

## ✅ Checklist de Testes

### Antes do Deploy

- [ ] Build sem erros (`npm run build`)
- [ ] Lint sem warnings (`npm run lint`)
- [ ] Unit tests passando (`npm test`)
- [ ] API health check funcionando
- [ ] Endpoints protegidos com autenticação
- [ ] Rate limiting funcionando
- [ ] Stripe webhooks testados
- [ ] PagSeguro webhooks testados
- [ ] OCR processando imagens
- [ ] Logs sem erros críticos
- [ ] Variables de ambiente configuradas

### Pós Deploy

- [ ] Health check em produção
- [ ] Logs sem erros
- [ ] Webhooks recebendo eventos
- [ ] Performance aceitável
- [ ] Monitoring ativo

---

## 🚨 Troubleshooting

### Functions não deployam

```bash
# Verificar versão do Node
node --version  # Deve ser 18, 20 ou 22

# Reinstalar dependências
rm -rf node_modules package-lock.json
npm install

# Tentar deploy novamente
firebase deploy --only functions
```

### Emulators não iniciam

```bash
# Parar processos
pkill -f "firebase"

# Limpar cache
firebase emulators:exec --only functions "echo test"

# Tentar novamente
firebase emulators:start --only functions
```

### Webhooks não recebem eventos

- Verificar URL do webhook no painel (Stripe/PagSeguro)
- Verificar se function está deployada
- Checar logs para erros
- Verificar se webhook secret está correto

---

## 📚 Recursos

- [Firebase Testing Guide](https://firebase.google.com/docs/functions/local-emulator)
- [Stripe Testing](https://stripe.com/docs/testing)
- [PagSeguro Sandbox](https://dev.pagseguro.uol.com.br/docs/sandbox)
- [Postman Documentation](https://learning.postman.com/docs/)

---

_Last updated: November 12, 2025_
