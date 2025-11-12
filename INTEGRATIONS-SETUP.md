# 🔌 Integrations Setup Guide

Este guia explica como configurar todas as integrações externas do backend.

---

## 📦 Integrações Disponíveis

1. **Stripe** - Processamento de pagamentos e assinaturas
2. **PagSeguro** - Processamento de pagamentos (Brasil)
3. **Google Cloud Vision** - OCR para receitas médicas
4. **Firebase Services** - Firestore, Auth, Storage, Functions

---

## 1️⃣ Stripe Integration

### Setup

1. **Criar conta Stripe:**
   - Acesse: https://dashboard.stripe.com/register
   - Complete o cadastro

2. **Obter API Keys:**
   - Dashboard → Developers → API Keys
   - Copie `Secret key` (começa com `sk_test_` ou `sk_live_`)

3. **Configurar no Firebase Functions:**

   **Opção A: Firebase Functions Config (Produção)**
   ```bash
   firebase functions:config:set \
     stripe.secret_key="sk_live_..." \
     stripe.webhook_secret="whsec_..."
   ```

   **Opção B: Local (.env.local)**
   ```bash
   STRIPE_SECRET_KEY=sk_test_your_key_here
   STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
   ```

4. **Criar Produtos e Preços:**
   - Dashboard → Products → Create Product
   - Criar planos:
     - Premium Monthly (BRL)
     - Premium Yearly (BRL)
     - Family Monthly (BRL)
     - Family Yearly (BRL)
   - Copiar os Price IDs (começam com `price_`)

5. **Configurar Webhooks:**
   - Dashboard → Developers → Webhooks → Add endpoint
   - URL: `https://us-central1-medicamenta-me.cloudfunctions.net/handleStripeWebhook`
   - Events to send:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`

### Testar Integração

```typescript
// Testar criação de checkout session
const checkout = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{
    price: 'price_premium_monthly_brl',
    quantity: 1,
  }],
  mode: 'subscription',
  success_url: 'https://app.medicamenta.me/success',
  cancel_url: 'https://app.medicamenta.me/cancel',
});
```

### Documentação
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Testing](https://stripe.com/docs/testing)
- [Test Cards](https://stripe.com/docs/testing#cards)

---

## 2️⃣ PagSeguro Integration

### Setup

1. **Criar conta PagSeguro:**
   - Acesse: https://pagseguro.uol.com.br/
   - Complete o cadastro

2. **Obter Credenciais:**
   - Painel → Integrações → Credenciais
   - Email e Token

3. **Ativar Sandbox (Desenvolvimento):**
   - Acesse: https://sandbox.pagseguro.uol.com.br/
   - Obtenha credenciais de teste

4. **Configurar no Firebase Functions:**

   **Produção:**
   ```bash
   firebase functions:config:set \
     pagseguro.email="your-email@example.com" \
     pagseguro.token="your_production_token"
   ```

   **Local (.env.local):**
   ```bash
   PAGSEGURO_EMAIL=sandbox-email@test.com
   PAGSEGURO_TOKEN=sandbox_token_here
   PAGSEGURO_ENV=sandbox
   ```

5. **Criar Planos de Assinatura:**
   - Painel → Assinaturas → Planos
   - Criar os mesmos planos do Stripe
   - Copiar os IDs dos planos

6. **Configurar Notificações:**
   - Painel → Integrações → Notificações
   - URL: `https://us-central1-medicamenta-me.cloudfunctions.net/handlePagSeguroNotification`
   - Eventos:
     - Transações
     - Assinaturas

### Testar Integração

```bash
# Usar curl ou Postman
curl -X POST https://ws.pagseguro.uol.com.br/v2/pre-approvals \
  -H "Content-Type: application/xml" \
  -d @subscription.xml
```

