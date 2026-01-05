import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import * as xml2js from "xml2js";

// PagSeguro API Configuration
const PAGSEGURO_CONFIG = {
  sandbox: {
    apiUrl: "https://ws.sandbox.pagseguro.uol.com.br",
    checkoutUrl: "https://sandbox.pagseguro.uol.com.br",
  },
  production: {
    apiUrl: "https://ws.pagseguro.uol.com.br",
    checkoutUrl: "https://pagseguro.uol.com.br",
  },
};

const isProd = (process.env.PAGSEGURO_ENVIRONMENT || functions.config()?.pagseguro?.environment) === "production";
const API_URL = isProd ? PAGSEGURO_CONFIG.production.apiUrl : PAGSEGURO_CONFIG.sandbox.apiUrl;
const CHECKOUT_URL = isProd
  ? PAGSEGURO_CONFIG.production.checkoutUrl
  : PAGSEGURO_CONFIG.sandbox.checkoutUrl;

/**
 * Create PagSeguro Subscription
 */
export const createPagSeguroSubscription = functions.https.onCall(
  async (data, context) => {
    try {
      if (!context.auth) {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "User must be authenticated"
        );
      }

      const { planCode, userId, plan, billingCycle, customer } = data;

      if (!planCode || !userId || !plan || !customer) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Missing required fields"
        );
      }

      const email = process.env.PAGSEGURO_EMAIL || functions.config()?.pagseguro?.email;
      const token = process.env.PAGSEGURO_TOKEN || functions.config()?.pagseguro?.token;

      // Create subscription XML
      const subscriptionXml = buildSubscriptionXml(planCode, customer, userId);

      // Call PagSeguro API
      const response = await axios.post(
        `${API_URL}/pre-approvals/request?email=${email}&token=${token}`,
        subscriptionXml,
        {
          headers: {
            "Content-Type": "application/xml; charset=UTF-8",
          },
        }
      );

      // Parse XML response
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);

      const code = result.preApprovalRequest.code[0];

      // Save subscription to Firestore
      await admin
        .firestore()
        .collection("subscriptions")
        .doc(userId)
        .set(
          {
            userId,
            plan,
            billingCycle,
            pagseguroCode: code,
            status: "pending",
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
          },
          { merge: true }
        );

      return {
        code,
        checkoutUrl: `${CHECKOUT_URL}/v2/pre-approvals/request.html?code=${code}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error creating PagSeguro subscription:", error);
      throw new functions.https.HttpsError("internal", errorMessage);
    }
  }
);

/**
 * Build subscription XML for PagSeguro
 */
function buildSubscriptionXml(planCode: string, customer: any, reference: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<preApprovalRequest>
    <reference>${reference}</reference>
    <plan>${planCode}</plan>
    <sender>
        <name>${customer.name}</name>
        <email>${customer.email}</email>
        <phone>
            <areaCode>${customer.phone.areaCode}</areaCode>
            <number>${customer.phone.number}</number>
        </phone>
    </sender>
</preApprovalRequest>`;
}

/**
 * PagSeguro Notification Webhook
 * Processes notifications from PagSeguro and updates Firestore
 */
export const pagseguroNotification = functions.https.onRequest(async (req, res) => {
  try {
    const notificationCode = req.body.notificationCode || req.query.notificationCode;
    const notificationType = req.body.notificationType || req.query.notificationType;

    if (!notificationCode || !notificationType) {
      res.status(400).send("Missing notification parameters");
      return;
    }

    const email = process.env.PAGSEGURO_EMAIL || functions.config()?.pagseguro?.email;
    const token = process.env.PAGSEGURO_TOKEN || functions.config()?.pagseguro?.token;

    // Get notification details from PagSeguro
    let apiEndpoint = "";
    if (notificationType === "preApproval") {
      apiEndpoint = `${API_URL}/v2/pre-approvals/notifications/${notificationCode}`;
    } else if (notificationType === "transaction") {
      apiEndpoint = `${API_URL}/v3/transactions/notifications/${notificationCode}`;
    } else {
      res.status(400).send("Unknown notification type");
      return;
    }

    const response = await axios.get(`${apiEndpoint}?email=${email}&token=${token}`);

    // Parse XML response
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response.data);

    if (notificationType === "preApproval") {
      await handlePreApprovalNotification(result);
    } else if (notificationType === "transaction") {
      await handleTransactionNotification(result);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Error processing PagSeguro notification:", error);
    res.status(500).send("Error processing notification");
  }
});

