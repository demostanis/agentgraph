# D3 Force Graph Repo Overview

This repo is a Tauri 2 desktop app for browsing Markdown notes as an interactive 2D force graph rendered with Three.js.

## Main Threads

- [[Markdown Node Graph Data Pipeline]] turns `nodes/*.md` files into graph nodes and wiki-link edges.
- [[Tauri Node File Bridge]] provides filesystem reads, deletion, and change events from Rust.
- [[Smooth Force Renderer]] owns WebGL drawing, animation, selection focus, and graph synchronization.
- [[Graph Interaction Model]] describes drag, pan, zoom, selection, and camera behavior.
- [[Node Panel Markdown Rendering]] displays node content, backlinks, code highlighting, and Mermaid diagrams.
- [[Node Management Scripts]] are the CLI-safe way to add, edit, search, and validate nodes.

[[Build And Runtime Commands]] collects the important npm/Tauri commands for future work, while [[Visual Design System]] captures the current interface direction.
