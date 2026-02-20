// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';

/**
 * POST /api/conversations/repair
 * Repairs DB state: sets is_active=true on all non-closed conversations.
 * This fixes conversations created without is_active that the webhook was skipping.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const tenantId = session.user.tenantId;

    const { error, count } = await supabaseAdmin
      .from('conversations')
      .update({ is_active: true })
      .eq('tenant_id', tenantId)
      .neq('status', 'closed')
      .is('is_active', null); // only update ones that are NULL (not already set)

    if (error) throw error;

    // Also repair false ones that shouldn't be false
    const { error: e2, count: count2 } = await supabaseAdmin
      .from('conversations')
      .update({ is_active: true })
      .eq('tenant_id', tenantId)
      .neq('status', 'closed')
      .eq('is_active', false);

    if (e2) console.error('[Repair] error fixing is_active=false:', e2);

    return NextResponse.json({
      success: true,
      repaired_null: count ?? 0,
      repaired_false: count2 ?? 0,
    });
  } catch (error) {
    console.error('[Repair] Error:', error);
    return NextResponse.json({ error: 'Repair failed' }, { status: 500 });
  }
}
