# Graph Interaction Model

Pointer and camera behavior make the graph feel directly manipulable.

- `InputController` attaches pointer and wheel listeners, while `CameraController` owns orthographic resizing, smooth panning, reset zoom, selected zoom, and zoom-at-pointer math.
- Clicking a node selects it, opens [[Node Panel Markdown Rendering]], focuses the camera, and highlights connected topology.
- Dragging a node temporarily fixes `fx` and `fy`, updates render coordinates immediately, and reheats the simulation.
- Dragging empty space pans the camera; clicking far from nodes while selected clears the selection and resets the view.
- Wheel input disables selection auto-follow, accumulates normalized deltas, zooms around the cursor, and temporarily lowers render pixel ratio.

This interaction layer is implemented inside [[Smooth Force Renderer]] with supporting helpers in `src/interaction/`.

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
