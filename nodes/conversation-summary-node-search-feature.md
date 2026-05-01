# Conversation Summary - Node Search Feature

The conversation added a search feature for the Markdown node graph and refined its result presentation.

## Main Threads

- [[Node Search Requirements]] records the behavior expected from the search bar.
- [[Rg Backed Node Search Command]] explains how the desktop backend searches `nodes/*.md`.
- [[Node Search Result Ranking]] captures the relevance ordering rules.
- [[Node Search UI Contract]] documents the visible copy and result-card constraints.
- [[Node Search Implementation Files]] lists the files that carry the feature.

The feature connects the runtime node file bridge in [[Tauri Node File Bridge]] with the graph navigation model in [[Graph Interaction Model]] so a search result can open the matching node.

This conversation belongs to [[AgentGraph Project Overview]] so the workstream remains connected to the main AgentGraph project context.
