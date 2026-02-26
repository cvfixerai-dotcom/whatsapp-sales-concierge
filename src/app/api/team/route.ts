// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db/client';
import { getSessionUser } from '@/lib/supabase-server';

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { tenantId } = sessionUser;
  const { data } = await supabaseAdmin.from('users')
    .select('id,email,full_name,role,is_active,last_login_at,created_at')
    .eq('tenant_id', tenantId).order('created_at');
  return NextResponse.json({ members: data || [] });
}

export async function POST(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { tenantId, userId } = sessionUser;

  const { data: requester } = await supabaseAdmin.from('users').select('role').eq('id', userId).single();
  if (!requester || !['admin','owner'].includes(requester.role))
    return NextResponse.json({ error: 'Only admins can invite' }, { status: 403 });

  const { email, full_name, invited_role } = await req.json();
  if (!email || !invited_role) return NextResponse.json({ error: 'Email and role required' }, { status: 400 });
  if (!['admin','agent','viewer'].includes(invited_role))
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

  const { data: ex } = await supabaseAdmin.from('users').select('id').eq('email', email.toLowerCase()).maybeSingle();
  if (ex) return NextResponse.json({ error: 'User already exists' }, { status: 409 });

  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email.toLowerCase(), {
    data: { full_name: full_name || '', tenant_id: tenantId, role: invited_role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://concierge.fixeraitech.com'}/auth/callback`,
  });

  if (inviteError || !inviteData?.user)
    return NextResponse.json({ error: inviteError?.message ?? 'Failed to invite user' }, { status: 500 });

  const { error } = await supabaseAdmin.from('users').insert({
    id: inviteData.user.id,
    tenant_id: tenantId,
    email: email.toLowerCase(),
    full_name: full_name || '',
    password_hash: '',
    role: invited_role,
    is_active: true,
  });
  if (error) return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 });
  return NextResponse.json({ success: true, message: 'Invitation sent' });
}

export async function DELETE(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { tenantId, userId } = sessionUser;

  const { data: requester } = await supabaseAdmin.from('users').select('role').eq('id', userId).single();
  if (!requester || !['admin','owner'].includes(requester.role))
    return NextResponse.json({ error: 'Only admins can remove' }, { status: 403 });

  const { userId: targetId } = await req.json();
  if (!targetId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (targetId === userId) return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });

  await supabaseAdmin.from('users').delete().eq('id', targetId).eq('tenant_id', tenantId);
  await supabaseAdmin.auth.admin.deleteUser(targetId);
  return NextResponse.json({ success: true });
}
