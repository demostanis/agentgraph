# Markdown Inline Formatting Order

Inline Markdown formatting should isolate code spans before applying emphasis, bold, or wiki-link transforms.

- `formatInline` now splits text around backtick spans, escapes each code-span payload, and emits `<code>...</code>` directly.
- Non-code segments continue through `formatInlineText`, which handles double-bracket wiki links, `**bold**`, and `_emphasis_`.
- This ordering prevents `_` characters in identifiers from being interpreted as `<em>` while preserving normal emphasis outside code.

This supports [[Inline Code Emphasis Rendering Bug]] and keeps the behavior documented in [[Node Panel Markdown Rendering]].
