# Build And Runtime Commands

The project uses Vite for the web frontend and Tauri for the desktop shell.

- `npm run dev` and `npm run tauri:dev` start the Tauri development app.
- `npm run web:dev` starts Vite on `0.0.0.0:1420` with a strict port, which matches typical Tauri dev-server expectations.
- `npm run web:build` runs `tsc` and `vite build` for the frontend bundle.
- `npm run build` runs `tauri build` for the full desktop package.
- `npm run screenshot` executes `dev-scripts/screenshot.mjs`, and `npm run node:test` exercises the node helper scripts.
- Core runtime dependencies are `three`, `d3-force`, `@tauri-apps/api`, `highlight.js`, and `mermaid`.

These commands operate on the architecture summarized in [[AgentGraph Project Overview]].
