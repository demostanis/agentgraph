# Markdown Node Graph Data Pipeline

Markdown files in `nodes/` are the source of truth for the graph.

- `src/data/nodeGraph.ts` asks Tauri for runtime node files, parses the first Markdown H1 as the title, and extracts every double-bracket wiki link as an outbound link.
- Documents are sorted by title before graph creation, so node ordering is deterministic for rendering and layout seeding.
- Node ids come from Markdown filenames, while labels come from Markdown headings; missing headings fall back to title-cased slugs.
- Links only become graph edges when the target title resolves to another parsed node; self-links and duplicate undirected links are ignored.
- New nodes receive seeded cluster positions using `mulberry32(1729)` and the cluster list in `src/config/graphConfig.ts`.

This feeds [[Smooth Force Renderer]] and depends on [[Tauri Node File Bridge]] for live runtime file access.

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
