import { NextRequest, NextResponse } from 'next/server';


import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { tenantId } = sessionUser;

    // Fetch all stats in parallel
    const [convResult, leadsResult, appointmentsResult, contactsResult, recentConvos, bookings, handoffs] = await Promise.all([
      supabaseAdmin.from('conversations').select('id, created_at', { count: 'exact' }).eq('tenant_id', tenantId),
      supabaseAdmin.from('contacts').select('id', { count: 'exact' }).eq('tenant_id', tenantId),
      supabaseAdmin.from('appointments').select('id', { count: 'exact' }).eq('tenant_id', tenantId),
      supabaseAdmin.from('contacts').select('temperature').eq('tenant_id', tenantId),
      supabaseAdmin
        .from('conversations')
        .select('id, created_at, contact_id, contacts(name, temperature, whatsapp_number)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseAdmin
        .from('appointments')
        .select('id, scheduled_time, status, contact_id, contacts(name)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseAdmin
        .from('conversations')
        .select('id, handoff_reason, created_at, contact_id, contacts(name)')
        .eq('tenant_id', tenantId)
        .eq('status', 'handoff-requested')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    // Get last message for each recent conversation in a single query instead
    // of one round trip per conversation (was up to 5 sequential queries).
    const recentConvIds = (recentConvos.data || []).map((c: any) => c.id);
    const { data: recentMsgs } = recentConvIds.length
      ? await supabaseAdmin
          .from('messages')
          .select('conversation_id, content, created_at')
          .in('conversation_id', recentConvIds)
          .order('created_at', { ascending: false })
      : { data: [] as any[] };

    const lastMessageByConv: Record<string, string> = {};
    for (const m of recentMsgs || []) {
      if (!(m.conversation_id in lastMessageByConv)) {
        lastMessageByConv[m.conversation_id] = m.content;
      }
    }

    const recentConversations = (recentConvos.data || []).map((conv: any) => ({
      id: conv.id,
      contact_name: conv.contacts?.name || 'Unknown',
      last_message: lastMessageByConv[conv.id] || 'No messages',
      temperature: conv.contacts?.temperature || 'new',
      created_at: conv.created_at,
    }));

    // Temperature distribution
    const tempCounts = (contactsResult.data || []).reduce((acc: any, c: any) => {
      acc[c.temperature || 'new'] = (acc[c.temperature || 'new'] || 0) + 1;
      return acc;
    }, {});
    const temperatureData = Object.entries(tempCounts).map(([name, value]) => ({ name, value }));

    // Conversation volume (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentConvAll } = await supabaseAdmin
      .from('conversations')
      .select('created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at');

    // Group conversations by date
    const conversationData: Record<string, number> = {};
    for (const conv of recentConvAll || []) {
      const date = new Date(conv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      conversationData[date] = (conversationData[date] || 0) + 1;
    }
    const conversationVolumeData = Object.entries(conversationData).map(([date, count]) => ({ date, count }));

    return NextResponse.json({
      kpis: {
        total_conversations: convResult.count || 0,
        active_leads: leadsResult.count || 0,
        booked_appointments: appointmentsResult.count || 0,
        conversion_rate: leadsResult.count ? Math.round(((appointmentsResult.count || 0) / leadsResult.count) * 100) : 0,
      },
      temperatureData,
      conversationVolumeData,
      recentConversations,
      recentBookings: (bookings.data || []).map((b: any) => ({
        id: b.id,
        contact_name: b.contacts?.name || 'Unknown',
        scheduled_time: b.scheduled_time,
        status: b.status,
      })),
      handoffRequests: (handoffs.data || []).map((h: any) => ({
        id: h.id,
        reason: h.handoff_reason,
        created_at: h.created_at,
        contact_name: h.contacts?.name || 'Unknown',
      })),
    });
  } catch (error) {
    console.error('[Dashboard Stats API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