/**
 * Handle pre-approval (subscription) notification
 */
async function handlePreApprovalNotification(data: any) {
  try {
    const preApproval = data.preApproval;
    const reference = preApproval.reference[0];
    const code = preApproval.code[0];
    const status = preApproval.status[0];

    // Map PagSeguro status
    const mappedStatus = mapPagSeguroStatus(status);

    // Update subscription in Firestore
    await admin
      .firestore()
      .collection("subscriptions")
      .doc(reference)
      .update({
        pagseguroCode: code,
        status: mappedStatus,
        lastEventDate: preApproval.lastEventDate[0],
        lastUpdated: new Date().toISOString(),
      });

    // If canceled, downgrade to free plan
    if (status === "CANCELLED") {
      await admin
        .firestore()
        .collection("subscriptions")
        .doc(reference)
        .update({
          plan: "free",
        });
    }

    console.log(`✅ PagSeguro subscription updated: ${reference}, status: ${mappedStatus}`);
  } catch (error) {
    console.error("Error handling pre-approval notification:", error);
    throw error;
  }
}

/**
 * Handle transaction (payment) notification
 */
async function handleTransactionNotification(data: any) {
  try {
    const transaction = data.transaction;
    const reference = transaction.reference[0];
    const status = transaction.status[0];

    // Status codes:
    // 1: Aguardando pagamento
    // 2: Em análise
    // 3: Paga
    // 4: Disponível
    // 5: Em disputa
    // 6: Devolvida
    // 7: Cancelada

    if (status === "3" || status === "4") {
      // Payment successful - reset usage counters
      await admin
        .firestore()
        .collection("subscriptions")
        .doc(reference)
        .update({
          "currentUsage.reportsGenerated": 0,
          "currentUsage.ocrScansUsed": 0,
          "currentUsage.telehealthConsultsUsed": 0,
          lastPaymentDate: new Date().toISOString(),
          lastPaymentAmount: parseFloat(transaction.grossAmount[0]),
        });

      console.log(`✅ Payment successful for subscription: ${reference}`);
    } else if (status === "7") {
      // Payment canceled
      await admin
        .firestore()
        .collection("subscriptions")
        .doc(reference)
        .update({
          status: "past_due",
        });

      console.log(`❌ Payment failed for subscription: ${reference}`);
    }
  } catch (error) {
    console.error("Error handling transaction notification:", error);
    throw error;
  }
}

/**
 * Map PagSeguro status to our status
 */
function mapPagSeguroStatus(
  pagseguroStatus: string
): "active" | "past_due" | "canceled" | "trial" {
  switch (pagseguroStatus) {
  case "ACTIVE":
    return "active";
  case "SUSPENDED":
    return "past_due";
  case "CANCELLED":
  case "EXPIRED":
    return "canceled";
  default:
    return "active";
  }
}

/**
 * Get PagSeguro subscription status
 */
export const getPagSeguroSubscriptionStatus = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { subscriptionCode } = data;

    if (!subscriptionCode) {
      throw new functions.https.HttpsError("invalid-argument", "Missing subscriptionCode");
    }

    try {
      const email = process.env.PAGSEGURO_EMAIL || functions.config()?.pagseguro?.email;
      const token = process.env.PAGSEGURO_TOKEN || functions.config()?.pagseguro?.token;

      const response = await axios.get(
        `${API_URL}/v2/pre-approvals/${subscriptionCode}?email=${email}&token=${token}`
      );

      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);
      const preApproval = result.preApproval;

      return {
        status: preApproval.status[0],
        code: preApproval.code[0],
        reference: preApproval.reference[0],
        lastEventDate: preApproval.lastEventDate[0],
        charge: preApproval.charge[0],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error getting PagSeguro subscription status:", error);
      throw new functions.https.HttpsError("internal", errorMessage);
    }
  }
);

