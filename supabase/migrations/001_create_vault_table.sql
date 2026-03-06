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

-- Restrict access: only requests with a valid vault_secret header can read/write.
-- Set your secret in Supabase Dashboard > Settings > API > Custom Claims,
-- or pass it as a custom header validated here.
--
-- To use: set a Supabase Vault secret via SQL:
--   INSERT INTO vault_access (secret_hash) VALUES (encode(digest('your-secret', 'sha256'), 'hex'));
--
-- For simplicity (self-hosted single-user), we use service_role key instead of anon key.
-- The service_role key bypasses RLS entirely, so we deny all access for anon role.
-- This means only requests authenticated with the service_role key can access vault data.
CREATE POLICY "deny_anon_access" ON vault
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- If using authenticated users (future multi-user), add per-user policy:
-- CREATE POLICY "user_owns_vault" ON vault
--   FOR ALL
--   TO authenticated
--   USING (auth.uid() = owner_id)
--   WITH CHECK (auth.uid() = owner_id);

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
