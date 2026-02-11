// @ts-nocheck
import { NextRequest } from 'next/server';
import { verifyPaystackWebhook, verifyTransaction } from '@/lib/billing/paystack';
import { addTopUpConversations } from '@/lib/billing/usage-tracker';
import { supabaseAdmin } from '@/lib/db/client';
import { sendEmail } from '@/lib/ai/tools/send-email';
import { log } from '@/lib/monitoring/logger';

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-paystack-signature');
    const body = await request.text();
    
    if (!signature || !verifyPaystackWebhook(signature, body)) {
      log('warning', 'Invalid Paystack webhook signature', { signature: signature?.substring(0, 20) + '...' });
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }
    
    const event = JSON.parse(body);
    log('info', 'Paystack webhook received', { event: event.event, data: event.data });
    
    switch (event.event) {
      case 'charge.success':
        await handleSuccessfulCharge(event.data);
        break;
      
      case 'charge.failed':
        await handleChargeFailed(event.data);
        break;
      
      case 'subscription.create':
        await handleSubscriptionCreated(event.data);
        break;
      
      case 'subscription.disable':
        await handleSubscriptionCancelled(event.data);
        break;
      
      case 'invoice.create':
        await handleInvoiceCreated(event.data);
        break;
      
      case 'paymentrequest.success':
        await handlePaymentRequestSuccess(event.data);
        break;
      
      default:
        log('info', 'Unhandled Paystack event', { event: event.event });
    }
    
    return Response.json({ success: true });
    
  } catch (error) {
    log('error', 'Paystack webhook error', { error });
    return Response.json({ error: 'Webhook failed' }, { status: 500 });
  }
}

async function handleSuccessfulCharge(data: any) {
  try {
    const tenantId = data.metadata.tenant_id;
    const type = data.metadata.type;
    
    if (!tenantId || !type) {
      log('error', 'Missing metadata in charge.success', { data });
      return;
    }

    // Record payment
    await supabaseAdmin
      .from('payments')
      .insert({
        tenant_id: tenantId,
        paystack_reference: data.reference,
        amount: data.amount / 100, // Convert from cents to dollars
        currency: data.currency || 'USD',
        type: type,
        status: 'success',
        paid_at: new Date(data.paid_at),
        metadata: data.metadata
      });

    // Handle based on payment type
    if (type === 'setup_fee') {
      await handleSetupFeePayment(tenantId, data);
    } else if (type === 'topup') {
      await handleTopUpPayment(tenantId, data);
    }
    
    log('info', 'Payment processed successfully', { 
      tenant_id: tenantId, 
      type,
      amount: data.amount / 100,
      reference: data.reference 
    });
  } catch (error) {
    log('error', 'Failed to handle successful charge', { data, error });
    throw error;
  }
}

async function handleSetupFeePayment(tenantId: string, data: any) {
  try {
    // Update tenant status
    await supabaseAdmin
      .from('tenants')
      .update({
        setup_fee_paid: true,
        onboarding_status: 'payment_completed',
        setup_fee_paid_at: new Date(data.paid_at)
      })
      .eq('id', tenantId);

    // Get tenant details for email
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (tenant) {
      // Send confirmation email
      await sendEmail({
        to: tenant.owner_email,
        template: 'setup_fee_confirmed',
        data: {
          company_name: tenant.company_name,
          amount: data.amount / 100,
          payment_reference: data.reference,
          dashboard_link: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
        }
      });

      // Trigger onboarding workflow
      await triggerOnboardingWorkflow(tenantId);
    }

    log('info', 'Setup fee payment processed', { tenant_id: tenantId });
  } catch (error) {
    log('error', 'Failed to process setup fee payment', { tenant_id: tenantId, error });
    throw error;
  }
}

async function handleTopUpPayment(tenantId: string, data: any) {
  try {
    // Add top-up conversations to their account
    await addTopUpConversations(
      tenantId,
      data.metadata.topup_type,
      data.reference
    );

    log('info', 'Top-up payment processed', { 
      tenant_id: tenantId,
      topup_type: data.metadata.topup_type,
      conversations: data.metadata.conversations 
    });
  } catch (error) {
    log('error', 'Failed to process top-up payment', { tenant_id: tenantId, error });
    throw error;
  }
}

async function handleSubscriptionCreated(data: any) {
  try {
    // Update subscription status
    await supabaseAdmin
      .from('tenants')
      .update({
        subscription_status: 'active',
        subscription_started_at: new Date(data.createdAt),
        next_billing_date: new Date(data.next_payment_date)
      })
      .eq('paystack_subscription_code', data.subscription_code);

    // Get tenant details
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('paystack_subscription_code', data.subscription_code)
      .single();

    if (tenant) {
      // Send welcome email for new subscription
      await sendEmail({
        to: tenant.owner_email,
        template: 'subscription_started',
        data: {
          company_name: tenant.company_name,
          plan: tenant.subscription_tier,
          next_billing_date: data.next_payment_date,
          dashboard_link: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
        }
      });
    }

    log('info', 'Subscription created', { 
      subscription_code: data.subscription_code,
      plan: data.plan 
    });
  } catch (error) {
    log('error', 'Failed to handle subscription creation', { data, error });
    throw error;
  }
}

