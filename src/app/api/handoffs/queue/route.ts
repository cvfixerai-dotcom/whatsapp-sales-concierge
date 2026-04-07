import { NextRequest, NextResponse } from 'next/server';


import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

const PERIOD_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const getSeverity = (triggers: string[] = [], escalated: boolean) => {
  if (escalated) return 'high';
  if (!triggers.length) return 'low';
  const highSeverityTriggers = ['high_value_lead', 'keyword_match', 'negative_sentiment', 'urgent_timeline'];
  return triggers.some((trigger) => highSeverityTriggers.includes(trigger)) ? 'high' : 'medium';
};

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';
    const days = PERIOD_DAYS[period] ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select(`
        id,
        status,
        created_at,
        handoff_reason,
        handoff_requested_at,
        handoff_claimed_at,
        handoff_claimed_by,
        handoff_resolved_at,
        handoff_triggers,
        handoff_escalated,
        contacts(name, whatsapp_number, email),
        claimed_user:users!handoff_claimed_by(full_name, email)
      `)
      .eq('tenant_id', sessionUser.tenantId)
      .not('handoff_requested_at', 'is', null)
      .gte('handoff_requested_at', since)
      .order('handoff_requested_at', { ascending: false });

    if (error) {
      console.error('[Handoffs Queue] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch handoffs' }, { status: 500 });
    }

    const handoffs = (data || []).map((handoff) => {
      const requestedAt = handoff.handoff_requested_at || handoff.created_at;
      const claimedAt = handoff.handoff_claimed_at;
      const resolvedAt = handoff.handoff_resolved_at;
      const responseTimeMinutes = claimedAt && requestedAt
        ? Math.round((new Date(claimedAt).getTime() - new Date(requestedAt).getTime()) / 60000)
        : null;
      const isResolved = Boolean(resolvedAt) || ['resolved', 'closed'].includes(handoff.status);
      const isInProgress = !isResolved && (
        ['human-handling', 'human-handled'].includes(handoff.status) || Boolean(claimedAt)
      );

      return {
        id: handoff.id,
        conversation_id: handoff.id,
// @ts-ignore
        contact_name: handoff.contacts?.name || 'Unknown',
// @ts-ignore
        contact_phone: handoff.contacts?.whatsapp_number || '',
// @ts-ignore
        contact_email: handoff.contacts?.email || '',
        reason: handoff.handoff_reason || 'Handoff requested',
        severity: getSeverity(handoff.handoff_triggers || [], handoff.handoff_escalated),
        status: isResolved ? 'resolved' : isInProgress ? 'in-progress' : 'pending',
        triggers: handoff.handoff_triggers || [],
        requested_at: requestedAt,
        claimed_at: claimedAt,
        claimed_by: handoff.handoff_claimed_by,
// @ts-ignore
        claimed_by_name: handoff.claimed_user?.full_name || handoff.claimed_user?.email || null,
        resolved_at: resolvedAt,
        escalated: handoff.handoff_escalated || false,
        response_time_minutes: responseTimeMinutes,
      };
    });

    const stats = {
      total: handoffs.length,
      pending: handoffs.filter((handoff) => handoff.status === 'pending').length,
      inProgress: handoffs.filter((handoff) => handoff.status === 'in-progress').length,
      resolved: handoffs.filter((handoff) => handoff.status === 'resolved').length,
      avgResponseTime: calculateAvgResponseTime(handoffs),
      escalatedCount: handoffs.filter((handoff) => handoff.escalated).length,
    };

    return NextResponse.json({
      period,
      since,
      stats,
      handoffs,
    });
  } catch (error) {
    console.error('[Handoffs Queue] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch handoffs' }, { status: 500 });
  }
}

function calculateAvgResponseTime(handoffs: Array<{ response_time_minutes: number | null }>) {
  const values = handoffs
    .map((handoff) => handoff.response_time_minutes)
    .filter((value) => typeof value === 'number') as number[];

  if (!values.length) return 0;

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}
