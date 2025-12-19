import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Export Public API
export * from './api';

// Export Stripe functions
export * from './stripe-functions';

// Export PagSeguro functions
export * from './pagseguro-functions';

// Export OCR Cloud Vision functions
export * from './ocr-cloud-vision';

// Initialize Stripe
// Get Stripe secret key from environment config
const stripeSecretKey = functions.config().stripe?.secret_key || process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(stripeSecretKey);

/**
 * Price IDs mapping (must match client-side config)
 * FUTURE: Move to Firebase Remote Config for dynamic updates
 */
const PRICE_IDS = {
  premium: {
    monthly: functions.config().stripe?.premium_monthly || 'price_premium_monthly_brl',
    yearly: functions.config().stripe?.premium_yearly || 'price_premium_yearly_brl'
  },
  family: {
    monthly: functions.config().stripe?.family_monthly || 'price_family_monthly_brl',
    yearly: functions.config().stripe?.family_yearly || 'price_family_yearly_brl'
  }
};

/**
 * Map plan and interval to Stripe price ID
 */
function getPriceId(plan: string, billingInterval: string): string {
  if (plan === 'premium') {
    return billingInterval === 'yearly' ? PRICE_IDS.premium.yearly : PRICE_IDS.premium.monthly;
  }
  if (plan === 'family') {
    return billingInterval === 'yearly' ? PRICE_IDS.family.yearly : PRICE_IDS.family.monthly;
  }
  throw new Error(`Invalid plan: ${plan}`);
}

/**
 * Get or create Stripe customer for user
 */
async function getOrCreateCustomer(userId: string, email: string, name?: string): Promise<string> {
  // Check if customer already exists
  const customerRef = db.doc(`users/${userId}/stripe_customer/data`);
  const customerSnap = await customerRef.get();

  if (customerSnap.exists) {
    const data = customerSnap.data();
    return data!.id;
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      firebaseUid: userId
    }
  });

  // Save to Firestore
  await customerRef.set({
    id: customer.id,
    userId,
    email,
    name: name || '',
    created: customer.created,
    metadata: {
      firebaseUid: userId
    }
  });

  console.log('[Stripe] Created customer:', customer.id);
  return customer.id;
}

/**
 * ⚠️ LEGACY CODE - Firestore Trigger (Deprecated)
 * TODO Sprint 5 Phase 2: Migrar para stripe-functions.ts (HTTPS Callable)
 * Este código duplica funcionalidade moderna e não é mais usado na produção.
 * Manter apenas para compatibilidade com triggers antigos até migração completa.
 */

/* istanbul ignore next - Legacy Firestore trigger, replaced by modern callable functions */
/**
 * Cloud Function: Create Stripe Checkout Session
 * Triggered when a new document is created in /users/{userId}/checkout_sessions/{sessionId}
 */