async function handleSubscriptionCancelled(data: any) {
  try {
    // Update subscription status
    await supabaseAdmin
      .from('tenants')
      .update({
        subscription_status: 'cancelled',
        subscription_cancelled_at: new Date(),
        access_until: new Date(data.current_period_end)
      })
      .eq('paystack_subscription_code', data.subscription_code);

    // Get tenant details
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('paystack_subscription_code', data.subscription_code)
      .single();

    if (tenant) {
      // Send cancellation email
      await sendEmail({
        to: tenant.owner_email,
        template: 'subscription_cancelled',
        data: {
          company_name: tenant.company_name,
          access_until: data.current_period_end,
          reactivation_link: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`
        }
      });

      // Create notification
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: tenant.id,
          type: 'subscription_cancelled',
          title: 'Subscription Cancelled',
          message: `Your subscription has been cancelled. Access will continue until ${new Date(data.current_period_end).toLocaleDateString()}`,
          priority: 'high',
          read: false,
          created_at: new Date().toISOString()
        });
    }

    log('info', 'Subscription cancelled', { 
      subscription_code: data.subscription_code,
      access_until: data.current_period_end 
    });
  } catch (error) {
    log('error', 'Failed to handle subscription cancellation', { data, error });
    throw error;
  }
}

async function handleInvoiceCreated(data: any) {
  try {
    // Record invoice
    await supabaseAdmin
      .from('invoices')
      .upsert({
        tenant_id: data.metadata.tenant_id,
        paystack_request_code: data.request_code,
        amount: data.amount / 100,
        currency: data.currency || 'USD',
        description: data.description,
        due_date: data.due_date,
        status: 'pending',
        created_at: new Date().toISOString()
      }, {
        onConflict: 'paystack_request_code'
      });

    log('info', 'Invoice created', { 
      request_code: data.request_code,
      amount: data.amount / 100 
    });
  } catch (error) {
    log('error', 'Failed to handle invoice creation', { data, error });
    throw error;
  }
}

async function handlePaymentRequestSuccess(data: any) {
  try {
    // Update invoice status
    await supabaseAdmin
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date(data.paid_at)
      })
      .eq('paystack_request_code', data.request_code);

    log('info', 'Payment request completed', { 
      request_code: data.request_code,
      amount: data.amount / 100 
    });
  } catch (error) {
    log('error', 'Failed to handle payment request success', { data, error });
    throw error;
  }
}

async function triggerOnboardingWorkflow(tenantId: string) {
  try {
    // Add to onboarding queue
    await supabaseAdmin
      .from('onboarding_queue')
      .insert({
        tenant_id: tenantId,
        step: 'welcome_email',
        status: 'pending',
        created_at: new Date().toISOString()
      });

    // Create initial notifications
    await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: tenantId,
        type: 'onboarding',
        title: 'Welcome to SalesConcierge AI!',
        message: 'Your account is ready. Let\'s get you set up with WhatsApp.',
        data: { step: 'whatsapp_setup' },
        priority: 'normal',
        read: false,
        created_at: new Date().toISOString()
      });

    log('info', 'Onboarding workflow triggered', { tenant_id: tenantId });
  } catch (error) {
    log('error', 'Failed to trigger onboarding workflow', { tenantId: tenantId, error });
  }
}

// Handle failed charges
async function handleChargeFailed(data: any) {
  try {
    const tenantId = data.metadata?.tenant_id;
    const type = data.metadata?.type;

    if (!tenantId) return;

    // Record failed payment
    await supabaseAdmin
      .from('payments')
      .insert({
        tenant_id: tenantId,
        paystack_reference: data.reference,
        amount: data.amount / 100,
        currency: data.currency || 'USD',
        type: type,
        status: 'failed',
        failed_at: new Date(),
        metadata: data.metadata
      });

    // Get tenant details
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (tenant) {
      // Send failure notification
      await sendEmail({
        to: tenant.owner_email,
        template: 'payment_failed',
        data: {
          company_name: tenant.company_name,
          amount: data.amount / 100,
          type: type?.replace('_', ' '),
          retry_link: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`
        }
      });
    }

    log('warning', 'Payment failed', { 
      tenant_id: tenantId,
      type,
      reference: data.reference 
    });
  } catch (error) {
    log('error', 'Failed to handle charge failure', { data, error });
  }
}
