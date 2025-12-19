# 🎯 Backend Sprint 5 - Branches Coverage Plan

**Data**: 19 de dezembro de 2025  
**Objetivo**: Atingir 80% Branches Coverage (+5.41%)  
**Status**: 📋 Planejamento Completo

---

## 📊 Análise Atual

### Métricas Atuais (Sprint 4 Final)

| Métrica | Valor Atual | Objetivo | Gap |
|---------|-------------|----------|-----|
| **Functions** | 84.45% | 80% | ✅ +4.45% |
| **Statements** | 81.84% | 80% | ✅ +1.84% |
| **Lines** | 81.54% | 80% | ✅ +1.54% |
| **Branches** | 74.59% (505/677) | 80% (542/677) | 🟡 **Need +37 branches** |

### Cobertura por Módulo

| Módulo | Branches % | Gap to 80% | Priority |
|--------|------------|------------|----------|
| `src/api/v1` | 95.72% | ✅ OK | - |
| `src/api/middleware` | 94.36% | ✅ OK | - |
| **`src/ocr-cloud-vision.ts`** | 82.25% | ✅ OK | - |
| **`src/stripe-functions.ts`** | 81.05% | ✅ OK | - |
| **`src/pagseguro-functions.ts`** | **76.41%** | Need +3.59% | 🟡 P1 |
| **`src/api/index.ts`** | **50%** | Need +30% | 🔴 P0 |
| **`src/index.ts`** | **57.1%** | Need +22.9% | 🔴 P0 |
| `src/pagseguro.ts` (legacy) | 0% | N/A (deprecated) | ⬜ Ignore |

---

## 🔍 Análise Detalhada

### 1. `src/index.ts` - 57.1% Branches

**Problema Identificado**: 
- Contém **Legacy Firestore Trigger Functions** (onCreate)
- Funções **NÃO estão sendo executadas** nos testes (FNH:0)
- São **DUPLICATAS** das funções callable em `stripe-functions.ts`

**Funções Legacy (0% coverage)**:
```typescript
// Firestore triggers (document-based)
export const createStripeCheckoutSession = functions.firestore.document(...).onCreate(...)
export const createStripeBillingPortalSession = functions.firestore.document(...).onCreate(...)
export const handleStripeWebhook = functions.https.onRequest(...)

// Helper functions (testadas em index.test.ts, mas não executadas)
function getPriceId(plan: string, billingInterval: string): string
async function getOrCreateCustomer(userId: string, email: string, name?: string): Promise<string>
```

**Funções Modernas em `stripe-functions.ts` (100% coverage)**:
```typescript
// HTTPS Callable Functions (direct invocation)
export const createStripeCheckoutSession = functions.https.onCall(...)
export const stripeWebhook = functions.https.onRequest(...)
// + 7 outras funções callable
```

**Conclusão**:
- ⚠️ **Arquitetura Duplicada**: Duas implementações diferentes (Firestore triggers vs Callable)
- ⚠️ **Código Legacy**: Firestore triggers provavelmente deprecated
- ⚠️ **Alto Custo de Teste**: Requer mocking complexo de Firestore onCreate triggers
- ⚠️ **Baixo ROI**: Testar código legacy que pode ser removido

**Recomendação**:
- 🔧 **Opção A (Curto Prazo)**: Adicionar `/* istanbul ignore */` nos triggers legacy
- 🗑️ **Opção B (Melhor)**: **Remover código legacy** e consolidar em `stripe-functions.ts`
- ✅ **Opção C (Pragmática)**: Documentar como "known technical debt" e focar em novo código

---

### 2. `src/api/index.ts` - 50% Branches

**Análise**:
- Arquivo principal da API Express
- **JÁ TESTADO** com 25 integration tests
- 50% branches = alguns edge cases não cobertos

**Branches Não Cobertas** (estimativa):
- Error handlers em middleware chains
- Algumas condicionais em route matching
- Edge cases de configuração

**Estimativa**: ~10-15 testes adicionais para 80%+

---

### 3. `src/pagseguro-functions.ts` - 76.41% Branches

**Linhas Não Cobertas**: 254-255, 274

```typescript
// Linha 254-255: catch block
} catch (error) {
  console.error('Error handling transaction notification:', error);
  throw error;
}

// Linha 274: switch case default (status mapping)
default:
  return 'active';
```

**Cenários de Teste Necessários**:
1. ✅ Transaction notification com erro de Firestore
2. ✅ Transaction notification com erro de parsing
3. ✅ Status desconhecido no mapeamento

**Estimativa**: ~5-8 testes adicionais para 80%+

---

## 📋 Estratégias Possíveis

### Estratégia A: Abordagem Incremental (Recomendada)

**Fase 1: Quick Wins (2-3h)**
- ✅ PagSeguro: +5-8 testes para cobrir catch blocks
- ✅ API Gateway: +10 testes para edge cases
- **Impacto Estimado**: 76.41% → 81% (PagSeguro) + melhoria geral → **~77-78% overall**

