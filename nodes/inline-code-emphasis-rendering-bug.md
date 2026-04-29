# Inline Code Emphasis Rendering Bug

Underscores inside backtick-delimited inline code must remain literal text, not emphasis markers.

- The visible symptom was identifiers such as `read_node_files` and `delete_node_file` rendering with italicized middle segments.
- The issue affects [[Node Panel Markdown Rendering]] because node details pass Markdown through `src/utils/markdown.ts` before insertion into the panel.
- Success means inline code spans preserve escaped contents exactly while surrounding Markdown can still render links, bold text, and emphasis.

This bug connects to [[Markdown Inline Formatting Order]] because parser ordering determines whether emphasis sees code-span contents.