### Documentação
- [PagSeguro Docs](https://dev.pagseguro.uol.com.br/docs)
- [Sandbox Guide](https://dev.pagseguro.uol.com.br/docs/sandbox)

---

## 3️⃣ Google Cloud Vision API

### Setup

1. **Ativar API:**
   - Google Cloud Console: https://console.cloud.google.com/
   - APIs & Services → Library
   - Buscar "Cloud Vision API"
   - Clicar "Enable"

2. **Configurar Permissões:**
   - IAM & Admin → Service Accounts
   - Encontrar service account do Firebase: `firebase-adminsdk@medicamenta-me.iam.gserviceaccount.com`
   - Adicionar role: "Cloud Vision API User"

3. **Testar:**
   ```bash
   # O Firebase Admin SDK já tem as credenciais
   # Não precisa de configuração adicional!
   ```

### Como Funciona

Quando uma imagem é uploaded para Cloud Storage em `receipts/{userId}/{receiptId}`:
1. Trigger automático `processReceiptOCR` é ativado
2. Imagem é processada com Vision API
3. Texto é extraído (OCR)
4. Medicamentos são identificados
5. Resultado salvo no Firestore

### Testar Integração

```typescript
// Upload via frontend ou teste direto
import { vision } from '@google-cloud/vision';

const client = new vision.ImageAnnotatorClient();
const [result] = await client.textDetection('gs://bucket/image.jpg');
console.log(result.textAnnotations);
```

### Documentação
- [Cloud Vision Docs](https://cloud.google.com/vision/docs)
- [OCR Tutorial](https://cloud.google.com/vision/docs/ocr)

---

## 4️⃣ Firebase Services

### Firestore

**Rules:** Já configurado em `firestore.rules`

**Indexes:** Configurado em `firestore.indexes.json`

**Collections:**
- `users/{userId}` - Dados do usuário
- `users/{userId}/medications` - Medicamentos
- `users/{userId}/adherence` - Registros de adesão
- `users/{userId}/subscriptions` - Assinaturas
- `pharmacies/{pharmacyId}` - Farmácias (marketplace)
- `products/{productId}` - Produtos (marketplace)

### Authentication

**Providers habilitados:**
- Email/Password
- Google
- Apple (iOS)

**Custom Claims:**
```typescript
// Adicionar role customizada
admin.auth().setCustomUserClaims(uid, {
  role: 'admin',
  pharmacyId: 'pharmacy_123'
});
```

### Storage

**Buckets:**
- `medicamenta-me.appspot.com` - Default
- `receipts/{userId}/{receiptId}` - Receitas (OCR)
- `prescriptions/{userId}/{prescriptionId}` - Prescrições
- `profile-photos/{userId}` - Fotos de perfil

**Rules:** Configurado em `storage.rules`

### Cloud Functions

**Deployed Functions:**
- `api` - REST API principal
- `createStripeCheckoutSession`
- `handleStripeWebhook`
- `createPagSeguroSubscription`
- `handlePagSeguroNotification`
- `processReceiptOCR`

**Deploy:**
```bash
firebase deploy --only functions
```

---

## 🧪 Testes Locais

### 1. Emuladores Firebase

```bash
# Instalar emulators (primeira vez)
firebase init emulators

# Iniciar emulators
cd medicamenta.me-back-functions
npm run serve

# Ou diretamente
firebase emulators:start --only functions,firestore,auth
```

**URLs dos Emuladores:**
- Functions: http://localhost:5001
- Firestore: http://localhost:8080
- Auth: http://localhost:9099
- UI: http://localhost:4000

### 2. Testar API Local

```bash
# Health check
curl http://localhost:5001/medicamenta-me/us-central1/api/health

# API info
curl http://localhost:5001/medicamenta-me/us-central1/api/

# Login (exemplo)
curl -X POST http://localhost:5001/medicamenta-me/us-central1/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### 3. Testar Stripe Webhooks Localmente

```bash
# Instalar Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward webhooks
stripe listen --forward-to localhost:5001/medicamenta-me/us-central1/handleStripeWebhook

# Trigger test event
stripe trigger checkout.session.completed
```

### 4. Testar OCR

```bash
# Upload imagem para Storage
gsutil cp receipt.jpg gs://medicamenta-me.appspot.com/receipts/test-user/receipt-1.jpg

# Verificar logs
firebase functions:log
```

---

## 📊 Monitoring & Logs

### Firebase Console
- Functions Logs: https://console.firebase.google.com/project/medicamenta-me/functions/logs
- Firestore Data: https://console.firebase.google.com/project/medicamenta-me/firestore

### Cloud Console
- All Logs: https://console.cloud.google.com/logs
- Error Reporting: https://console.cloud.google.com/errors
- Cloud Trace: https://console.cloud.google.com/traces

### Stripe Dashboard
- Payments: https://dashboard.stripe.com/payments
- Webhooks: https://dashboard.stripe.com/webhooks
- Logs: https://dashboard.stripe.com/logs

### PagSeguro
- Transações: https://pagseguro.uol.com.br/transaction/search.jhtml

---

## ⚠️ Troubleshooting

### Stripe Webhooks não recebidos
- Verificar URL do webhook no Stripe Dashboard
- Verificar se function está deployada
- Checar logs: `firebase functions:log --only handleStripeWebhook`

### PagSeguro timeout
- PagSeguro tem delays maiores que Stripe
- Usar ambiente sandbox para testes
- Verificar credenciais

### OCR não processa
- Verificar se Vision API está habilitada
- Checar permissões da service account
- Verificar formato da imagem (JPEG, PNG)

### Emuladores não iniciam
```bash
# Limpar cache
firebase emulators:exec --only functions "echo 'test'" --export-on-exit=./emulator-data

# Reinstalar
npm install -g firebase-tools
```

---

## 🔒 Security Checklist

- [ ] API Keys rotacionadas regularmente
- [ ] Webhook secrets configurados
- [ ] HTTPS obrigatório em produção
- [ ] Rate limiting ativo
- [ ] CORS configurado corretamente
- [ ] Firestore rules aplicadas
- [ ] Environment variables seguras
- [ ] Logs não expõem dados sensíveis

---

## 📚 Recursos Adicionais

- [Firebase Functions Docs](https://firebase.google.com/docs/functions)
- [Stripe API Reference](https://stripe.com/docs/api)
- [PagSeguro Integration](https://dev.pagseguro.uol.com.br/)
- [Google Cloud Vision](https://cloud.google.com/vision)

---

_Last updated: November 12, 2025_
