import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // Get user from database
          const { data: user, error } = await supabase
            .from('users')
            .select(`
              *,
              tenants(id, company_name, subscription_tier, subscription_status)
            `)
            .eq('email', credentials.email.toLowerCase())
            .single();

          if (error || !user) {
            console.error('Auth error: User not found', error);
            return null;
          }

          // Verify password
          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password_hash
          );

          if (!isPasswordValid) {
            console.error('Auth error: Invalid password');
            return null;
          }

          // Check if user's tenant is active
          if (!user.tenants || user.tenants.subscription_status === 'cancelled') {
            console.error('Auth error: Tenant not active');
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.full_name,
            tenantId: user.tenant_id,
            role: user.role || 'agent',
          };
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = user.tenantId;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!;
        session.user.tenantId = token.tenantId;
        session.user.role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  secret: env.NEXTAUTH_SECRET,
};
