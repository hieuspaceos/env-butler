mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sync::cmd_scan_project,
            commands::sync::cmd_encrypt_and_prepare,
            commands::sync::cmd_decrypt_vault,
            commands::sync::cmd_generate_recovery_kit,
            commands::sync::cmd_validate_mnemonic,
            commands::project::cmd_load_projects,
            commands::project::cmd_save_project_slug,
            commands::project::cmd_remove_project,
            commands::sync::cmd_push_to_supabase,
            commands::sync::cmd_pull_from_supabase,
            commands::sync::cmd_check_conflict,
            commands::sync::cmd_decrypt_and_apply,
            commands::sync::cmd_decrypt_for_diff,
            commands::file_sync::cmd_export_vault,
            commands::file_sync::cmd_import_vault,
            commands::file_sync::cmd_folder_push,
            commands::file_sync::cmd_folder_pull,
            commands::project::cmd_save_sync_folder,
            commands::project::cmd_save_supabase_config,
            commands::project::cmd_load_supabase_config,
            commands::team::cmd_team_generate_invite,
            commands::team::cmd_team_join,
            commands::project::cmd_write_env_files,
            commands::project::cmd_read_env_contents,
            commands::team::cmd_team_invite_v2,
            commands::team::cmd_team_join_v2,
            commands::team::cmd_team_approve_member,
            commands::team::cmd_team_activate_membership,
            commands::team::cmd_team_list_members,
            commands::team::cmd_team_revoke_member,
            commands::team::cmd_vault_migrate_v2,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
