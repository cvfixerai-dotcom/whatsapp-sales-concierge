// @ts-nocheck
/**
 * Handoff Settings API
 * GET - Fetch current handoff notification settings
 * POST - Update handoff notification settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { handoffService } from '@/lib/services/handoff';

/**
 * GET /api/settings/handoff
 * Fetch current handoff settings for the tenant
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await handoffService.getHandoffSettings(session.user.tenantId);

    return NextResponse.json(settings);
  } catch (error) {
    console.error('[Handoff Settings API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch handoff settings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/handoff
 * Update handoff settings for the tenant
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    const success = await handoffService.updateHandoffSettings(
      session.user.tenantId,
      body
    );

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update handoff settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Handoff Settings API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to update handoff settings' },
      { status: 500 }
    );
  }
}
