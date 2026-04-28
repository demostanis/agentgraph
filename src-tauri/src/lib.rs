use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    env, fs, io,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::{Emitter, Manager};

const NODES_CHANGED_EVENT: &str = "nodes://changed";

struct NodeWatcher(Mutex<Option<RecommendedWatcher>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NodeFile {
    path: String,
    markdown: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(NodeWatcher(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![delete_node_file, read_node_files])
        .setup(|app| {
            start_node_watcher(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

#[tauri::command]
fn delete_node_file(node_id: String) -> Result<(), String> {
    let nodes_dir = resolve_nodes_dir()?;
    let path = nodes_dir.join(format!("{node_id}.md"));

    if !is_safe_node_id(&node_id) {
        return Err("Invalid node id.".to_string());
    }

    if !path.is_file() {
        return Err(format!("Node file not found: {node_id}"));
    }

    fs::remove_file(&path).map_err(|error| format!("Could not delete {}: {error}", path.display()))
}

#[tauri::command]
fn read_node_files() -> Result<Vec<NodeFile>, String> {
    let nodes_dir = resolve_nodes_dir()?;
    let mut node_files = Vec::new();

    for entry in fs::read_dir(&nodes_dir)
        .map_err(|error| format!("Could not read {}: {error}", nodes_dir.display()))?
    {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();

        if path.extension().and_then(|extension| extension.to_str()) != Some("md") {
            continue;
        }

        let markdown = fs::read_to_string(&path)
            .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
        node_files.push(NodeFile {
            path: path.to_string_lossy().into_owned(),
            markdown,
        });
    }

    node_files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(node_files)
}

fn start_node_watcher(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let nodes_dir =
        resolve_nodes_dir().map_err(|error| io::Error::new(io::ErrorKind::NotFound, error))?;
    let app_handle = app.handle().clone();
    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<notify::Event>| match result {
            Ok(event) => {
                if should_refresh_nodes(&event) {
                    let _ = app_handle.emit(NODES_CHANGED_EVENT, ());
                }
            }
            Err(error) => eprintln!("node watcher error: {error}"),
        },
        Config::default().with_poll_interval(Duration::from_secs(1)),
    )?;

    watcher.watch(&nodes_dir, RecursiveMode::NonRecursive)?;
    let state = app.state::<NodeWatcher>();
    *state
        .0
        .lock()
        .map_err(|_| io::Error::other("node watcher lock poisoned"))? = Some(watcher);
    println!("watching node directory: {}", nodes_dir.display());
    Ok(())
}

fn resolve_nodes_dir() -> Result<PathBuf, String> {
    if let Ok(nodes_dir) = env::var("NODE_GRAPH_DIR") {
        let path = PathBuf::from(nodes_dir);
        if path.is_dir() {
            return Ok(path);
        }
    }

    let mut candidates = Vec::new();

    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join("nodes"));
    }

    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("nodes"));
        }
    }

    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("nodes"),
    );

    candidates
        .into_iter()
        .find(|path| path.is_dir())
        .ok_or_else(|| {
            "Could not find nodes directory. Set NODE_GRAPH_DIR to override.".to_string()
        })
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension().and_then(|extension| extension.to_str()) == Some("md")
}

fn is_safe_node_id(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn should_refresh_nodes(event: &Event) -> bool {
    let is_write_event = matches!(
        event.kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    );

    is_write_event && event.paths.iter().any(|path| is_markdown_file(path))
}
