// @ts-nocheck
import { supabaseAdmin } from '../db/client';

export async function createDefaultFollowUpSequences(tenantId: string, industry: string) {
  try {
    const { data: existing } = await supabaseAdmin
      .from('follow_up_sequences')
      .select('id')
      .eq('tenant_id', tenantId)
      .limit(1);

    if (existing && existing.length > 0) return;

    const templates = getFollowUpTemplates(industry);
    const inserts = templates.map(t => ({ tenant_id: tenantId, industry, ...t }));
    await supabaseAdmin.from('follow_up_sequences').insert(inserts);
    console.log(`[Onboarding] Created ${inserts.length} follow-up sequences for tenant ${tenantId}`);
  } catch (error) {
    console.error('[Onboarding] Failed to create follow-up sequences:', error);
  }
}

function getFollowUpTemplates(industry: string) {
  if (industry === 'real-estate') {
    return [
      {
        sequence_name: 'Warm Lead Nurture',
        target_temperature: 'warm' as const,
        day_3_message: "Hi {{name}}! Still looking for that {{service_interest}}? I've got new options that might be perfect for you. Want me to share details?",
        day_7_message: "Hey {{name}}! New properties just came on the market in your preferred area within your budget range. The market moves fast. Shall I send you the top picks?",
        day_21_message: "Hi {{name}}, hope you're doing well! If you're still exploring the property market, I'm here to help anytime. No rush — just let me know when you're ready.",
      },
      {
        sequence_name: 'Cold Lead Reactivation',
        target_temperature: 'cold' as const,
        day_3_message: "Hi there! We noticed you were looking at properties recently. The market has exciting new listings. Would you like a quick update?",
        day_7_message: "Hey! We've got great new options that just came on the market. Would you like me to send a few that might interest you?",
        day_21_message: "Hi! Just a reminder that we're here whenever you're ready to explore properties. Drop us a message anytime — happy to help!",
      },
    ];
  }
  return [
    {
      sequence_name: 'Warm Lead Nurture',
      target_temperature: 'warm' as const,
      day_3_message: "Hi {{name}}! Just checking in about our recent conversation. Still interested? I'd love to help you find the right solution.",
      day_7_message: "Hey {{name}}! We have some new offerings that might interest you. Would you like me to share the details?",
      day_21_message: "Hi {{name}}, hope all is well! We're here whenever you need us. Feel free to reach out anytime.",
    },
    {
      sequence_name: 'Cold Lead Reactivation',
      target_temperature: 'cold' as const,
      day_3_message: "Hi! We noticed you reached out recently. Is there anything we can help you with?",
      day_7_message: "Hey there! Just wanted to check if you had any questions. We're happy to help!",
      day_21_message: "Hi! Friendly reminder that we're here whenever you need us. Don't hesitate to reach out!",
    },
  ];
}
