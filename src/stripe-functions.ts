import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

// Initialize Stripe with secret key (use environment variable or config)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || functions.config()?.stripe?.secret_key || '';
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
}) : null as any;

/**
 * Create Stripe Checkout Session
 */
export const createStripeCheckoutSession = functions.https.onCall(
  async (data, context) => {
    try {
      // Authenticate user
      if (!context.auth) {
        throw new functions.https.HttpsError(
          'unauthenticated',
          'User must be authenticated'
        );
      }

      const { priceId, userId, plan, billingCycle, successUrl, cancelUrl } = data;

      // Validate required fields
      if (!priceId || !userId || !plan) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing required fields'
        );
      }

      // Create or retrieve Stripe customer
      const userDoc = await admin.firestore().collection('users').doc(userId).get();
      const userData = userDoc.data();

      let customerId = userData?.stripeCustomerId;

      if (!customerId) {
        // Create new Stripe customer
        const customer = await stripe.customers.create({
          email: context.auth.token.email,
          metadata: {
            userId,
            firebaseUid: context.auth.uid,
          },
        });
        customerId = customer.id;

        // Save customer ID to Firestore (use set with merge to create if not exists)
        await admin.firestore().collection('users').doc(userId).set({
          stripeCustomerId: customerId,
        }, { merge: true });
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId,
          plan,
          billingCycle,
        },
        subscription_data: {
          metadata: {
            userId,
            plan,
            billingCycle,
          },
        },
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      throw new functions.https.HttpsError('internal', error?.message || 'Unknown error');
    }
  }
);

/**
 * Stripe Webhook Handler
 * Processes Stripe events and updates Firestore
 */
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || functions.config()?.stripe?.webhook_secret;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error);
    res.status(400).send(`Webhook Error: ${error?.message || 'Unknown error'}`);
    return;
  }

  try {
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    res.status(500).send(`Webhook Error: ${error?.message || 'Unknown error'}`);
  }
});

/**
 * Handle completed checkout session
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const plan = session.metadata?.plan;
  const billingCycle = session.metadata?.billingCycle;

  if (!userId || !plan) {
    console.error('Missing metadata in checkout session');
    return;
  }

  const subscriptionId = session.subscription as string;

  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Update user subscription in Firestore
  await updateUserSubscription(userId, {
    plan,
    status: 'active',
    stripeCustomerId: session.customer as string,
    stripeSubscriptionId: subscriptionId,
    currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    billingCycle,
  });

  console.log(`✅ Checkout completed for user ${userId}, plan: ${plan}`);
}

/**
 * Handle subscription update
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.error('Missing userId in subscription metadata');
    return;
  }

  const status = mapStripeStatus(subscription.status);

  await updateUserSubscription(userId, {
    status,
    currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  console.log(`✅ Subscription updated for user ${userId}, status: ${status}`);
}

/**
 * Handle subscription deletion
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.error('Missing userId in subscription metadata');
    return;
  }

  await updateUserSubscription(userId, {
    plan: 'free',
    status: 'canceled',
    stripeSubscriptionId: null,
  });

  console.log(`✅ Subscription deleted for user ${userId}`);
}

/**
 * Handle successful invoice payment
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Find user by Stripe customer ID
  const userSnapshot = await admin
    .firestore()
    .collection('users')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (userSnapshot.empty) {
    console.error('User not found for customer:', customerId);
    return;
  }

  const userId = userSnapshot.docs[0].id;

  // Reset usage counters on successful payment
  await admin
    .firestore()
    .collection('subscriptions')
    .doc(userId)
    .update({
      'currentUsage.reportsGenerated': 0,
      'currentUsage.ocrScansUsed': 0,
      'currentUsage.telehealthConsultsUsed': 0,
      lastPaymentDate: new Date().toISOString(),
      lastPaymentAmount: invoice.amount_paid / 100,
    });

  console.log(`✅ Invoice paid for user ${userId}`);
}

/**
 * Handle failed invoice payment
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Find user by Stripe customer ID
  const userSnapshot = await admin
    .firestore()
    .collection('users')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (userSnapshot.empty) {
    console.error('User not found for customer:', customerId);
    return;
  }

  const userId = userSnapshot.docs[0].id;

  await updateUserSubscription(userId, {
    status: 'past_due',
  });

  // NOTE: Email notification for failed payment pending (see PRODUCT-ROADMAP-IMPROVEMENTS.md)
  // Future: Send email via SendGrid/Firebase Extensions

  console.log(`❌ Payment failed for user ${userId}`);
}

/**
 * Update user subscription in Firestore
 */
