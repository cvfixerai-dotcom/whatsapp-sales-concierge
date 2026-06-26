import { NextRequest } from 'next/server';
import {
  verifyAndUnwrapWhopWebhook,
  getTenantByEmail,
  getTierForPlanId,
  getTopupTypeForPlanId,
  activateWhopSubscription,
  deactivateWhopSubscription,
} from '@/lib/billing/whop';
import { addTopUpConversations } from '@/lib/billing/usage-tracker';
import { supabaseAdmin } from '@/lib/db/client';
import { sendEmail } from '@/lib/ai/tools/send-email';
import { log } from '@/lib/monitoring/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let event: any;
    try {
      event = verifyAndUnwrapWhopWebhook(body, headers);
    } catch (sigError) {
      log('warning', 'Invalid Whop webhook signature', { error: sigError });
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    log('info', 'Whop webhook received', { type: event?.type });

    switch (event?.type) {
      case 'payment.succeeded':
        await handlePaymentSucceeded(event.data);
        break;

      case 'payment.failed':
        await handlePaymentFailed(event.data);
        break;

      case 'membership.activated':
        await handleMembershipActivated(event.data);
        break;

      case 'membership.deactivated':
        await handleMembershipDeactivated(event.data);
        break;

      default:
        log('info', 'Unhandled Whop event', { type: event?.type });
    }

    return Response.json({ success: true });
  } catch (error) {
    log('error', 'Whop webhook error', { error });
    return Response.json({ error: 'Webhook failed' }, { status: 500 });
  }
}

async function handlePaymentSucceeded(payment: any) {
  try {
    const email = payment?.user?.email;
    const planId = payment?.plan?.id;
    const tier = getTierForPlanId(planId);
    const topupType = getTopupTypeForPlanId(planId);
    const membershipId = payment?.membership?.id || null;

    const tenant = await getTenantByEmail(email);

    if (!tenant) {
      log('warning', 'Whop payment.succeeded: no matching tenant found', { email, planId });
      return;
    }

    if (!tier && !topupType) {
      log('warning', 'Whop payment.succeeded: could not resolve tier or topup type from plan_id', { planId, tenantId: tenant.id });
    }

    // Record payment
    await supabaseAdmin.from('payments').insert({
      tenant_id: tenant.id,
      whop_payment_id: payment.id,
      amount: payment.total ?? payment.subtotal ?? 0,
      currency: payment.currency || 'usd',
      type: topupType ? 'topup' : 'subscription',
      status: 'success',
      paid_at: payment.paid_at ? new Date(payment.paid_at) : new Date(),
      metadata: { plan_id: planId, tier, topup_type: topupType, membership_id: membershipId },
    });

    if (tier) {
      await activateWhopSubscription({
        tenantId: tenant.id,
        tier,
        membershipId,
        planId,
        customerId: payment?.user?.id || null,
      });

      await sendEmail({
        to: tenant.owner_email,
        template: 'subscription_started',
        data: {
          company_name: tenant.company_name,
          plan: tier,
          amount: payment.total ?? payment.subtotal ?? 0,
          payment_reference: payment.id,
          dashboard_link: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
        },
      }).catch(() => {});
    } else if (topupType) {
      await addTopUpConversations(tenant.id, topupType, payment.id);
    }

    log('info', 'Whop payment processed successfully', { tenantId: tenant.id, tier, topupType, paymentId: payment.id });
  } catch (error) {
    log('error', 'Failed to handle Whop payment.succeeded', { error });
    throw error;
  }
}

async function handlePaymentFailed(payment: any) {
  try {
    const email = payment?.user?.email;
    const tenant = await getTenantByEmail(email);

    if (!tenant) {
      log('warning', 'Whop payment.failed: no matching tenant found', { email });
      return;
    }

    await supabaseAdmin.from('payments').insert({
      tenant_id: tenant.id,
      whop_payment_id: payment.id,
      amount: payment.total ?? payment.subtotal ?? 0,
      currency: payment.currency || 'usd',
      type: 'subscription',
      status: 'failed',
      failed_at: new Date(),
      metadata: { plan_id: payment?.plan?.id, failure_message: payment.failure_message },
    });

    await sendEmail({
      to: tenant.owner_email,
      template: 'payment_failed',
      data: {
        company_name: tenant.company_name,
        amount: payment.total ?? payment.subtotal ?? 0,
        type: 'subscription',
        retry_link: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
      },
    }).catch(() => {});

    log('warning', 'Whop payment failed', { tenantId: tenant.id, paymentId: payment.id });
  } catch (error) {
    log('error', 'Failed to handle Whop payment.failed', { error });
  }
}

async function handleMembershipActivated(membership: any) {
  try {
    const email = membership?.user?.email;
    const planId = membership?.plan?.id;
    const tier = getTierForPlanId(planId);

    const tenant = await getTenantByEmail(email);
    if (!tenant || !tier) {
      log('warning', 'Whop membership.activated: tenant or tier not resolved', { email, planId });
      return;
    }

    await activateWhopSubscription({
      tenantId: tenant.id,
      tier,
      membershipId: membership.id,
      planId,
      customerId: membership?.user?.id || null,
    });

    log('info', 'Whop membership activated', { tenantId: tenant.id, tier, membershipId: membership.id });
  } catch (error) {
    log('error', 'Failed to handle Whop membership.activated', { error });
  }
}

async function handleMembershipDeactivated(membership: any) {
  try {
    // Prefer matching by stored whop_membership_id, fall back to email
    const { data: tenantByMembership } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('whop_membership_id', membership.id)
      .maybeSingle();

    const tenant = tenantByMembership || (await getTenantByEmail(membership?.user?.email));

    if (!tenant) {
      log('warning', 'Whop membership.deactivated: no matching tenant found', { membershipId: membership.id });
      return;
    }

    await deactivateWhopSubscription(tenant.id);

    await sendEmail({
      to: tenant.owner_email,
      template: 'subscription_cancelled',
      data: {
        company_name: tenant.company_name,
        access_until: new Date().toISOString(),
        reactivation_link: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
      },
    }).catch(() => {});

    log('info', 'Whop membership deactivated', { tenantId: tenant.id, membershipId: membership.id });
  } catch (error) {
    log('error', 'Failed to handle Whop membership.deactivated', { error });
  }
}
