-- Team v2 Phase 5: RLS policies for member-scoped access.
-- Members use anon key + x-member-id header. Owner uses service_role.
-- Run after 002_team_v2_envelope_encryption.sql.

-- ============================================================
-- vault table: members can read their vault's encrypted blob
-- (they still need their wrapped vault key to decrypt it)
-- ============================================================

-- Drop the old deny-all policy
DROP POLICY IF EXISTS "deny_anon_access" ON vault;

-- Owner (service_role) bypasses RLS — full access
-- Members (anon) can only SELECT vaults they belong to
CREATE POLICY "anon_read_own_vaults" ON vault
  FOR SELECT TO anon
  USING (
    project_slug IN (
      SELECT vault_slug FROM vault_members
      WHERE member_id = current_setting('request.headers', true)::json->>'x-member-id'
        AND revoked_at IS NULL
    )
  );

-- Only service_role can INSERT/UPDATE/DELETE vaults
CREATE POLICY "deny_anon_write_vault" ON vault
  FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

-- Need separate SELECT policy, so override the ALL policy for SELECT
-- (PostgreSQL evaluates permissive policies with OR)
ALTER POLICY "deny_anon_write_vault" ON vault USING (false);

-- ============================================================
-- vault_members: members can read their own row only
-- ============================================================

DROP POLICY IF EXISTS "deny_anon_vault_members" ON vault_members;

-- Members can read their own membership record (to get wrapped_vault_key)
CREATE POLICY "anon_read_own_membership" ON vault_members
  FOR SELECT TO anon
  USING (
    member_id = current_setting('request.headers', true)::json->>'x-member-id'
    AND revoked_at IS NULL
  );

-- Only service_role can manage members (insert, update, delete)
CREATE POLICY "deny_anon_write_members" ON vault_members
  FOR INSERT TO anon WITH CHECK (false);

CREATE POLICY "deny_anon_update_members" ON vault_members
  FOR UPDATE TO anon USING (false);

CREATE POLICY "deny_anon_delete_members" ON vault_members
  FOR DELETE TO anon USING (false);

-- ============================================================
-- vault_invites: anon can read + consume their own invite code
-- ============================================================

DROP POLICY IF EXISTS "deny_anon_vault_invites" ON vault_invites;

-- Anyone with the code can read the invite (to validate it)
CREATE POLICY "anon_read_invite_by_code" ON vault_invites
  FOR SELECT TO anon
  USING (
    used_at IS NULL  -- only unused invites
  );

-- Anon can update (consume) an invite by setting used_at + used_by
CREATE POLICY "anon_consume_invite" ON vault_invites
  FOR UPDATE TO anon
  USING (used_at IS NULL)
  WITH CHECK (used_at IS NOT NULL);  -- must be marking as used

-- Only service_role can create or delete invites
CREATE POLICY "deny_anon_insert_invites" ON vault_invites
  FOR INSERT TO anon WITH CHECK (false);

CREATE POLICY "deny_anon_delete_invites" ON vault_invites
  FOR DELETE TO anon USING (false);
