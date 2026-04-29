# Tauri Node File Bridge

The Rust side bridges local Markdown files into the browser runtime.

- `src-tauri/src/lib.rs` exposes `read_node_files` and `delete_node_file` through Tauri commands.
- `read_node_files` resolves the node directory, reads only `.md` files, sorts by path, and returns `{ path, markdown }` records.
- `delete_node_file` requires a safe ASCII alphanumeric-or-hyphen node id before removing `nodes/<id>.md`.
- Directory resolution prefers `NODE_GRAPH_DIR`, then the current working directory, executable directory, and finally the source tree near `CARGO_MANIFEST_DIR`.
- A `notify` watcher emits `nodes://changed` for Markdown create, modify, and remove events.

The TypeScript side consumes this through [[Markdown Node Graph Data Pipeline]] and refreshes the live scene through [[Smooth Force Renderer]].
