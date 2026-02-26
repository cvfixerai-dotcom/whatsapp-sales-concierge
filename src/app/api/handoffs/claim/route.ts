import { NextRequest, NextResponse } from 'next/server';
import { claimHandoff } from '@/lib/handoff/notifier';
import { getSessionUser } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    
    if (!sessionUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId, agentId } = await request.json();

    if (!conversationId || !agentId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify agent can claim this handoff
    if (agentId !== sessionUser.userId) {
      return NextResponse.json(
        { error: 'Cannot claim handoff for another agent' },
        { status: 403 }
      );
    }

    const result = await claimHandoff(conversationId, agentId);

    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error claiming handoff:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
