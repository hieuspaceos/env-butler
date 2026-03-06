// Typed wrappers for all Tauri invoke() calls.
// Signatures must match Rust command definitions in lib.rs exactly.

import { invoke } from "@tauri-apps/api/core";

// -- Types matching Rust structs --

export interface ScannedFile {
  path: string;
  filename: string;
  size_bytes: number;
  var_count: number;
  has_sensitive_keys: boolean;
  warnings: string[];
  blocked: boolean;
  block_reason: string | null;
}

export interface EncryptedPayload {
  blob_hex: string;
  plaintext_hash: string;
  manifest: ScannedFile[];
}

export interface DecryptedManifest {
  files: Record<string, string>;
}

export interface ProjectEntry {
  slug: string;
  path: string;
  last_sync_hash: string | null;
  last_sync_at: string | null;
}

export interface ProjectsConfig {
  projects: Record<string, ProjectEntry>;
}

// -- Command wrappers --

export const scanProject = (path: string) =>
  invoke<ScannedFile[]>("cmd_scan_project", { path });

export const encryptAndPrepare = (path: string, password: string) =>
  invoke<EncryptedPayload>("cmd_encrypt_and_prepare", { path, password });

export const decryptVault = (blobHex: string, password: string) =>
  invoke<DecryptedManifest>("cmd_decrypt_vault", { blobHex, password });

export const generateRecoveryKit = () =>
  invoke<string>("cmd_generate_recovery_kit");

export const validateMnemonic = (mnemonic: string) =>
  invoke<string>("cmd_validate_mnemonic", { mnemonic });

export const loadProjects = () =>
  invoke<ProjectsConfig>("cmd_load_projects");

export const saveProjectSlug = (path: string, slug: string) =>
  invoke<void>("cmd_save_project_slug", { path, slug });

export const removeProject = (slug: string) =>
  invoke<void>("cmd_remove_project", { slug });

// -- Local file sync commands --

export const exportVault = (projectPath: string, password: string) =>
  invoke<number[]>("cmd_export_vault", { projectPath, password });

export const importVault = (fileBytes: number[], password: string) =>
  invoke<Record<string, string>>("cmd_import_vault", { fileBytes, password });

export const folderPush = (slug: string, projectPath: string, password: string) =>
  invoke<string>("cmd_folder_push", { slug, projectPath, password });

export const folderPull = (slug: string, password: string) =>
  invoke<Record<string, string>>("cmd_folder_pull", { slug, password });

export const saveSyncFolder = (folder: string | null) =>
  invoke<void>("cmd_save_sync_folder", { folder });

// -- Phase 4: Supabase sync commands --

export interface VaultRecord {
  project_slug: string;
  encrypted_blob: string;
  plaintext_hash: string;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
}

export type ConflictStatus = "InSync" | "SafePull" | "PushReminder" | "Conflict";

export interface SupabaseConfig {
  supabase_url: string;
  supabase_service_role_key: string;
  sync_folder: string | null;
}

export const pushToSupabase = (
  slug: string,
  blobHex: string,
  plaintextHash: string,
  metadata: Record<string, unknown>,
) => invoke<void>("cmd_push_to_supabase", { slug, blobHex, plaintextHash, metadata });

export const pullFromSupabase = (slug: string) =>
  invoke<VaultRecord>("cmd_pull_from_supabase", { slug });

export const checkConflict = (slug: string, remoteHash: string, localHash: string) =>
  invoke<ConflictStatus>("cmd_check_conflict", { slug, remoteHash, localHash });

export const decryptAndApply = (
  blobHex: string,
  password: string,
  projectPath: string,
  slug: string,
) => invoke<string[]>("cmd_decrypt_and_apply", { blobHex, password, projectPath, slug });

export const decryptForDiff = (blobHex: string, password: string) =>
  invoke<Record<string, string>>("cmd_decrypt_for_diff", { blobHex, password });

export const saveSupabaseConfig = (url: string, serviceRoleKey: string) =>
  invoke<void>("cmd_save_supabase_config", { url, serviceRoleKey });

export const loadSupabaseConfig = () =>
  invoke<SupabaseConfig>("cmd_load_supabase_config");
