import { supabaseAdmin } from '@/lib/db/client';

export type WebhookEventType =
  | 'lead.created'
  | 'lead.temperature_changed'
  | 'appointment.booked'
  | 'handoff.triggered';

interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, any>;
}

export async function notifyWebhook(tenantId: string, event: WebhookEventType, data: Record<string, any>) {
  try {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('crm_webhook_url')
      .eq('id', tenantId)
      .single();

    if (!tenant?.crm_webhook_url) return;

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const res = await fetch(tenant.crm_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    console.log(`[WebhookNotifier] ${event} -> ${tenant.crm_webhook_url} (${res.status})`);
  } catch (error) {
    console.error(`[WebhookNotifier] Failed to send ${event}:`, error);
  }
}
