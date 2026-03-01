-- GHL Sales Ops Dashboard Supabase Schema

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'pending' CHECK (role IN ('admin', 'manager', 'closer', 'viewer', 'pending')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GHL Connections (OAuth)
CREATE TABLE IF NOT EXISTS ghl_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GHL Users (Closers)
CREATE TABLE IF NOT EXISTS ghl_users (
  id TEXT PRIMARY KEY, -- GHL User ID
  location_id TEXT NOT NULL,
  name TEXT,
  email TEXT,
  role TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pipelines
CREATE TABLE IF NOT EXISTS pipelines (
  id TEXT PRIMARY KEY, -- GHL Pipeline ID
  location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pipeline Stages
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id TEXT PRIMARY KEY, -- GHL Stage ID
  pipeline_id TEXT REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER,
  weight NUMERIC DEFAULT 0.5, -- 0..1 for weighted forecast
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY, -- GHL Contact ID
  location_id TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  tags TEXT[],
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  custom_fields JSONB,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Opportunities
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY, -- GHL Opportunity ID
  location_id TEXT NOT NULL,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  pipeline_id TEXT REFERENCES pipelines(id) ON DELETE SET NULL,
  stage_id TEXT REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  owner_user_id TEXT REFERENCES ghl_users(id) ON DELETE SET NULL,
  name TEXT,
  status TEXT CHECK (status IN ('open', 'won', 'lost', 'abandoned')),
  value NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  custom_fields JSONB,
  raw JSONB,
  ghl_created_at TIMESTAMPTZ,
  ghl_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Opportunity Events (History)
CREATE TABLE IF NOT EXISTS opportunity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id TEXT REFERENCES opportunities(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'stage_change', 'owner_change', 'status_change', 'value_change'
  from_value TEXT,
  to_value TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activities (Generic)
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY, -- GHL Activity ID
  location_id TEXT NOT NULL,
  contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES ghl_users(id) ON DELETE SET NULL,
  type TEXT, -- 'call', 'sms', 'email', 'note', 'task', 'appointment'
  title TEXT,
  description TEXT,
  status TEXT,
  raw JSONB,
  activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook Events (Deduplication)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key TEXT UNIQUE NOT NULL,
  location_id TEXT,
  payload JSONB,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Targets
CREATE TABLE IF NOT EXISTS targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id TEXT NOT NULL,
  user_id TEXT REFERENCES ghl_users(id) ON DELETE SET NULL, -- NULL for global target
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  revenue_target NUMERIC DEFAULT 0,
  opportunities_target INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies (Admin only for now)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name', 'pending');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "Admins can do everything" ON profiles FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);

-- Enable RLS on all tables
ALTER TABLE ghl_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ghl_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;

-- Simple Admin Policy for all (can be refined later)
CREATE POLICY "Admin access" ON ghl_connections FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin access" ON ghl_users FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin access" ON pipelines FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin access" ON pipeline_stages FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin access" ON contacts FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin access" ON opportunities FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin access" ON opportunity_events FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin access" ON activities FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin access" ON webhook_events FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin access" ON targets FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_opp_location ON opportunities(location_id);
CREATE INDEX IF NOT EXISTS idx_opp_owner ON opportunities(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_opp_pipeline ON opportunities(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_opp_stage ON opportunities(stage_id);
CREATE INDEX IF NOT EXISTS idx_opp_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opp_created ON opportunities(ghl_created_at);
CREATE INDEX IF NOT EXISTS idx_activity_contact ON activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activities(type);
CREATE INDEX IF NOT EXISTS idx_webhook_dedupe ON webhook_events(dedupe_key);
