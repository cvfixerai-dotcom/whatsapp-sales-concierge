// Simple env helper - validates at runtime only when accessed
export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || '3000',
  
  // Database
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Supabase Edge Function (process-message) — runs the inbound AI pipeline.
  // EDGE_FUNCTION_SECRET is a PAIRED secret: it must exactly match the value
  // set on the deployed function (`supabase secrets set EDGE_FUNCTION_SECRET=...`).
  // If they drift the function returns 401 and no replies are sent.
  SUPABASE_EDGE_FUNCTION_URL: process.env.SUPABASE_EDGE_FUNCTION_URL || '',
  EDGE_FUNCTION_SECRET: process.env.EDGE_FUNCTION_SECRET || '',
  
  // NextAuth
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || '',
  
  // AI Providers
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  
  // Twilio
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_WEBHOOK_URL: process.env.TWILIO_WEBHOOK_URL || '',
  
  // Upstash Redis
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || '',
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  
  // Resend
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || '',

  // Logging
  LOG_WEBHOOK_URL: process.env.LOG_WEBHOOK_URL || '',
  
  // Calendly
  CALENDLY_API_KEY: process.env.CALENDLY_API_KEY || '',
  CALENDLY_WEBHOOK_SECRET: process.env.CALENDLY_WEBHOOK_SECRET || '',
  
  // Google Calendar
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  
  // Paystack
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || '',
  PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY || '',
  
  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  
  // App
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000',
};

export type Env = typeof env;
