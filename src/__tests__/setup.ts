/**
 * Jest Global Setup
 * Configuração global para todos os testes
 * - Inicializa Firebase Admin sem credenciais
 * - Configura Firestore Emulator
 * - Define variáveis de ambiente para testes
 */

import * as admin from 'firebase-admin';

// Inicializa Firebase Admin uma única vez para todos os testes
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'test-project',
  });
}

// Configura Firestore Emulator (localhost:8080)
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

// Configura Firebase Auth Emulator (se necessário)
// process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

// Desabilita verificações SSL para emulators
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Configurações de teste para PagSeguro
process.env.PAGSEGURO_EMAIL = 'test@pagseguro.com';
process.env.PAGSEGURO_TOKEN = 'test-token-123456';
process.env.PAGSEGURO_ENVIRONMENT = 'sandbox';

// Configurações de teste para Stripe
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

// Configurações de teste para Google Cloud Vision
process.env.GOOGLE_CLOUD_PROJECT = 'test-project';

// Log de confirmação (apenas para debug)
console.log('✅ Jest Setup: Firebase Admin inicializado com emulators');
console.log(`   - Firestore Emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
console.log(`   - Project ID: test-project`);
