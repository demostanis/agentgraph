# Force Simulation Layout

Graph layout is handled by a stopped D3 force simulation that the renderer advances manually.

- `src/simulation/forceSimulation.ts` creates link, charge, collide, x, y, and center forces for `GraphNode` and `GraphLink` data.
- `src/config/graphConfig.ts` defines six named cluster anchors: Signals, Models, Pipelines, Products, Ops, and Archives.
- Same-cluster links are shorter and stronger; cross-cluster links receive longer minimum distances and much weaker pull.
- Node radius influences charge and collision, so longer Markdown nodes occupy slightly more visual space.
- Simulation decay settings are tuned for smooth, persistent movement rather than a one-time static layout.

The layout model supports [[Smooth Force Renderer]] and is navigated through [[Graph Interaction Model]].
