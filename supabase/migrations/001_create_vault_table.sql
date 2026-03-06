-- Env Butler vault table for encrypted .env blob storage.
-- Run this migration in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS vault (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_slug   TEXT NOT NULL UNIQUE,
  encrypted_blob TEXT NOT NULL,
  plaintext_hash TEXT NOT NULL,
  metadata       JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE vault ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon key (single-user / team with shared key)
-- Tighten this policy if adding multi-user support
CREATE POLICY "allow_all_for_anon" ON vault
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vault_updated_at
  BEFORE UPDATE ON vault
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
