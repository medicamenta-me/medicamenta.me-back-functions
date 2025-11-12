# 🧪 Testing Guide - Backend Functions

**Última atualização:** 12/11/2025

---

## 📋 Testes Disponíveis

### 1. Build Test ✅
```bash
npm run build
```
**Status:** ✅ Passando

### 2. Lint Test
```bash
npm run lint
```

### 3. Unit Tests (TODO)
```bash
npm test
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
