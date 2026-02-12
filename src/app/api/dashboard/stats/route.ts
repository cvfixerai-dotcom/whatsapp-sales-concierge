// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const tenantId = session.user.tenantId;

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

    // Get last message for each recent conversation
    const recentConversations = [];
    for (const conv of recentConvos.data || []) {
      const { data: msgs } = await supabaseAdmin
        .from('messages')
        .select('content')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1);

      recentConversations.push({
        id: conv.id,
        contact_name: conv.contacts?.name || 'Unknown',
        last_message: msgs?.[0]?.content || 'No messages',
        temperature: conv.contacts?.temperature || 'new',
        created_at: conv.created_at,
      });
    }

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
