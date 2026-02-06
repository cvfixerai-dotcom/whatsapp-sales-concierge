import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rateLimiter } from '@/lib/services/rate-limiter';

export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const tenantId = session.user.tenantId as string;
    const { searchParams } = new URL(request.url);
    const phoneNumber = searchParams.get('phone');

    // Get overall usage stats for tenant
    const usageStats = await rateLimiter.getUsageStats(tenantId);

    // If phone number provided, check specific rate limit
    let specificCheck = null;
    if (phoneNumber) {
      specificCheck = await rateLimiter.checkRateLimit(tenantId, phoneNumber, {
        bypassCache: true, // Get fresh data
      });
    }

    return NextResponse.json({
      tenantId,
      usage: {
        perSecond: {
          used: usageStats.perSecond.used,
          limit: usageStats.perSecond.limit,
          remaining: usageStats.perSecond.remaining,
          percentage: Math.round((usageStats.perSecond.used / usageStats.perSecond.limit) * 100),
        },
        daily: {
          used: usageStats.daily.used,
          limit: usageStats.daily.limit,
          remaining: usageStats.daily.remaining,
          percentage: Math.round((usageStats.daily.used / usageStats.daily.limit) * 100),
        },
        monthly: {
          used: usageStats.monthly.used,
          limit: usageStats.monthly.limit,
          remaining: usageStats.monthly.remaining,
          percentage: Math.round((usageStats.monthly.used / usageStats.monthly.limit) * 100),
        },
      },
      specific: specificCheck ? {
        phoneNumber,
        allowed: specificCheck.allowed,
        retryAfter: specificCheck.retryAfter,
        limitType: specificCheck.limitType,
      } : undefined,
    });
  } catch (error) {
    console.error('Error checking rate limit status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Reset rate limits (admin only)
export async function DELETE(request: NextRequest) {
  try {
    // Verify user is authenticated and is admin/owner
    const session = await getServerSession(authOptions);
    if (!session?.user?.tenantId || !['owner', 'admin'].includes(session.user.role as string)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const tenantId = session.user.tenantId as string;
    
    // Reset rate limits for tenant
    await rateLimiter.resetRateLimits(tenantId);

    return NextResponse.json({
      success: true,
      message: 'Rate limits reset successfully',
    });
  } catch (error) {
    console.error('Error resetting rate limits:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
