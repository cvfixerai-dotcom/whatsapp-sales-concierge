import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '@/lib/services/rate-limiter';

// This endpoint should be called by a cron job daily
export async function POST(request: NextRequest) {
  try {
    // Verify the request is from a cron job (using a secret)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Clean up old rate limit records
    await rateLimiter.cleanupOldRecords();

    return NextResponse.json({
      success: true,
      message: 'Rate limit cleanup completed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error during rate limit cleanup:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'This endpoint cleans up old rate limit records. Call with POST using cron secret.',
    usage: 'POST /api/cleanup/rate-limits with Authorization: Bearer CRON_SECRET',
  });
}
