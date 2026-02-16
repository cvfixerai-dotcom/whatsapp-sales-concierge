import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '@/lib/services/rate-limiter';

// Vercel CRONs send GET requests
export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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