/**
 * Cancel PagSeguro subscription
 */
export const cancelPagSeguroSubscription = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { subscriptionCode } = data;

    if (!subscriptionCode) {
      throw new functions.https.HttpsError("invalid-argument", "Missing subscriptionCode");
    }

    try {
      const email = process.env.PAGSEGURO_EMAIL || functions.config()?.pagseguro?.email;
      const token = process.env.PAGSEGURO_TOKEN || functions.config()?.pagseguro?.token;

      await axios.put(
        `${API_URL}/v2/pre-approvals/${subscriptionCode}/cancel?email=${email}&token=${token}`
      );

      return { success: true, message: "Subscription canceled" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error canceling PagSeguro subscription:", error);
      throw new functions.https.HttpsError("internal", errorMessage);
    }
  }
);

/**
 * Suspend PagSeguro subscription
 */
export const suspendPagSeguroSubscription = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { subscriptionCode } = data;

    if (!subscriptionCode) {
      throw new functions.https.HttpsError("invalid-argument", "Missing subscriptionCode");
    }

    try {
      const email = process.env.PAGSEGURO_EMAIL || functions.config()?.pagseguro?.email;
      const token = process.env.PAGSEGURO_TOKEN || functions.config()?.pagseguro?.token;

      await axios.put(
        `${API_URL}/v2/pre-approvals/${subscriptionCode}/suspend?email=${email}&token=${token}`
      );

      return { success: true, message: "Subscription suspended" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error suspending PagSeguro subscription:", error);
      throw new functions.https.HttpsError("internal", errorMessage);
    }
  }
);

/**
 * Reactivate PagSeguro subscription
 */
export const reactivatePagSeguroSubscription = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { subscriptionCode } = data;

    if (!subscriptionCode) {
      throw new functions.https.HttpsError("invalid-argument", "Missing subscriptionCode");
    }

    try {
      const email = process.env.PAGSEGURO_EMAIL || functions.config()?.pagseguro?.email;
      const token = process.env.PAGSEGURO_TOKEN || functions.config()?.pagseguro?.token;

      await axios.put(
        `${API_URL}/v2/pre-approvals/${subscriptionCode}/reactivate?email=${email}&token=${token}`
      );

      return { success: true, message: "Subscription reactivated" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error reactivating PagSeguro subscription:", error);
      throw new functions.https.HttpsError("internal", errorMessage);
    }
  }
);

/**
 * Get PagSeguro transaction history
 */
export const getPagSeguroTransactionHistory = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const { email: customerEmail, days = 30 } = data;

    if (!customerEmail) {
      throw new functions.https.HttpsError("invalid-argument", "Missing email");
    }

    try {
      const email = process.env.PAGSEGURO_EMAIL || functions.config()?.pagseguro?.email;
      const token = process.env.PAGSEGURO_TOKEN || functions.config()?.pagseguro?.token;

      const initialDate = new Date();
      initialDate.setDate(initialDate.getDate() - days);
      const finalDate = new Date();

      const url = `${API_URL}/v2/transactions?email=${email}&token=${token}` +
        `&initialDate=${initialDate.toISOString()}&finalDate=${finalDate.toISOString()}`;
      const response = await axios.get(url);

      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);

      const transactions = result.transactionSearchResult?.transactions?.[0]?.transaction || [];

      return {
        transactions: transactions.map((t: any) => ({
          code: t.code[0],
          reference: t.reference?.[0],
          type: parseInt(t.type[0]),
          status: parseInt(t.status[0]),
          date: t.date[0],
          lastEventDate: t.lastEventDate[0],
          grossAmount: parseFloat(t.grossAmount[0]),
          netAmount: parseFloat(t.netAmount[0]),
          paymentMethod: {
            type: parseInt(t.paymentMethod[0].type[0]),
            code: parseInt(t.paymentMethod[0].code[0]),
          },
        })),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error getting PagSeguro transaction history:", error);
      throw new functions.https.HttpsError("internal", errorMessage);
    }
  }
);
