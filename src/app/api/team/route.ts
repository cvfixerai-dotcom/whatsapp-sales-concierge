// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db/client';
import bcrypt from 'bcryptjs';

export async function GET() {
  const s = await getServerSession(authOptions);
  if (!s?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data } = await supabaseAdmin.from('users')
    .select('id,email,full_name,role,is_active,last_login_at,created_at')
    .eq('tenant_id', s.user.tenantId).order('created_at');
  return NextResponse.json({ members: data || [] });
}

export async function POST(req: NextRequest) {
  const s = await getServerSession(authOptions);
  if (!s?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (s.user.role !== 'admin' && s.user.role !== 'owner')
    return NextResponse.json({ error: 'Only admins can invite' }, { status: 403 });

  const { email, full_name, invited_role } = await req.json();
  if (!email || !invited_role) return NextResponse.json({ error: 'Email and role required' }, { status: 400 });
  if (!['admin','agent','viewer'].includes(invited_role))
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

  const { data: ex } = await supabaseAdmin.from('users').select('id').eq('email', email.toLowerCase()).single();
  if (ex) return NextResponse.json({ error: 'User already exists' }, { status: 409 });

  const tempPass = Math.random().toString(36).slice(-10);
  const hash = await bcrypt.hash(tempPass, 10);

  const { error } = await supabaseAdmin.from('users').insert({
    tenant_id: s.user.tenantId, email: email.toLowerCase(),
    full_name: full_name || '', password_hash: hash, role: invited_role,
  });
  if (error) return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  return NextResponse.json({ success: true, temp_password: tempPass });
}

export async function DELETE(req: NextRequest) {
  const s = await getServerSession(authOptions);
  if (!s?.user?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (s.user.role !== 'admin' && s.user.role !== 'owner')
    return NextResponse.json({ error: 'Only admins can remove' }, { status: 403 });

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (userId === s.user.id) return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });

  await supabaseAdmin.from('users').delete().eq('id', userId).eq('tenant_id', s.user.tenantId);
  return NextResponse.json({ success: true });
}
