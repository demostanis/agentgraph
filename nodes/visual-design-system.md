# Visual Design System

The interface uses a dark cosmic graph style with glowing nodes and a glassy reading panel.

- `src/styles.css` imports Space Grotesk for UI headings and IBM Plex Mono for labels, controls, code, and technical text.
- The background layers radial gradients, star fields, and a blurred conic aura behind the graph stage.
- Nodes are white luminous circles with additive glow shaders; active selection uses the configured accent color from `src/config/graphConfig.ts`.
- The node panel slides in from the right on desktop, can expand to full width, and blurs/dims the graph while expanded.
- On screens under 760px, the panel becomes a bottom sheet with rotated expand controls and adjusted padding.
- Reduced-motion preferences disable major CSS transitions.

This design supports [[Smooth Force Renderer]] and [[Node Panel Markdown Rendering]] rather than relying on a generic document list UI.

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
