// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';


import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

const PERIOD_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const QUALIFIED_STATUSES = ['qualified', 'contacted', 'converted'];

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
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

    const [conversationsRes, leadsRes, appointmentsRes] = await Promise.all([
      supabaseAdmin
        .from('conversations')
        .select('id, created_at, status, contact_id')
        .eq('tenant_id', sessionUser.tenantId)
        .gte('created_at', since),
      supabaseAdmin
        .from('contacts')
        .select('id, temperature, qualification_status, created_at, lead_score')
        .eq('tenant_id', sessionUser.tenantId)
        .gte('created_at', since),
      supabaseAdmin
        .from('appointments')
        .select('id, contact_id, status, created_at')
        .eq('tenant_id', sessionUser.tenantId)
        .gte('created_at', since),
    ]);

    if (conversationsRes.error || leadsRes.error || appointmentsRes.error) {
      console.error('[Analytics] Fetch error:', {
        conversations: conversationsRes.error,
        leads: leadsRes.error,
        appointments: appointmentsRes.error,
      });
      return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }

    const conversations = conversationsRes.data || [];
    const leads = leadsRes.data || [];
    const appointments = appointmentsRes.data || [];

    const totalConversations = conversations.length;
    const totalLeads = leads.length;
    const totalAppointments = appointments.length;
    const qualifiedLeads = leads.filter(lead => QUALIFIED_STATUSES.includes(lead.qualification_status)).length;
    const conversionRate = totalLeads > 0 ? Math.round((totalAppointments / totalLeads) * 100) : 0;

    const handoffCount = conversations.filter(conv =>
      ['handoff-requested', 'human-handling', 'human-handled'].includes(conv.status)
    ).length;
    const handoffRate = totalConversations > 0 ? Math.round((handoffCount / totalConversations) * 100) : 0;

    const responseStats = await computeResponseTime(conversations.map(c => c.id), since);

    const trendMap: Record<string, number> = {};
    conversations.forEach(conv => {
      const date = new Date(conv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      trendMap[date] = (trendMap[date] || 0) + 1;
    });

    const temperatureMap: Record<string, number> = {};
    leads.forEach(lead => {
      const temp = lead.temperature || 'new';
      temperatureMap[temp] = (temperatureMap[temp] || 0) + 1;
    });

    const scoreRanges: Record<string, number> = {
      'High (70-100)': 0,
      'Medium (40-69)': 0,
      'Low (0-39)': 0,
    };
    leads.forEach(lead => {
      const score = lead.lead_score || 0;
      if (score >= 70) scoreRanges['High (70-100)']++;
      else if (score >= 40) scoreRanges['Medium (40-69)']++;
      else scoreRanges['Low (0-39)']++;
    });

    const hourlyMap: Record<number, number> = {};
    conversations.forEach(conv => {
      const hour = new Date(conv.created_at).getHours();
      hourlyMap[hour] = (hourlyMap[hour] || 0) + 1;
    });

    const hourlyActivity = Array.from({ length: 24 }, (_, index) => ({
      hour: `${index}:00`,
      conversations: hourlyMap[index] || 0,
    }));

    const leadById = new Map(leads.map(lead => [lead.id, lead]));
    const conversionByTemperatureMap: Record<string, { leads: number; booked: number }> = {};

    leads.forEach(lead => {
      const temp = lead.temperature || 'new';
      if (!conversionByTemperatureMap[temp]) {
        conversionByTemperatureMap[temp] = { leads: 0, booked: 0 };
      }
      conversionByTemperatureMap[temp].leads += 1;
    });

    appointments.forEach(appointment => {
      const lead = appointment.contact_id ? leadById.get(appointment.contact_id) : null;
      if (!lead) return;
      const temp = lead.temperature || 'new';
      if (!conversionByTemperatureMap[temp]) {
        conversionByTemperatureMap[temp] = { leads: 0, booked: 0 };
      }
      conversionByTemperatureMap[temp].booked += 1;
    });

    const conversionByTemperature = Object.entries(conversionByTemperatureMap).map(([temperature, stats]) => ({
      temperature,
      leads: stats.leads,
      booked: stats.booked,
      conversionRate: stats.leads > 0 ? Math.round((stats.booked / stats.leads) * 100) : 0,
    }));

    return NextResponse.json({
      period,
      since,
      stats: {
        totalConversations,
        totalLeads,
        totalAppointments,
        qualifiedLeads,
        conversionRate,
        avgResponseTime: responseStats.avgResponseTime,
        handoffRate,
      },
      funnel: {
        conversations: totalConversations,
        qualified: qualifiedLeads,
        booked: totalAppointments,
      },
      conversationTrend: Object.entries(trendMap).map(([date, count]) => ({ date, conversations: count })),
      temperatureDistribution: Object.entries(temperatureMap).map(([name, value]) => ({ name, value })),
      leadScoreDistribution: Object.entries(scoreRanges).map(([name, value]) => ({ name, value })),
      hourlyActivity,
      conversionByTemperature,
      responseCoverage: responseStats.coverage,
    });
  } catch (error) {
    console.error('[Analytics] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}

async function computeResponseTime(conversationIds: string[], since: string) {
  if (!conversationIds.length) {
    return { avgResponseTime: 0, coverage: 0 };
  }

  const chunks = chunkArray(conversationIds, 200);
  const messages: Array<{ conversation_id: string; direction: string; created_at: string }> = [];

  for (const chunk of chunks) {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('conversation_id, direction, created_at')
      .in('conversation_id', chunk)
      .gte('created_at', since);

    if (error) {
      console.error('[Analytics] Message fetch error:', error);
      continue;
    }

    if (data?.length) {
      messages.push(...data);
    }
  }

  const responseMap = new Map<string, { inbound?: Date; outbound?: Date }>();

  messages.forEach(msg => {
    const entry = responseMap.get(msg.conversation_id) || {};
    const timestamp = new Date(msg.created_at);
    if (msg.direction === 'inbound') {
      if (!entry.inbound || timestamp < entry.inbound) entry.inbound = timestamp;
    } else if (msg.direction === 'outbound') {
      if (!entry.outbound || timestamp < entry.outbound) entry.outbound = timestamp;
    }
    responseMap.set(msg.conversation_id, entry);
  });

  let totalMs = 0;
  let count = 0;
  responseMap.forEach(entry => {
    if (entry.inbound && entry.outbound && entry.outbound >= entry.inbound) {
      totalMs += entry.outbound.getTime() - entry.inbound.getTime();
      count += 1;
    }
  });

  return {
    avgResponseTime: count > 0 ? Math.round(totalMs / count / 60000) : 0,
    coverage: count,
  };
}
