import { NextRequest, NextResponse } from 'next/server';
import { workerManager } from '@/lib/workers';
import { redisQueue } from '@/lib/queue/redis';

// In-memory flag to prevent multiple initializations
let isInitialized = false;

export async function POST(request: NextRequest) {
  try {
    if (isInitialized) {
      return NextResponse.json({
        success: true,
        message: 'Workers already initialized',
        status: workerManager.getStatus(),
      });
    }

    // Initialize workers
    await workerManager.initialize();
    isInitialized = true;

    // Get queue stats
    const queueStats = await redisQueue.getQueueStats();

    return NextResponse.json({
      success: true,
      message: 'Workers initialized successfully',
      status: workerManager.getStatus(),
      queueStats,
    });
  } catch (error) {
    console.error('Error initializing workers:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  const status = workerManager.getStatus();
  const queueStats = await redisQueue.getQueueStats();

  return NextResponse.json({
    initialized: isInitialized,
    status,
    queueStats,
  });
}
