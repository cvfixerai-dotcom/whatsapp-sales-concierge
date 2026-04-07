/**
 * Handoffs API
 * GET - List pending handoffs for tenant
 * POST - Acknowledge or resolve a handoff
 */

import { NextRequest, NextResponse } from 'next/server';
import { handoffService } from '@/lib/services/handoff';
import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

/**
 * GET /api/handoffs
 * Get pending handoffs for the tenant
 */
export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const handoffs = await handoffService.getPendingHandoffs(sessionUser.tenantId);

    return NextResponse.json({
      handoffs,
      count: handoffs.length,
    });
  } catch (error) {
    console.error('[Handoffs API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch handoffs' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/handoffs
 * Acknowledge or resolve a handoff
 */
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, handoffId, conversationId } = body;

    if (!handoffId) {
      return NextResponse.json(
        { error: 'handoffId is required' },
        { status: 400 }
      );
    }

    let success = false;

    switch (action) {
      case 'acknowledge':
        success = await handoffService.acknowledgeHandoff(handoffId, sessionUser.userId);
        break;
      
      case 'resolve':
        if (!conversationId) {
          return NextResponse.json(
            { error: 'conversationId is required for resolve action' },
            { status: 400 }
          );
        }
        success = await handoffService.resolveHandoff(handoffId, conversationId);
        break;
      
      default:
        return NextResponse.json(
          { error: 'Invalid action. Use "acknowledge" or "resolve"' },
          { status: 400 }
        );
    }

    if (!success) {
      return NextResponse.json(
        { error: `Failed to ${action} handoff` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error('[Handoffs API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process handoff action' },
      { status: 500 }
    );
  }
}
