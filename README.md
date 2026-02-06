# SalesConcierge AI - WhatsApp Sales Concierge SaaS

A multi-tenant SaaS platform that provides AI-powered WhatsApp sales agents for SMEs.

## Features

- 🤖 AI-powered WhatsApp lead qualification
- 📅 Automated appointment booking via Calendly
- 🏢 Multi-tenant architecture
- 💬 Built-in CRM with conversation history
- 🌍 Multi-language support (English/Arabic)
- 👥 Human handoff mechanism
- 📊 Analytics dashboard

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes
- **Database**: Supabase (PostgreSQL)
- **Authentication**: NextAuth.js
- **AI**: Claude/GPT API
- **WhatsApp**: Twilio (client-owned accounts)
- **Queue**: Upstash Redis
- **Hosting**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Supabase account
- Twilio account (for clients)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

4. Fill in your environment variables in `.env.local`

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Environment Variables

See `.env.example` for all required environment variables.

## Project Structure

```
src/
├── app/                 # Next.js app router pages
│   ├── auth/           # Authentication pages
│   ├── dashboard/      # Protected dashboard
│   └── api/            # API routes
├── lib/                # Utility libraries
│   ├── auth.ts         # NextAuth configuration
│   └── env.ts          # Environment validation
├── types/              # TypeScript type definitions
└── middleware.ts       # Route protection middleware
```

## Database Setup

1. Create a new Supabase project
2. Run the database schema:
   ```bash
   # Copy the schema from src/lib/db/schema.sql
   # Paste it in the Supabase SQL editor and run it
   ```
   
   Or use the migration script:
   ```bash
   npm run db:migrate
   ```

3. Seed initial data:
   ```bash
   npm run db:seed
   ```

4. (Optional) Create a test tenant:
   ```bash
   npm run db:test-tenant
   ```
   This creates:
   - Email: test@example.com
   - Password: password123

## Database Schema

The application uses the following main tables:

- `tenants` - Multi-tenant organizations
- `users` - User accounts with roles
- `conversations` - WhatsApp message threads
- `leads` - Qualified prospects
- `appointments` - Booked meetings

## Authentication

Uses NextAuth.js with credentials provider. Passwords are hashed with bcrypt.

## Deployment

Deploy to Vercel for best results. Ensure all environment variables are set in production.

## License

MIT
