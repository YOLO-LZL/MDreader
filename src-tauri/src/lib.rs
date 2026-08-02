use tauri::{Emitter, Manager};

fn markdown_paths(args: Vec<String>) -> Vec<String> {
  args
    .into_iter()
    .filter(|arg| {
      std::path::Path::new(arg)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| matches!(extension.to_ascii_lowercase().as_str(), "md" | "markdown" | "mdown"))
    })
    .collect()
}

#[tauri::command]
fn initial_files() -> Vec<String> {
  markdown_paths(std::env::args().skip(1).collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      let paths = markdown_paths(argv);
      if !paths.is_empty() {
        let _ = app.emit("open-files", paths);
      }

      if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
      }
    }))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![initial_files])
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
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