export const createStripeCheckoutSession = functions.firestore
  .document('users/{userId}/checkout_sessions/{sessionId}')
  .onCreate(async (snap: FirebaseFirestore.QueryDocumentSnapshot, context: functions.EventContext) => {
    const { userId } = context.params;
    const data = snap.data();

    try {
      console.log('[Stripe] Creating checkout session for user:', userId);

      // Get or create Stripe customer
      const customerId = await getOrCreateCustomer(userId, data.email, data.name);

      // Get price ID
      const priceId = getPriceId(data.plan, data.billingInterval);

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1
          }
        ],
        success_url: data.successUrl + '?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: data.cancelUrl,
        subscription_data: {
          trial_period_days: data.trialPeriodDays || 7,
          metadata: {
            firebaseUid: userId,
            plan: data.plan,
            billingInterval: data.billingInterval
          }
        },
        metadata: {
          firebaseUid: userId,
          plan: data.plan,
          billingInterval: data.billingInterval
        }
      });

      // Update Firestore document with session URL
      await snap.ref.update({
        sessionId: session.id,
        url: session.url,
        status: 'created',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log('[Stripe] Checkout session created:', session.id);

    } catch (error: any) {
      console.error('[Stripe] Error creating checkout session:', error);
      
      // Update document with error
      await snap.ref.update({
        error: error.message,
        status: 'error',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  });

/* istanbul ignore next - Legacy Firestore trigger, replaced by modern callable functions */
/**
 * Cloud Function: Create Stripe Billing Portal Session
 * Triggered when a new document is created in /users/{userId}/billing_portal_sessions/{sessionId}
 */
export const createStripeBillingPortalSession = functions.firestore
  .document('users/{userId}/billing_portal_sessions/{sessionId}')
  .onCreate(async (snap: FirebaseFirestore.QueryDocumentSnapshot, context: functions.EventContext) => {
    const { userId } = context.params;
    const data = snap.data();

    try {
      console.log('[Stripe] Creating billing portal session for user:', userId);

      // Get customer ID
      const customerRef = db.doc(`users/${userId}/stripe_customer/data`);
      const customerSnap = await customerRef.get();

      if (!customerSnap.exists) {
        throw new Error('No Stripe customer found for user');
      }

      const customerData = customerSnap.data();
      const customerId = customerData!.id;

      // Create billing portal session
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: data.returnUrl
      });

      // Update Firestore document with session URL
      await snap.ref.update({
        sessionId: session.id,
        url: session.url,
        status: 'created',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log('[Stripe] Billing portal session created:', session.id);

    } catch (error: any) {
      console.error('[Stripe] Error creating billing portal session:', error);
      
      await snap.ref.update({
        error: error.message,
        status: 'error',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  });

/* istanbul ignore next - Legacy HTTP webhook handler, replaced by modern callable functions */
/**
 * Cloud Function: Handle Stripe Webhooks
 * HTTP endpoint that receives webhook events from Stripe
 */
export const handleStripeWebhook = functions.https.onRequest(async (req: functions.https.Request, res: functions.Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = functions.config().stripe?.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET || '';

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (error: any) {
    console.error('[Stripe Webhook] Signature verification failed:', error.message);
    res.status(400).send(`Webhook Error: ${error.message}`);
    return;
  }

  console.log('[Stripe Webhook] Received event:', event.type);

  try {
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      default:
        console.log('[Stripe Webhook] Unhandled event type:', event.type);
    }

    res.json({ received: true });

  } catch (error: any) {
    console.error('[Stripe Webhook] Error processing event:', error);
    res.status(500).send(`Webhook Error: ${error.message}`);
  }
});

/* istanbul ignore next - Legacy webhook handler helper */
/**
 * Handle checkout.session.completed event
 * Updates user subscription after successful checkout
 */
async function handleCheckoutSessionCompleted(session: any): Promise<void> {
  const userId = session.metadata?.firebaseUid;
  if (!userId) {
    console.error('[Stripe] No firebaseUid in session metadata');
    return;
  }

  const plan = session.metadata?.plan as 'premium' | 'family';

  console.log('[Stripe] Checkout completed for user:', userId, '| Plan:', plan);

  // Get subscription details
  const subscriptionId = session.subscription as string;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any;

  // Update user subscription in Firestore
  const subscriptionRef = db.doc(`users/${userId}/subscription/current`);
  await subscriptionRef.set({
    plan,
    status: subscription.status === 'trialing' ? 'trialing' : 'active',
    features: {}, // Will be set by client based on plan
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customer as string,
    currentPeriodStart: admin.firestore.Timestamp.fromMillis((subscription.current_period_start || 0) * 1000),
    currentPeriodEnd: admin.firestore.Timestamp.fromMillis((subscription.current_period_end || 0) * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // Save Stripe subscription data
  const stripeSubRef = db.doc(`users/${userId}/stripe_subscription/active`);
  await stripeSubRef.set({
    id: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    metadata: subscription.metadata
  });

  console.log('[Stripe] Subscription activated for user:', userId);
}

/* istanbul ignore next - Legacy webhook handler helper */
/**
 * Handle customer.subscription.updated event
 */
async function handleSubscriptionUpdate(subscription: any): Promise<void> {
  const userId = subscription.metadata?.firebaseUid;
  if (!userId) {
    console.error('[Stripe] No firebaseUid in subscription metadata');
    return;
  }

  console.log('[Stripe] Subscription updated for user:', userId, '| Status:', subscription.status);

  // Map subscription status to our internal status
  let status: 'active' | 'trialing' | 'canceled';
  if (subscription.status === 'trialing') {
    status = 'trialing';
  } else if (subscription.status === 'active') {
    status = 'active';
  } else {
    status = 'canceled';
  }

  // Update subscription in Firestore
  const subscriptionRef = db.doc(`users/${userId}/subscription/current`);
  await subscriptionRef.update({
    status,
    currentPeriodStart: admin.firestore.Timestamp.fromMillis((subscription.current_period_start || 0) * 1000),
    currentPeriodEnd: admin.firestore.Timestamp.fromMillis((subscription.current_period_end || 0) * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Update Stripe subscription data
  const stripeSubRef = db.doc(`users/${userId}/stripe_subscription/active`);
  await stripeSubRef.update({
    status: subscription.status,
    currentPeriodStart: subscription.current_period_start,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end
  });
}

/* istanbul ignore next - Legacy webhook handler helper */
/**
 * Handle customer.subscription.deleted event
 */
async function handleSubscriptionDeleted(subscription: any): Promise<void> {
  const userId = subscription.metadata?.firebaseUid;
  if (!userId) {
    console.error('[Stripe] No firebaseUid in subscription metadata');
    return;
  }

  console.log('[Stripe] Subscription deleted for user:', userId);

  // Downgrade to free plan
  const subscriptionRef = db.doc(`users/${userId}/subscription/current`);
  await subscriptionRef.update({
    plan: 'free',
    status: 'canceled',
    stripeSubscriptionId: null,
    canceledAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Delete Stripe subscription data
  const stripeSubRef = db.doc(`users/${userId}/stripe_subscription/active`);
  await stripeSubRef.delete();
}

/* istanbul ignore next - Legacy webhook handler helper */
/**
 * Handle invoice.payment_succeeded event
 */
async function handleInvoicePaymentSucceeded(invoice: any): Promise<void> {
  const customerId = invoice.customer as string;
  
  // Find user by customer ID
  const customersSnapshot = await db.collectionGroup('stripe_customer')
    .where('id', '==', customerId)
    .limit(1)
    .get();

  if (customersSnapshot.empty) {
    console.error('[Stripe] No user found for customer:', customerId);
    return;
  }

  const userId = customersSnapshot.docs[0].ref.parent.parent!.id;

  console.log('[Stripe] Invoice payment succeeded for user:', userId);

  // Update payment status
  const subscriptionRef = db.doc(`users/${userId}/subscription/current`);
  await subscriptionRef.update({
    status: 'active',
    lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

/* istanbul ignore next - Legacy webhook handler helper */
/**
 * Handle invoice.payment_failed event
 */
async function handleInvoicePaymentFailed(invoice: any): Promise<void> {
  const customerId = invoice.customer as string;
  
  // Find user by customer ID
  const customersSnapshot = await db.collectionGroup('stripe_customer')
    .where('id', '==', customerId)
    .limit(1)
    .get();

  if (customersSnapshot.empty) {
    console.error('[Stripe] No user found for customer:', customerId);
    return;
  }

  const userId = customersSnapshot.docs[0].ref.parent.parent!.id;

  console.log('[Stripe] Invoice payment failed for user:', userId);

  // Update payment status
  const subscriptionRef = db.doc(`users/${userId}/subscription/current`);
  await subscriptionRef.update({
    status: 'past_due',
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // FUTURE: Send notification to user about payment failure via email or push notification
}
