# 🧪 Testes de Integração - Configuração

## 📋 Status Atual

Sprint 2 criou `auth.routes.test.ts` com 20 testes de integração usando **Firebase Admin SDK real** (sem mocks, conforme requisito do usuário).

### ❌ Problema Identificado

Os testes estão com timeout porque precisam conectar ao Firestore, mas há **3 opções** para execução:

---

## 🔧 Opções de Configuração

### **Opção 1: Firebase Emulator Suite (RECOMENDADO)**

**Prós:**
- ✅ Testes rápidos e isolados
- ✅ Não consome quota do Firebase
- ✅ Dados de teste não afetam produção
- ✅ Padrão da indústria para testes Firebase

**Contras:**
- ❌ **Requer Java instalado** (JRE 11 ou superior)

**Passos:**

```powershell
# 1. Instalar Java (se não tiver)
# Baixe do site: https://adoptium.net/ ou
winget install EclipseAdoptium.Temurin.11.JRE

# 2. Verificar instalação
java -version

# 3. Configurar firestore.rules (já existe)
# 4. Executar emulador
firebase emulators:start --only firestore

# 5. Em outro terminal, executar testes
npm test -- auth.routes --no-coverage
```

**Configuração automática:**
- `firebase.json` já configurado com porta 8080
- Testes já configurados com `FIRESTORE_EMULATOR_HOST=localhost:8080`

---

### **Opção 2: Firebase Real em Projeto de Teste**

**Prós:**
- ✅ Não requer Java
- ✅ Testa infraestrutura real
- ✅ Mesma configuração de produção

**Contras:**
- ❌ Mais lento (latência de rede)
- ❌ Consome quota do Firebase
- ❌ Precisa de projeto Firebase dedicado para testes
- ❌ Risco de dados de teste poluírem o projeto

**Passos:**

```powershell
# 1. Criar projeto Firebase para testes (no console)
# 2. Baixar service account key
# 3. Configurar variável de ambiente
$env:GOOGLE_APPLICATION_CREDENTIALS = "path\to\service-account-key.json"

# 4. Ajustar teste (remover FIRESTORE_EMULATOR_HOST)
# 5. Executar
npm test -- auth.routes --no-coverage
```

**⚠️ Importante:** Adicionar limpeza automática de dados antigos (scheduled functions).

---

### **Opção 3: Biblioteca de Mocks do Firebase**

**Prós:**
- ✅ Não requer infraestrutura externa
- ✅ Rápido

**Contras:**
- ❌ **Viola requisito do usuário: "Não devemos ter MOCKS"**
- ❌ Não testa comportamento real do Firestore
- ❌ Requer reescrever todos os 20 testes

---

## 🎯 Recomendação

**Use Opção 1 (Emulator)** se possível instalar Java.

**Fallback para Opção 2** se houver restrições de instalação de software.

---

## 📊 Impacto no Sprint 2

### Tarefas Pendentes

- ✅ auth.routes.test.ts: 20 testes escritos
- ⏳ auth.routes.test.ts: 0 testes passando (bloqueado por config)
- 🔜 medications.routes.test.ts: 20 testes (8h)
- 🔜 patients.routes.test.ts: 20 testes (8h)
- 🔜 adherence.routes.test.ts: 20 testes (8h)
- 🔜 reports.routes.test.ts: 15 testes (4h)
- 🔜 webhooks.routes.test.ts: 15 testes (4h)

**Todos os testes de rotas (110+)** seguirão o mesmo padrão de integração.

---

## 🚀 Próximos Passos

**Aguardando decisão do usuário:**

1. **Se escolher Opção 1 (Emulator):**
   - Instalar Java
   - Executar `firebase emulators:start --only firestore`
   - Continuar com testes

2. **Se escolher Opção 2 (Firebase Real):**
   - Criar projeto de teste
   - Configurar credenciais
   - Ajustar código do teste (remover `FIRESTORE_EMULATOR_HOST`)

3. **Se escolher Opção 3 (Mocks):**
   - ⚠️ Confirmar mudança de requisito
   - Reescrever todos os testes com mocks

---

## 📝 Estrutura Atual do Teste

```typescript
// auth.routes.test.ts
import * as admin from "firebase-admin";

// Inicializar Firebase ANTES de importar módulos
if (!admin.apps.length) {
  admin.initializeApp({ projectId: "test-project" });
}

// Configurar emulador (Opção 1)
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";

// OU configurar Firebase real (Opção 2)
// process.env.GOOGLE_APPLICATION_CREDENTIALS = "path/to/key.json";

// Importar módulos que usam Firebase
import { authRouter } from "../auth.routes";

// 20 testes de integração:
// - 6 testes: POST /v1/auth/token (client_credentials)
// - 4 testes: POST /v1/auth/token (refresh_token)
// - 1 teste: POST /v1/auth/token (grant_type inválido)
// - 3 testes: POST /v1/auth/revoke
// - 6 testes: POST /v1/auth/api-key
```

---

## 🔗 Referências

- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)
- [Firebase Admin SDK Testing](https://firebase.google.com/docs/admin/setup)
- [Jest Timeout Configuration](https://jestjs.io/docs/api#testname-fn-timeout)
