# Node Panel Markdown Rendering

The side panel turns selected Markdown nodes into readable, interactive detail views.

- `src/ui/shell.ts` mounts the graph stage, back button, panel controls, delete affordance, and content container.
- `NodePanel.show` renders selected node Markdown, enables delete actions, and appends unlinked backlinks under `Referenced by`.
- `src/utils/markdown.ts` supports H1/H2 headings, bullet lists, fenced code blocks, inline code, bold, emphasis, and double-bracket wiki-link anchors.
- Inline code spans are formatted before emphasis so identifiers such as `read_node_files` keep literal underscores; see [[Markdown Inline Formatting Order]].
- Code highlighting is lazy-loaded through highlight.js language modules for bash, CSS, JavaScript, JSON, Markdown, TypeScript, and XML.
- Mermaid blocks render through lazy-loaded Mermaid with strict security and the app dark theme.

Panel wiki-link clicks call back into [[Smooth Force Renderer]] to select the linked node by title. The inline-code edge case is captured in [[Inline Code Emphasis Rendering Bug]].
