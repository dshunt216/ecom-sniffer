-- ============================================================
-- Ecomm Sniffer — Initial Schema Migration
-- Run via: Supabase Dashboard > SQL Editor > paste and run
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------

-- Sources: platforms and feeds we pull data from
CREATE TABLE public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('reddit', 'twitter', 'rss', 'scraper')),
  config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Posts: every item pulled from every source
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  external_id TEXT,
  title TEXT,
  body TEXT,
  author TEXT,
  url TEXT,
  normalized_url TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  matched_keywords TEXT[] DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  UNIQUE(source_id, external_id)
);

-- Keywords: terms and hashtags to watch across all sources
CREATE TABLE public.keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily Briefings: Claude's intelligence output
CREATE TABLE public.briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  hero_topic TEXT,
  hero_summary TEXT,
  hero_post_count INT,
  hero_confidence NUMERIC(3,2),
  insights JSONB NOT NULL DEFAULT '[]',
  raw_cluster_data JSONB,
  model_used TEXT,
  tokens_used INT,
  schema_version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User profiles (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  role TEXT DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Worker health log (for monitoring)
CREATE TABLE public.worker_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  posts_fetched INT DEFAULT 0,
  error_message TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. INDEXES (critical for feed performance)
-- ------------------------------------------------------------

CREATE INDEX idx_posts_fetched_at ON public.posts(fetched_at DESC);
CREATE INDEX idx_posts_source_id ON public.posts(source_id);
CREATE INDEX idx_posts_keywords ON public.posts USING GIN(matched_keywords);
CREATE INDEX idx_posts_normalized_url ON public.posts(normalized_url) WHERE normalized_url IS NOT NULL;
CREATE INDEX idx_posts_not_deleted ON public.posts(fetched_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_briefings_date ON public.briefings(date DESC);
CREATE INDEX idx_worker_logs_created ON public.worker_logs(created_at DESC);
CREATE INDEX idx_worker_logs_worker ON public.worker_logs(worker_name, created_at DESC);

-- ------------------------------------------------------------
-- 3. ROW LEVEL SECURITY POLICIES
-- ------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_logs ENABLE ROW LEVEL SECURITY;

-- SOURCES: all authenticated users can read, only admins can write
CREATE POLICY "Anyone can read sources"
  ON public.sources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert sources"
  ON public.sources FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update sources"
  ON public.sources FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete sources"
  ON public.sources FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- POSTS: all authenticated users can read (non-deleted only)
CREATE POLICY "Anyone can read non-deleted posts"
  ON public.posts FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- KEYWORDS: all authenticated can read, admins can write
CREATE POLICY "Anyone can read keywords"
  ON public.keywords FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert keywords"
  ON public.keywords FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete keywords"
  ON public.keywords FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- BRIEFINGS: all authenticated can read
CREATE POLICY "Anyone can read briefings"
  ON public.briefings FOR SELECT
  TO authenticated
  USING (true);

-- PROFILES: users can read all, update only their own
CREATE POLICY "Anyone can read profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- WORKER LOGS: all authenticated can read
CREATE POLICY "Anyone can read worker logs"
  ON public.worker_logs FOR SELECT
  TO authenticated
  USING (true);

-- ------------------------------------------------------------
-- 4. AUTO-CREATE PROFILE ON SIGNUP
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    -- First user is admin, everyone after is viewer
    CASE
      WHEN (SELECT count(*) FROM public.profiles) = 0 THEN 'admin'
      ELSE 'viewer'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- 5. SEED DATA: Default sources and keywords
-- ------------------------------------------------------------

INSERT INTO public.sources (name, type, config) VALUES
  ('Reddit r/FulfillmentByAmazon', 'reddit', '{"subreddit": "FulfillmentByAmazon"}'),
  ('Reddit r/AmazonSeller', 'reddit', '{"subreddit": "AmazonSeller"}'),
  ('Reddit r/shopify', 'reddit', '{"subreddit": "shopify"}'),
  ('Reddit r/WalmartSellers', 'reddit', '{"subreddit": "WalmartSellers"}'),
  ('Reddit r/ecommerce', 'reddit', '{"subreddit": "ecommerce"}'),
  ('EcommerceBytes', 'rss', '{"url": "https://www.ecommercebytes.com/feed/"}'),
  ('Marketplace Pulse', 'rss', '{"url": "https://www.marketplacepulse.com/feed"}');

INSERT INTO public.keywords (term) VALUES
  ('FBA fee'),
  ('Amazon policy'),
  ('seller account suspended'),
  ('Walmart marketplace'),
  ('Shopify fee'),
  ('supply chain'),
  ('tariff'),
  ('Buy Box'),
  ('listing removed'),
  ('account health'),
  ('inventory limits'),
  ('return policy change');
