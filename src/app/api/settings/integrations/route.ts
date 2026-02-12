// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';

export async function GET() {
  const s = await getServerSession(authOptions);
  if (!s?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data } = await supabaseAdmin.from('tenants').select('crm_webhook_url').eq('id', s.user.tenantId).single();
  return NextResponse.json({ crm_webhook_url: data?.crm_webhook_url || '' });
}

export async function POST(req: NextRequest) {
  const s = await getServerSession(authOptions);
  if (!s?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { crm_webhook_url } = await req.json();
  if (crm_webhook_url && !crm_webhook_url.startsWith('http')) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from('tenants')
    .update({ crm_webhook_url: crm_webhook_url || null, updated_at: new Date().toISOString() })
    .eq('id', s.user.tenantId);
  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  return NextResponse.json({ success: true });
}
