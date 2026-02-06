// @ts-nocheck
/**
 * Handoffs API
 * GET - List pending handoffs for tenant
 * POST - Acknowledge or resolve a handoff
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handoffService } from '@/lib/services/handoff';

/**
 * GET /api/handoffs
 * Get pending handoffs for the tenant
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const handoffs = await handoffService.getPendingHandoffs(session.user.tenantId);

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
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId || !session?.user?.id) {
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
        success = await handoffService.acknowledgeHandoff(handoffId, session.user.id);
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
