/**
 * PagSeguro Cloud Functions
 * 
 * Handles Brazilian payment processing:
 * - PIX instant payments
 * - Boleto bancário (bank slip)
 * - Credit card with installments
 * - Webhooks for payment status updates
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

const db = admin.firestore();

/**
 * PagSeguro API Configuration
 */
const PAGSEGURO_CONFIG = {
  sandbox: {
    apiUrl: 'https://sandbox.api.pagseguro.com',
    token: functions.config().pagseguro?.test_token || process.env.PAGSEGURO_TEST_TOKEN || ''
  },
  production: {
    apiUrl: 'https://api.pagseguro.com',
    token: functions.config().pagseguro?.live_token || process.env.PAGSEGURO_LIVE_TOKEN || ''
  }
};

/**
 * Get PagSeguro config based on environment
 */
function getPagSeguroConfig() {
  const isProduction = functions.config().environment?.mode === 'production';
  return isProduction ? PAGSEGURO_CONFIG.production : PAGSEGURO_CONFIG.sandbox;
}

/**
 * Make PagSeguro API request
 */
async function pagSeguroRequest(endpoint: string, method: string, data?: any) {
  const config = getPagSeguroConfig();
  
  const response = await axios({
    method,
    url: `${config.apiUrl}${endpoint}`,
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    data
  });
  
  return response.data;
}

/**
 * Cloud Function: Create PIX Payment
 * Triggered when a new document is created in /users/{userId}/pagseguro_charges/{chargeId}
 * Only processes PIX payments
 */
