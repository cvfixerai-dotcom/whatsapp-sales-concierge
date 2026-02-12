// @ts-nocheck
/**
 * AI Configuration Settings API
 * GET - Fetch current AI config
 * POST - Update AI config
 */

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

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('ai_personality, ai_language, ai_greeting, ai_fallback_message, qualification_questions, company_name')
      .eq('id', session.user.tenantId)
      .single();

    if (error || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json({
      ai_personality: tenant.ai_personality || 'professional',
      ai_language: tenant.ai_language || 'en',
      ai_greeting: tenant.ai_greeting || '',
      ai_fallback_message: tenant.ai_fallback_message || '',
      qualification_questions: tenant.qualification_questions || [],
      company_name: tenant.company_name || '',
    });
  } catch (error) {
    console.error('[AI Config] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch AI config' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ai_personality, ai_language, ai_greeting, ai_fallback_message, qualification_questions } = body;

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (ai_personality !== undefined) updates.ai_personality = ai_personality;
    if (ai_language !== undefined) updates.ai_language = ai_language;
    if (ai_greeting !== undefined) updates.ai_greeting = ai_greeting || null;
    if (ai_fallback_message !== undefined) updates.ai_fallback_message = ai_fallback_message || null;
    if (qualification_questions !== undefined) updates.qualification_questions = qualification_questions;

    const { error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', session.user.tenantId);

    if (error) {
      console.error('[AI Config] Update error:', error);
      return NextResponse.json({ error: 'Failed to update AI config' }, { status: 500 });
    }

    console.log(`[AI Config] Updated for tenant ${session.user.tenantId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AI Config] POST error:', error);
    return NextResponse.json({ error: 'Failed to update AI config' }, { status: 500 });
  }
}
