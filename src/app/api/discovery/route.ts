import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, agency } = body;

    if (!name || !email || !phone) {
      return NextResponse.json(
        { error: 'Name, email, and phone are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('discovery_leads')
      .insert({
        name,
        email: email.toLowerCase(),
        phone,
        agency: agency || null,
        source: 'realestate_page',
        status: 'new',
      })
      .select()
      .single();

    if (error) {
      console.error('[Discovery] Insert error:', error);
      return NextResponse.json({ error: 'Failed to save lead' }, { status: 500 });
    }

    console.log('[Discovery] New lead captured:', data.id, email);

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error('[Discovery] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
