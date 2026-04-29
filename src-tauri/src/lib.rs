use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    env, fs, io,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};

const NODES_CHANGED_EVENT: &str = "nodes://changed";

struct NodeWatcher(Mutex<Option<RecommendedWatcher>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NodeFile {
    path: String,
    markdown: String,
    modified_time_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NodeSearchResult {
    id: String,
    title: String,
    excerpt: String,
    match_line: u64,
    match_kind: String,
}

struct NodeSearchCandidate {
    result: NodeSearchResult,
    markdown: String,
    score: i64,
    best_excerpt_score: i64,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(NodeWatcher(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            delete_node_file,
            read_node_files,
            search_nodes
        ])
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
        let modified_time_ms = modified_time_ms(&path).unwrap_or(0);
        node_files.push(NodeFile {
            path: path.to_string_lossy().into_owned(),
            markdown,
            modified_time_ms,
        });
    }

    node_files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(node_files)
}

#[tauri::command]
fn search_nodes(query: String) -> Result<Vec<NodeSearchResult>, String> {
    let query = query.trim();

    if query.is_empty() {
        return Ok(Vec::new());
    }

    let nodes_dir = resolve_nodes_dir()?;
    let output = Command::new("rg")
        .arg("--json")
        .arg("--ignore-case")
        .arg("--glob")
        .arg("*.md")
        .arg("--context")
        .arg("1")
        .arg("--")
        .arg(query)
        .arg(&nodes_dir)
        .output()
        .map_err(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                "rg is required for node search but was not found in PATH.".to_string()
            } else {
                format!("Could not run rg: {error}")
            }
        })?;

    if !output.status.success() {
        if output.status.code() == Some(1) {
            return Ok(Vec::new());
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Node search failed.".to_string()
        } else {
            stderr
        });
    }

    parse_rg_search_results(&output.stdout, query)
}

fn parse_rg_search_results(stdout: &[u8], query: &str) -> Result<Vec<NodeSearchResult>, String> {
    let mut candidates: HashMap<PathBuf, NodeSearchCandidate> = HashMap::new();
    let normalized_query = query.to_lowercase();
    let query_terms = search_terms(query);

    for line in String::from_utf8_lossy(stdout).lines() {
        let value: Value = serde_json::from_str(line)
            .map_err(|error| format!("Could not parse rg output: {error}"))?;

        if value.get("type").and_then(Value::as_str) != Some("match") {
            continue;
        }

        let data = &value["data"];
        let Some(path_text) = data["path"]["text"].as_str() else {
            continue;
        };
        let path = PathBuf::from(path_text);

        if !candidates.contains_key(&path) {
            let markdown = fs::read_to_string(&path)
                .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
            let title = node_title_from_markdown(&markdown).unwrap_or_else(|| {
                path.file_stem()
                    .and_then(|stem| stem.to_str())
                    .unwrap_or("node")
                    .to_string()
            });
            let id = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("node")
                .to_string();
            let score = title_relevance_score(&title, &normalized_query, &query_terms);

            candidates.insert(
                path.clone(),
                NodeSearchCandidate {
                    result: NodeSearchResult {
                        id,
                        title,
                        excerpt: String::new(),
                        match_line: u64::MAX,
                        match_kind: "content".to_string(),
                    },
                    markdown,
                    score,
                    best_excerpt_score: i64::MIN,
                },
            );
        }

        let match_line = data["line_number"].as_u64().unwrap_or(1);
        let matched_text = data["lines"]["text"]
            .as_str()
            .unwrap_or_default()
            .trim_end_matches(&['\r', '\n'][..]);
        let match_kind = if matched_text.trim_start().starts_with("# ") {
            "title"
        } else {
            "content"
        };
        let submatch_count = data["submatches"]
            .as_array()
            .map(|submatches| submatches.len())
            .unwrap_or(1);
        let line_score = line_relevance_score(
            matched_text,
            match_kind,
            submatch_count,
            match_line,
            &normalized_query,
            &query_terms,
        );
        let candidate = candidates
            .get_mut(&path)
            .ok_or_else(|| format!("Could not rank match for {}", path.display()))?;

        candidate.score += line_score;

        if line_score > candidate.best_excerpt_score
            || (line_score == candidate.best_excerpt_score
                && match_line < candidate.result.match_line)
        {
            candidate.best_excerpt_score = line_score;
            candidate.result.excerpt =
                node_match_excerpt(&candidate.markdown, match_line, matched_text);
            candidate.result.match_line = match_line;
            candidate.result.match_kind = match_kind.to_string();
        }
    }

    let mut ranked_candidates = candidates.into_values().collect::<Vec<_>>();
    ranked_candidates.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.result.match_line.cmp(&right.result.match_line))
            .then_with(|| left.result.title.cmp(&right.result.title))
    });

    Ok(ranked_candidates
        .into_iter()
        .take(30)
        .map(|candidate| candidate.result)
        .collect())
}

