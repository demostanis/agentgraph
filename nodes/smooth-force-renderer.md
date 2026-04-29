# Smooth Force Renderer

`src/rendering/SmoothForceRenderer.ts` is the central rendering engine.

- It combines a Three.js orthographic scene, manually ticked D3 simulation, instanced node meshes, line segment buffers, glow shaders, and DOM labels.
- The animation loop uses a fixed simulation step, smooth render-position interpolation, focus/appearance easing, and lower pixel ratio while wheel zooming.
- Selection and hover states dim the background, accent active nodes, highlight connected nodes and links, and update label visibility.
- `syncGraph` preserves existing node positions and labels across file changes, seeds new linked nodes near related existing nodes, and refreshes topology.
- Static capacities default to 4096 nodes and 16384 links; oversized live updates are skipped rather than reallocating buffers.

It receives graph data from [[Markdown Node Graph Data Pipeline]] and behavior inputs from [[Graph Interaction Model]].
