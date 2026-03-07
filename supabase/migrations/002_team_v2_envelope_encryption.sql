-- Team v2: envelope encryption tables + vault format versioning.
-- Run this migration in your Supabase SQL Editor after 001_create_vault_table.sql.

-- Add format version to vault table (1 = legacy password-based, 2 = envelope encryption)
ALTER TABLE vault ADD COLUMN IF NOT EXISTS format_version INTEGER DEFAULT 1;

-- Per-member wrapped vault keys
CREATE TABLE IF NOT EXISTS vault_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_slug       TEXT NOT NULL,
  member_id        TEXT NOT NULL,        -- SHA-256 hash of member's derived key
  wrapped_vault_key TEXT NOT NULL,       -- vault key encrypted with member's passphrase-derived key
  role             TEXT DEFAULT 'member', -- 'owner' | 'member'
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  revoked_at       TIMESTAMPTZ,         -- NULL = active, set timestamp = revoked
  UNIQUE(vault_slug, member_id)
);

ALTER TABLE vault_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_anon_vault_members" ON vault_members
  FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- One-time invite codes for team onboarding
CREATE TABLE IF NOT EXISTS vault_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_slug  TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,       -- UUID one-time code
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,       -- 48h default
  used_at     TIMESTAMPTZ,               -- NULL = unused
  used_by     TEXT                        -- member_id who consumed it
);

ALTER TABLE vault_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_anon_vault_invites" ON vault_invites
  FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- Index for fast member lookup by vault
CREATE INDEX IF NOT EXISTS idx_vault_members_slug ON vault_members(vault_slug);
CREATE INDEX IF NOT EXISTS idx_vault_invites_slug_code ON vault_invites(vault_slug, code);