fn title_relevance_score(title: &str, normalized_query: &str, query_terms: &[String]) -> i64 {
    let normalized_title = title.to_lowercase();
    let mut score = 0;

    if normalized_title == normalized_query {
        score += 300;
    } else if normalized_title.starts_with(normalized_query) {
        score += 200;
    } else if normalized_title.contains(normalized_query) {
        score += 120;
    }

    if contains_all_terms(&normalized_title, query_terms) {
        score += 60;
    }

    score
}

fn line_relevance_score(
    matched_text: &str,
    match_kind: &str,
    submatch_count: usize,
    match_line: u64,
    normalized_query: &str,
    query_terms: &[String],
) -> i64 {
    let normalized_text = matched_text.to_lowercase();
    let mut score = if match_kind == "title" { 100 } else { 20 };

    score += (submatch_count as i64) * 8;

    if normalized_text.contains(normalized_query) {
        score += 24;
    }

    if contains_all_terms(&normalized_text, query_terms) {
        score += 12;
    }

    score += 12_i64.saturating_sub(match_line.min(12) as i64);
    score
}

fn search_terms(query: &str) -> Vec<String> {
    query
        .split(|character: char| !character.is_alphanumeric())
        .map(str::trim)
        .filter(|term| term.chars().count() > 1)
        .map(str::to_lowercase)
        .collect()
}

fn contains_all_terms(value: &str, terms: &[String]) -> bool {
    !terms.is_empty() && terms.iter().all(|term| value.contains(term))
}

fn node_title_from_markdown(markdown: &str) -> Option<String> {
    markdown.lines().find_map(|line| {
        line.strip_prefix("# ")
            .map(str::trim)
            .filter(|title| !title.is_empty())
            .map(str::to_string)
    })
}

fn node_match_excerpt(markdown: &str, match_line: u64, matched_text: &str) -> String {
    let lines: Vec<&str> = markdown.lines().collect();
    let line_index = match_line.saturating_sub(1) as usize;

    if lines.is_empty() || line_index >= lines.len() {
        return normalize_excerpt(matched_text);
    }

    let start = line_index.saturating_sub(1);
    let end = usize::min(line_index + 2, lines.len());
    normalize_excerpt(&lines[start..end].join(" "))
}

fn normalize_excerpt(value: &str) -> String {
    let collapsed = value.split_whitespace().collect::<Vec<_>>().join(" ");

    if collapsed.chars().count() <= 280 {
        return collapsed;
    }

    collapsed.chars().take(277).collect::<String>() + "..."
}

fn modified_time_ms(path: &Path) -> Result<u64, String> {
    let modified = fs::metadata(path)
        .map_err(|error| format!("Could not read metadata for {}: {error}", path.display()))?
        .modified()
        .map_err(|error| {
            format!(
                "Could not read modified time for {}: {error}",
                path.display()
            )
        })?;

    Ok(duration_since_epoch(modified).as_millis() as u64)
}

fn duration_since_epoch(time: SystemTime) -> Duration {
    time.duration_since(UNIX_EPOCH).unwrap_or_default()
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
