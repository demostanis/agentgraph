# Rg Backed Node Search Command

The backend exposes node search as a Tauri command that shells out to ripgrep.

- `src-tauri/src/lib.rs` defines `search_nodes(query)` and runs `rg --json --ignore-case --glob '*.md' --context 1 -- <query> <nodes_dir>`.
- The command treats exit code `1` as no matches and returns an empty result list.
- JSON match events are parsed into node id, title, excerpt, match line, and internal match kind.
- Missing `rg` becomes a recoverable command error so the UI can surface the failure.
- The command limits the returned list after ranking to keep the search panel manageable.

This extends [[Tauri Node File Bridge]] and feeds [[Node Search Result Ranking]].

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
