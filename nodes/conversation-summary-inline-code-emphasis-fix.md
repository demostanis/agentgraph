# Conversation Summary - Inline Code Emphasis Fix

A Markdown rendering bug made underscores inside inline code render as italic emphasis.

## Main Threads

- [[Inline Code Emphasis Rendering Bug]] - what failed and how it appeared in the node panel.
- [[Markdown Inline Formatting Order]] - why inline code must be protected before emphasis parsing.
- [[Node Panel Markdown Rendering]] - where selected node Markdown becomes panel HTML.

## Useful Artifacts

- `src/utils/markdown.ts` contains the inline Markdown formatter.
- `npm run web:build` exercises TypeScript and the Vite production build after renderer changes.
