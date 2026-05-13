import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/db/client';
import { headers } from 'next/headers';
import DashboardShell from './DashboardShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // 1. Auth check
  // Next.js 15: headers() is async and must be awaited
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '';
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/auth/login');

  const { tenantId } = sessionUser;

  // 2. Fetch tenant
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('setup_completed, subscription_status, trial_end_date, trial_conversation_limit, monthly_conversation_limit, subscription_tier, trial_start_date')
    .eq('id', tenantId)
    .single();

  if (tenant) {
    // Guard A: setup not completed → onboarding
    if (!tenant.setup_completed) redirect('/onboarding');

    // Guard B: trial checks
    if (tenant.subscription_status === 'trial') {
      const now = new Date();

      // B1: trial expired by date
      if (tenant.trial_end_date && new Date(tenant.trial_end_date) < now) {
        await supabaseAdmin.from('tenants').update({ subscription_status: 'past_due' }).eq('id', tenantId);
        redirect('/dashboard/billing?reason=trial_expired');
      }

      // B2: trial conversation limit reached
      const trialLimit = tenant.trial_conversation_limit || 25;
      // Use trial_start_date as lower bound; fallback to 30 days ago (never epoch)
      const trialStart = tenant.trial_start_date
        ? new Date(tenant.trial_start_date).toISOString()
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count: trialUsed } = await supabaseAdmin
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', trialStart);

      if ((trialUsed || 0) >= trialLimit) {
        await supabaseAdmin.from('tenants').update({ subscription_status: 'past_due' }).eq('id', tenantId);
        redirect('/dashboard/billing?reason=trial_limit');
      }
    }

    // Guard C: past_due → billing
    const isBillingPage = pathname.includes('/billing');
    if (tenant.subscription_status === 'past_due' && !isBillingPage) redirect('/dashboard/billing');
  }

  // Compute trial countdown for banner
  let trialInfo: { status: string; daysRemaining: number | null; trialLimit: number | null; usedCount: number } | null = null;
  if (tenant?.subscription_status === 'trial' && tenant.trial_end_date) {
    const msRemaining = new Date(tenant.trial_end_date).getTime() - Date.now();
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
    trialInfo = { status: 'trial', daysRemaining, trialLimit: tenant.trial_conversation_limit || 25, usedCount: 0 };
  }

  return <DashboardShell trialInfo={trialInfo}>{children}</DashboardShell>;
}