async function updateUserSubscription(userId: string, data: any) {
  const subscriptionRef = admin.firestore().collection('subscriptions').doc(userId);
  const subscriptionDoc = await subscriptionRef.get();

  if (!subscriptionDoc.exists) {
    // Create new subscription document
    await subscriptionRef.set({
      userId,
      ...data,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    });
  } else {
    // Update existing subscription
    await subscriptionRef.update({
      ...data,
      lastUpdated: new Date().toISOString(),
    });
  }
}

/**
 * Map Stripe subscription status to our status
 */
function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status
): 'active' | 'past_due' | 'canceled' | 'trial' {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    case 'trialing':
      return 'trial';
    default:
      return 'active';
  }
}

/**
 * Get Stripe subscription status
 */
export const getStripeSubscriptionStatus = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { subscriptionId } = data;

    if (!subscriptionId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing subscriptionId');
    }

    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      return {
        status: mapStripeStatus(subscription.status),
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        customerId: subscription.customer,
        subscriptionId: subscription.id,
      };
    } catch (error: any) {
      console.error('Error getting subscription status:', error);
      throw new functions.https.HttpsError('internal', error?.message || 'Unknown error');
    }
  }
);

/**
 * Cancel Stripe subscription
 */
export const cancelStripeSubscription = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { subscriptionId } = data;

  if (!subscriptionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing subscriptionId');
  }

  try {
    // Cancel at period end (don't immediately cancel)
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    return { success: true, message: 'Subscription will be canceled at period end' };
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    throw new functions.https.HttpsError('internal', error?.message || 'Unknown error');
  }
});

/**
 * Reactivate canceled Stripe subscription
 */
export const reactivateStripeSubscription = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { subscriptionId } = data;

    if (!subscriptionId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing subscriptionId');
    }

    try {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });

      return { success: true, message: 'Subscription reactivated' };
    } catch (error: any) {
      console.error('Error reactivating subscription:', error);
      throw new functions.https.HttpsError('internal', error?.message || 'Unknown error');
    }
  }
);

/**
 * Create Stripe Customer Portal session
 */
export const createStripeCustomerPortal = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { customerId, returnUrl } = data;

    if (!customerId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing customerId');
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return { url: session.url };
    } catch (error: any) {
      console.error('Error creating customer portal:', error);
      throw new functions.https.HttpsError('internal', error?.message || 'Unknown error');
    }
  }
);

/**
 * Get upcoming invoice
 */
export const getStripeUpcomingInvoice = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { customerId } = data;

  if (!customerId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing customerId');
  }

  try {
    const invoice = await stripe.invoices.retrieveUpcoming({
      customer: customerId,
    });

    return {
      amount: invoice.amount_due / 100,
      currency: invoice.currency,
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
    };
  } catch (error: any) {
    console.error('Error getting upcoming invoice:', error);
    throw new functions.https.HttpsError('internal', error?.message || 'Unknown error');
  }
});

/**
 * Get payment history
 */
export const getStripePaymentHistory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { customerId, limit = 10 } = data;

  if (!customerId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing customerId');
  }

  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit,
    });

    return {
      invoices: invoices.data.map((invoice: any) => ({
        id: invoice.id,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: invoice.status,
        date: invoice.created,
        pdfUrl: invoice.invoice_pdf,
      })),
    };
  } catch (error: any) {
    console.error('Error getting payment history:', error);
    throw new functions.https.HttpsError('internal', error?.message || 'Unknown error');
  }
});

/**
 * Update Stripe subscription (upgrade/downgrade plan)
 */
export const updateStripeSubscription = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { subscriptionId, newPriceId } = data;

  if (!subscriptionId || !newPriceId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: subscriptionId, newPriceId');
  }

  try {
    // Get current subscription
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Update subscription with new price
    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'always_invoice', // Charge/credit prorated amount immediately
    });

    return {
      subscriptionId: updated.id,
      newPrice: newPriceId,
      status: updated.status,
      currentPeriodEnd: updated.current_period_end,
    };
  } catch (error: any) {
    console.error('Error updating subscription:', error);
    throw new functions.https.HttpsError('internal', error?.message || 'Unknown error');
  }
});
