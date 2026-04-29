# Time Metadata Source Decision

Node timestamps come from file modification metadata, not from node markdown content.

- The initial implementation parsed frontmatter fields like `date`, `created`, and `updated`, plus inline ISO dates.
- The requirement changed to filesystem time, first considering creation time and then settling on modification time because it can be set reliably with `touch` in this environment.
- `src-tauri/src/lib.rs` returns `modifiedTimeMs` from file metadata.
- `src/data/nodeGraph.ts` assigns `GraphNode.timeMs` from `modifiedTimeMs` and ignores custom headers.
- Markdown node headers should not be used as a hidden timestamp channel.

This decision directly affects [[Timeline Test Nodes]] and the behavior implemented for [[Smart Time Bucket Filtering]].
