use std::collections::VecDeque;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, RunEvent, State};
use url::Url;

#[derive(Default)]
struct PendingFiles(Mutex<VecDeque<String>>);

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "mdown"
            )
        })
}

fn markdown_paths(args: Vec<String>) -> Vec<String> {
    args.into_iter()
        .filter(|arg| is_markdown_path(Path::new(arg)))
        .collect()
}

fn pending_path_key(path: &str) -> String {
    if cfg!(windows) {
        path.replace('/', "\\")
            .trim_end_matches('\\')
            .to_ascii_lowercase()
    } else {
        path.to_string()
    }
}

impl PendingFiles {
    fn enqueue(&self, paths: Vec<String>) -> usize {
        let mut queue = self
            .0
            .lock()
            .expect("pending file queue should not be poisoned");
        let mut added = 0;

        for path in paths {
            let key = pending_path_key(&path);
            if queue.iter().any(|queued| pending_path_key(queued) == key) {
                continue;
            }
            queue.push_back(path);
            added += 1;
        }

        added
    }

    fn take(&self) -> Vec<String> {
        self.0
            .lock()
            .expect("pending file queue should not be poisoned")
            .drain(..)
            .collect()
    }
}

fn enqueue_and_notify(app: &AppHandle, paths: Vec<String>) {
    let paths = markdown_paths(paths);
    if paths.is_empty() {
        return;
    }

    if app.state::<PendingFiles>().enqueue(paths) > 0 {
        let _ = app.emit("open-files", ());
    }
}

fn file_url_to_path(url: &Url) -> Option<String> {
    if url.scheme() != "file" {
        return None;
    }

    url.to_file_path()
        .ok()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn take_pending_files(state: State<'_, PendingFiles>) -> Vec<String> {
    state.take()
}

#[tauri::command]
fn enqueue_pending_files(
    app: AppHandle,
    state: State<'_, PendingFiles>,
    paths: Vec<String>,
) -> usize {
    let paths = markdown_paths(paths);
    let added = state.enqueue(paths);
    if added > 0 {
        let _ = app.emit("open-files", ());
    }
    added
}

#[tauri::command]
fn read_markdown_file(path: String) -> Result<String, String> {
    if !is_markdown_path(Path::new(&path)) {
        return Err("Only Markdown files can be opened.".to_string());
    }

    std::fs::read_to_string(&path).map_err(|error| error.to_string())
}

fn temporary_path(target: &Path) -> PathBuf {
    let parent = target
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let name = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("markdown");
    let process_id = std::process::id();

    for attempt in 0..1000 {
        let candidate = parent.join(format!(".{name}.mdreader-{process_id}-{attempt}.tmp"));
        if !candidate.exists() {
            return candidate;
        }
    }

    parent.join(format!(".{name}.mdreader-{process_id}.tmp"))
}

fn replace_file(temp: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        if target.exists() {
            let backup = temporary_path(target);
            fs::rename(target, &backup)?;
            return match fs::rename(temp, target) {
                Ok(()) => {
                    let _ = fs::remove_file(backup);
                    Ok(())
                }
                Err(error) => {
                    let _ = fs::rename(&backup, target);
                    Err(error)
                }
            };
        }
    }

    fs::rename(temp, target)
}

#[tauri::command]
fn write_markdown_file(path: String, content: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !is_markdown_path(&target) {
        return Err("Only Markdown files can be saved.".to_string());
    }

    let parent = target
        .parent()
        .filter(|value| !value.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    if !parent.is_dir() {
        return Err("The destination folder does not exist.".to_string());
    }

    let temp = temporary_path(&target);
    let write_result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        drop(file);
        replace_file(&temp, &target)
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temp);
    }

    write_result.map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn handle_run_event(app: &AppHandle, event: RunEvent) {
    if let RunEvent::Opened { urls } = event {
        let paths = urls
            .into_iter()
            .filter_map(|url| file_url_to_path(&url))
            .collect();
        enqueue_and_notify(app, paths);
    }
}

#[cfg(not(target_os = "macos"))]
fn handle_run_event(_: &AppHandle, _: RunEvent) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PendingFiles::default())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            enqueue_and_notify(&app, argv);

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            take_pending_files,
            enqueue_pending_files,
            read_markdown_file,
            write_markdown_file
        ])
        .setup(|app| {
            let initial_paths = markdown_paths(std::env::args().skip(1).collect());
            app.state::<PendingFiles>().enqueue(initial_paths);

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| handle_run_event(app, event));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn recognizes_supported_markdown_extensions() {
        assert!(is_markdown_path(Path::new("notes.MD")));
        assert!(is_markdown_path(Path::new("notes.markdown")));
        assert!(is_markdown_path(Path::new("notes.mdown")));
        assert!(!is_markdown_path(Path::new("notes.txt")));
        assert!(read_markdown_file("notes.txt".to_string()).is_err());
    }

    #[test]
    fn pending_files_are_filtered_deduplicated_and_drained_in_order() {
        let queue = PendingFiles::default();
        let added = queue.enqueue(markdown_paths(vec![
            "first.md".to_string(),
            "first.md".to_string(),
            "notes.txt".to_string(),
            "second.markdown".to_string(),
        ]));

        assert_eq!(added, 2);
        assert_eq!(
            queue.take(),
            vec!["first.md".to_string(), "second.markdown".to_string()]
        );
        assert!(queue.take().is_empty());
    }

    #[test]
    fn converts_file_urls_to_local_paths() {
        let url = Url::parse("file:///Users/alice/Notes/My%20file.md").expect("URL should parse");
        let path = file_url_to_path(&url).expect("file URL should convert");
        assert!(path.ends_with("My file.md"));
        assert!(file_url_to_path(&Url::parse("https://example.com/notes.md").unwrap()).is_none());
    }

    #[test]
    fn writes_and_replaces_markdown_content() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be available")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("mdreader-write-{stamp}.md"));
        let path_string = path.to_string_lossy().into_owned();

        write_markdown_file(path_string.clone(), "# First\n".to_string())
            .expect("initial write should succeed");
        assert_eq!(
            fs::read_to_string(&path).expect("file should be readable"),
            "# First\n"
        );
        write_markdown_file(path_string, "# Second\n".to_string())
            .expect("replacement should succeed");
        assert_eq!(
            fs::read_to_string(&path).expect("file should be readable"),
            "# Second\n"
        );
        assert!(write_markdown_file(
            path.with_extension("txt").to_string_lossy().into_owned(),
            "invalid".to_string()
        )
        .is_err());
        assert!(write_markdown_file(
            path.with_file_name("missing-folder")
                .join("notes.md")
                .to_string_lossy()
                .into_owned(),
            "invalid".to_string()
        )
        .is_err());

        let _ = fs::remove_file(path);
    }
}
