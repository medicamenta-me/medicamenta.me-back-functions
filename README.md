# Medicamenta.me - Backend Functions

## 📋 Descrição

Backend centralizado para todos os projetos frontend do ecossistema Medicamenta.me, construído com Firebase Cloud Functions.

## 🛠️ Tecnologias

- **Runtime:** Node.js 22
- **Framework:** Firebase Functions
- **Linguagem:** TypeScript 5.x
- **Ferramentas:** ESLint, Firebase Admin SDK

## 🚀 Começando

### Pré-requisitos

```bash
node >= 22.0.0
npm >= 10.0.0
firebase-tools
```

### Instalação

```bash
# Instalar dependências
npm install

# Compilar TypeScript
npm run build
```

### Desenvolvimento

```bash
# Iniciar emuladores locais
npm run serve

# Apenas compilar
npm run build

# Watch mode (recompila automaticamente)
npm run watch
```

### Deploy

```bash
# Deploy de todas as functions
npm run deploy

# Deploy de uma function específica
firebase deploy --only functions:functionName
```

## 📁 Estrutura do Projeto

```
medicamenta.me-back-functions/
├── src/
│   ├── index.ts           # Entry point
│   ├── api/               # Endpoints REST
│   ├── config/            # Configurações
│   ├── services/          # Lógica de negócio
│   ├── models/            # Modelos de dados
│   ├── utils/             # Utilitários
│   └── triggers/          # Firebase triggers
├── lib/                   # Código compilado (gerado)
├── package.json
├── tsconfig.json
└── .eslintrc.js
```

## 🔑 Variáveis de Ambiente

Configure as variáveis de ambiente no Firebase:

```bash
firebase functions:config:set stripe.secret_key="sk_test_..."
firebase functions:config:set pagseguro.email="..."
firebase functions:config:set pagseguro.token="..."
```

## 📚 Documentação

- [Firebase Functions Docs](https://firebase.google.com/docs/functions)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)
- [API Documentation](../API-README.md)

## 🧪 Testes

```bash
# Executar testes
npm test

# Testes com cobertura
npm run test:coverage
```

## 📝 Scripts Disponíveis

- `npm run build` - Compila o TypeScript
- `npm run serve` - Inicia emuladores locais
- `npm run shell` - Abre shell interativo das functions
- `npm run deploy` - Faz deploy para produção
- `npm run logs` - Visualiza logs das functions

## 🔗 Projetos Relacionados

- [medicamenta.me-front-app](../medicamenta.me-front-app) - Aplicativo Mobile
- [medicamenta.me-front-marketplace](../medicamenta.me-front-marketplace) - Marketplace Web
- [medicamenta.me-front-backoffice](../medicamenta.me-front-backoffice) - Painel Administrativo

## 📄 Licença

Proprietary - Todos os direitos reservados
