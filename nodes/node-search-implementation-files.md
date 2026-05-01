# Node Search Implementation Files

The node search feature spans the Tauri backend, data bridge, app controller, shell markup, and styling.

- `src-tauri/src/lib.rs` runs `rg`, parses JSON output, scores matches, and returns ranked search results.
- `src-tauri/Cargo.toml` adds `serde_json` so the backend can parse `rg --json` events.
- `src/types.ts` defines `NodeSearchResult` for the frontend contract.
- `src/data/nodeGraph.ts` exports `searchNodes(query)` through Tauri `invoke`.
- `src/ui/shell.ts` mounts the search form, input, status region, and results container.
- `src/app.ts` debounces input, renders results, handles errors, and selects matching nodes.
- `src/styles.css` positions and styles the glassy search bar and result list.

These files extend the architecture in [[AgentGraph Project Overview]] and the bridge described by [[Tauri Node File Bridge]].