**Fase 2: Refatoração (4-6h)**
- 🗑️ Remover código legacy de `src/index.ts`
- 📝 Consolidar funções em `stripe-functions.ts`
- ✅ Re-executar coverage
- **Impacto Estimado**: Remover ~180 linhas uncovered → **~82-85% overall**

**Fase 3: Polimento (2-3h)**
- ✅ Testes adicionais conforme necessário
- ✅ Atingir 80% em todos os módulos
- **Impacto Final**: **80%+ branches** ✅

**Total Estimado**: 8-12 horas

---

### Estratégia B: Testar Legacy Code (Não Recomendada)

**Esforço**:
- Criar mocks complexos para Firestore triggers
- Testar onCreate handlers
- Testar webhook handlers com assinatura Stripe
- Testar helper functions em contexto real

**Problemas**:
- ⚠️ Alto custo de tempo (10-15h)
- ⚠️ Testes de código que pode ser deprecated
- ⚠️ Manutenção futura dificultada
- ⚠️ ROI baixo

**Não Recomendado**

---

### Estratégia C: Ignore Coverage + Documentação (Pragmática)

**Ação Imediata**:
```typescript
// src/index.ts
/* istanbul ignore next */
export const createStripeCheckoutSession = functions.firestore...

/* istanbul ignore next */
export const createStripeBillingPortalSession = functions.firestore...

/* istanbul ignore next */
export const handleStripeWebhook = functions.https.onRequest...
```

**Documentação**:
- Adicionar comentário explicando que são legacy functions
- Marcar para remoção em Sprint futuro
- Focar coverage em código ativo

**Impacto**:
- Coverage report ignora código legacy
- Branches sobem para ~78-80% automaticamente
- Sem esforço de teste

**Vantagens**:
- ✅ Rápido (30 min)
- ✅ Pragmático
- ✅ Mantém foco em código relevante

**Desvantagens**:
- ⚠️ Não resolve dívida técnica
- ⚠️ Código legacy continua no repo

---

## 🎯 Recomendação Final

### Abordagem Híbrida

**Sprint 5A (Imediato - 3h)**:
1. ✅ Adicionar testes para PagSeguro catch blocks (5-8 testes)
2. ✅ Adicionar testes para API Gateway edge cases (10 testes)
3. ✅ Marcar legacy code com `/* istanbul ignore */`
4. ✅ Documentar decision no ADR (Architecture Decision Record)

**Resultado Esperado**: **78-80% branches** ✅

**Sprint 5B (Futuro - 6h)**:
1. 🗑️ Remover código legacy de `src/index.ts`
2. 📝 Consolidar em `stripe-functions.ts`
3. ✅ Atingir 85%+ branches

---

## 📊 Impacto Projetado

### Cenário Conservador (Estratégia A Fase 1)

| Métrica | Antes | Depois | Delta |
|---------|-------|--------|-------|
| PagSeguro Branches | 76.41% | 81% | +4.59% |
| API Gateway Branches | 50% | 70% | +20% |
| **Overall Branches** | **74.59%** | **~78%** | **+3.41%** |

**Status**: 🟡 Próximo de 80%, mas não atingido

### Cenário Otimista (Estratégia A Fase 1 + 2)

| Métrica | Antes | Depois | Delta |
|---------|-------|--------|-------|
| Legacy Code | 180 LOC | 0 LOC (removed) | -180 |
| PagSeguro Branches | 76.41% | 81% | +4.59% |
| **Overall Branches** | **74.59%** | **~82-85%** | **+7.41-10.41%** |

**Status**: ✅ **80%+ atingido!**

---

## 📅 Timeline Proposta

### Semana 1 (Sprint 5A)
- **Dia 1 (3h)**: Testes PagSeguro + API Gateway + Istanbul ignore
- **Resultado**: 78-80% branches

### Semana 2 (Sprint 5B)
- **Dia 1-2 (6h)**: Refatoração - Remover legacy, consolidar código
- **Resultado**: 82-85% branches

---

## 🔧 Comandos Úteis

### Analisar coverage específico
```bash
npm test -- --coverage --coverageReporters=html
# Abrir coverage/lcov-report/src/index.ts.html
```

### Testar módulo específico
```bash
npm test -- pagseguro
npm test -- src/api/__tests__
```

### Ver branches não cobertas
```bash
npx istanbul report text --include="coverage/coverage-final.json"
```

---

## 📄 Arquivos para Atualizar

1. **src/index.ts** - Adicionar `/* istanbul ignore */` ou remover
2. **src/__tests__/pagseguro/[...]** - Adicionar testes de error handling
3. **src/api/__tests__/index.test.ts** - Adicionar edge cases
4. **BACKEND-ROADMAP.md** - Atualizar Sprint 5 status
5. **ADR-001-legacy-firestore-triggers.md** - Novo ADR documentando decisão

---

**Autor**: AI Assistant  
**Data**: 19/12/2025  
**Status**: 📋 Plano Completo - Aguardando Decisão
