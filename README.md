# Ecomm Sniffer

Private ecommerce intelligence dashboard for Amazon, Walmart, and Shopify sellers. Aggregates posts from Reddit, X/Twitter, Google Alerts, RSS feeds, and forums — then uses Claude to generate daily seller-focused intelligence briefings.

## Quick Start

### 1. Supabase Setup
- Create a new project at [supabase.com](https://supabase.com)
- Go to SQL Editor and run `supabase/migrations/001_initial_schema.sql`
- Copy your project URL and anon key from Settings > API

### 2. Frontend (Vercel)
```bash
cd apps/web
cp .env.local.example .env.local
# Fill in your Supabase URL and anon key
npm install
npm run dev
```

### 3. Workers (Railway)
```bash
cd workers
cp ../.env.example .env
# Fill in ALL keys
npm install
npm run dev
```

### 4. Deploy
- **Frontend:** Push to GitHub, connect to Vercel, set env vars
- **Workers:** Push to GitHub, connect to Railway, set env vars, deploy with Dockerfile

## Architecture
See `DEVELOPMENT_PLAN.md` for full architecture, cost estimates, and risk analysis.
