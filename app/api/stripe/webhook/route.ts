import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import {
  getGroupSessionById,
  markPlayerSignupsPaidByCheckoutSession,
} from "@/lib/groupSessions";
import {
  PLAYER_DASHBOARD_URL,
  sendGroupSignupConfirmationEmail,
  sendGroupSignupOwnerNotificationEmail,
} from "@/lib/groupSignupEmails";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing Stripe webhook configuration" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const payload = await request.text();
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error("Invalid Stripe webhook signature", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;

      const paymentIntentId =
        typeof checkoutSession.payment_intent === "string"
          ? checkoutSession.payment_intent
          : checkoutSession.payment_intent?.id || null;

      let chargeId: string | null = null;
      let receiptUrl: string | null = null;

      if (paymentIntentId) {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
          expand: ["latest_charge"],
        });

        if (paymentIntent.latest_charge && typeof paymentIntent.latest_charge !== "string") {
          chargeId = paymentIntent.latest_charge.id;
          receiptUrl = paymentIntent.latest_charge.receipt_url || null;
        }
      }

      const paidSignups = await markPlayerSignupsPaidByCheckoutSession(checkoutSession.id, {
        paymentIntentId,
        chargeId,
        receiptUrl,
      });

      const metadata = checkoutSession.metadata || {};
      const metadataLoginEmail = (metadata.parent_portal_email || "").trim();
      const metadataLoginPassword = (metadata.parent_portal_password || "").trim();
      const primarySignup = paidSignups[0];
      const loginEmail = metadataLoginEmail || primarySignup?.contact_email || "";
      const loginPassword = metadataLoginPassword || null;

      if (primarySignup?.contact_email) {
        const session = await getGroupSessionById(primarySignup.group_session_id);
        if (session) {
          const playerNames = paidSignups.map((signup) =>
            `${signup.first_name} ${signup.last_name}`.trim()
          );
          try {
            await sendGroupSignupConfirmationEmail({
              to: primarySignup.contact_email,
              firstName: primarySignup.first_name,
              playerNames,
              sessionTitle: session.title,
              sessionDate: session.session_date,
              sessionDateEnd: session.session_date_end,
              location: session.location,
              receiptUrl,
              loginEmail,
              loginPassword,
            });
          } catch (emailError) {
            console.error("Failed to send group signup confirmation email", emailError);
          }

          const ownerAlertEmail =
            process.env.GROUP_SIGNUP_ALERT_EMAIL ||
            process.env.GMAIL_USER_GROUPS ||
            "davidfalesct@gmail.com";

          try {
            await sendGroupSignupOwnerNotificationEmail({
              to: ownerAlertEmail,
              playerNames,
              emergencyContact: primarySignup.emergency_contact,
              contactPhone: primarySignup.contact_phone,
              contactEmail: primarySignup.contact_email,
              sessionTitle: session.title,
              sessionDate: session.session_date,
              sessionDateEnd: session.session_date_end,
              location: session.location,
              receiptUrl,
              parentPortalUrl: PLAYER_DASHBOARD_URL,
              parentLoginEmail: loginEmail,
              parentLoginPassword: loginPassword,
            });
          } catch (ownerEmailError) {
            console.error("Failed to send group signup owner alert email", ownerEmailError);
          }
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Stripe webhook handling error", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