export const createPagSeguroPixCharge = functions.firestore
  .document('users/{userId}/pagseguro_charges/{chargeId}')
  .onCreate(async (snap: FirebaseFirestore.QueryDocumentSnapshot, context: functions.EventContext) => {
    const { userId } = context.params;
    const data = snap.data();
    
    // Only process PIX payments
    if (data.paymentMethod !== 'pix') {
      return;
    }
    
    try {
      console.log('[PagSeguro] Creating PIX charge for user:', userId);
      
      // Create PIX charge via PagSeguro API
      const pixCharge = await pagSeguroRequest('/charges', 'POST', {
        reference_id: data.referenceId,
        description: data.description,
        amount: {
          value: data.amount.value,
          currency: 'BRL'
        },
        payment_method: {
          type: 'PIX',
          pix: {
            expiration_date: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
          }
        },
        notification_urls: [
          `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/handlePagSeguroWebhook`
        ],
        metadata: data.metadata
      });
      
      // Update Firestore with PIX data
      await snap.ref.update({
        id: pixCharge.id,
        status: pixCharge.status,
        pix: {
          qrCode: pixCharge.qr_codes[0].links[0].href, // QR code image URL
          qrCodeText: pixCharge.qr_codes[0].text,      // Copy-paste code
          expirationDate: pixCharge.qr_codes[0].expiration_date
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('[PagSeguro] PIX charge created:', pixCharge.id);
      
    } catch (error: any) {
      console.error('[PagSeguro] Error creating PIX charge:', error);
      
      await snap.ref.update({
        error: error.message || 'Failed to create PIX payment',
        status: 'error',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  });

/**
 * Cloud Function: Create Boleto Payment
 * Triggered for boleto payment method
 */
export const createPagSeguroBoletoCharge = functions.firestore
  .document('users/{userId}/pagseguro_charges/{chargeId}')
  .onCreate(async (snap: FirebaseFirestore.QueryDocumentSnapshot, context: functions.EventContext) => {
    const { userId } = context.params;
    const data = snap.data();
    
    // Only process Boleto payments
    if (data.paymentMethod !== 'boleto') {
      return;
    }
    
    try {
      console.log('[PagSeguro] Creating Boleto charge for user:', userId);
      
      // Validate customer address (required for boleto)
      if (!data.customer?.address) {
        throw new Error('Address is required for Boleto payment');
      }
      
      // Calculate due date (3 business days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);
      
      // Create Boleto charge
      const boletoCharge = await pagSeguroRequest('/charges', 'POST', {
        reference_id: data.referenceId,
        description: data.description,
        amount: {
          value: data.amount.value,
          currency: 'BRL'
        },
        payment_method: {
          type: 'BOLETO',
          boleto: {
            due_date: dueDate.toISOString().split('T')[0], // YYYY-MM-DD
            holder: {
              name: data.customer.name,
              tax_id: data.customer.cpf.replaceAll(/\D/g, ''),
              email: data.customer.email,
              address: {
                street: data.customer.address.street,
                number: data.customer.address.number,
                locality: data.customer.address.district,
                city: data.customer.address.city,
                region_code: data.customer.address.state,
                country: 'BRA',
                postal_code: data.customer.address.postalCode.replaceAll(/\D/g, '')
              }
            }
          }
        },
        notification_urls: [
          `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/handlePagSeguroWebhook`
        ],
        metadata: data.metadata
      });
      
      // Update Firestore with Boleto data
      await snap.ref.update({
        id: boletoCharge.id,
        status: boletoCharge.status,
        boleto: {
          barcode: boletoCharge.payment_method.boleto.barcode,
          dueDate: boletoCharge.payment_method.boleto.due_date,
          paymentUrl: boletoCharge.links.find((l: any) => l.rel === 'SELF')?.href || '',
          pdfUrl: boletoCharge.links.find((l: any) => l.media === 'application/pdf')?.href
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('[PagSeguro] Boleto charge created:', boletoCharge.id);
      
    } catch (error: any) {
      console.error('[PagSeguro] Error creating Boleto charge:', error);
      
      await snap.ref.update({
        error: error.message || 'Failed to create Boleto payment',
        status: 'error',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  });

/**
 * Cloud Function: Process Credit Card Payment
 * Triggered for credit card payment method
 */
export const createPagSeguroCardCharge = functions.firestore
  .document('users/{userId}/pagseguro_charges/{chargeId}')
  .onCreate(async (snap: FirebaseFirestore.QueryDocumentSnapshot, context: functions.EventContext) => {
    const { userId } = context.params;
    const data = snap.data();
    
    // Only process credit card payments
    if (data.paymentMethod !== 'credit_card') {
      return;
    }
    
    try {
      console.log('[PagSeguro] Processing credit card charge for user:', userId);
      
      // Create credit card charge
      const cardCharge = await pagSeguroRequest('/charges', 'POST', {
        reference_id: data.referenceId,
        description: data.description,
        amount: {
          value: data.amount.value,
          currency: 'BRL'
        },
        payment_method: {
          type: 'CREDIT_CARD',
          installments: data.creditCard.installments,
          capture: true,
          card: {
            encrypted: data.creditCard.token, // Tokenized card from client
            holder: {
              name: data.creditCard.holder.name,
              tax_id: data.creditCard.holder.cpf.replaceAll(/\D/g, '')
            }
          }
        },
        notification_urls: [
          `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/handlePagSeguroWebhook`
        ],
        metadata: data.metadata
      });
      
      // Update Firestore with charge status
      await snap.ref.update({
        id: cardCharge.id,
        status: cardCharge.status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('[PagSeguro] Credit card charge processed:', cardCharge.id, '| Status:', cardCharge.status);
      
      // If immediately paid, activate subscription
      if (cardCharge.status === 'PAID') {
        await activateSubscription(userId, data.metadata);
      }
      
    } catch (error: any) {
      console.error('[PagSeguro] Error processing credit card charge:', error);
      
      await snap.ref.update({
        error: error.message || 'Failed to process credit card payment',
        status: 'declined',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  });

/**
 * Cloud Function: Handle PagSeguro Webhooks
 * HTTP endpoint that receives webhook events
 */
export const handlePagSeguroWebhook = functions.https.onRequest(async (req: functions.https.Request, res: functions.Response) => {
  // Verify webhook signature (PagSeguro sends X-PagSeguro-Signature header)
  // FUTURE: Implement signature validation for security
  
  console.log('[PagSeguro Webhook] Received event');
  
  try {
    const event = req.body;
    
    // Handle different event types
    switch (event.type) {
      case 'CHARGE.PAID':
        await handleChargePaid(event.data);
        break;
        
      case 'CHARGE.DECLINED':
        await handleChargeDeclined(event.data);
        break;
        
      case 'CHARGE.CANCELED':
        await handleChargeCanceled(event.data);
        break;
        
      default:
        console.log('[PagSeguro Webhook] Unhandled event type:', event.type);
    }
    
    res.json({ received: true });
    
  } catch (error: any) {
    console.error('[PagSeguro Webhook] Error processing event:', error);
    res.status(500).send(`Webhook Error: ${error.message}`);
  }
});

/**
 * Handle CHARGE.PAID event
 */
async function handleChargePaid(data: any): Promise<void> {
  console.log('[PagSeguro] Charge paid:', data.id);
  
  // Find charge by reference_id
  const chargesSnapshot = await db.collectionGroup('pagseguro_charges')
    .where('referenceId', '==', data.reference_id)
    .limit(1)
    .get();
  
  if (chargesSnapshot.empty) {
    console.error('[PagSeguro] No charge found for reference:', data.reference_id);
    return;
  }
  
  const chargeDoc = chargesSnapshot.docs[0];
  const chargeData = chargeDoc.data();
  
  // Update charge status
  await chargeDoc.ref.update({
    status: 'paid',
    paidAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Extract user ID from doc path
  const userId = chargeDoc.ref.parent.parent!.id;
  
  // Activate subscription
  await activateSubscription(userId, chargeData.metadata);
}

/**
 * Handle CHARGE.DECLINED event
 */
async function handleChargeDeclined(data: any): Promise<void> {
  console.log('[PagSeguro] Charge declined:', data.id);
  
  const chargesSnapshot = await db.collectionGroup('pagseguro_charges')
    .where('referenceId', '==', data.reference_id)
    .limit(1)
    .get();
  
  if (!chargesSnapshot.empty) {
    await chargesSnapshot.docs[0].ref.update({
      status: 'declined',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

/**
 * Handle CHARGE.CANCELED event
 */
async function handleChargeCanceled(data: any): Promise<void> {
  console.log('[PagSeguro] Charge canceled:', data.id);
  
  const chargesSnapshot = await db.collectionGroup('pagseguro_charges')
    .where('referenceId', '==', data.reference_id)
    .limit(1)
    .get();
  
  if (!chargesSnapshot.empty) {
    await chargesSnapshot.docs[0].ref.update({
      status: 'canceled',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

/**
 * Activate subscription after successful payment
 */
async function activateSubscription(userId: string, metadata: any): Promise<void> {
  const plan = metadata.plan;
  const billingInterval = metadata.billingInterval;
  
  console.log('[PagSeguro] Activating subscription for user:', userId, '| Plan:', plan);
  
  // Update user subscription
  const subscriptionRef = db.doc(`users/${userId}/subscription/current`);
  await subscriptionRef.set({
    plan,
    status: 'active',
    features: {}, // Will be set by client based on plan
    paymentProvider: 'pagseguro',
    billingInterval,
    currentPeriodStart: admin.firestore.Timestamp.now(),
    currentPeriodEnd: admin.firestore.Timestamp.fromMillis(
      Date.now() + (billingInterval === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000
    ),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  
  console.log('[PagSeguro] Subscription activated for user:', userId);
}
