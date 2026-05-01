# Temporal Graph Implementation Files

The temporal graph feature spans UI, data loading, filtering, rendering, and camera code.

- `src/app.ts` owns filter state, bucket creation, span/fixed behavior, out-of-span link navigation, and renderer syncing.
- `src/ui/shell.ts` declares the collapsed label, chevron toggle, and slider inputs.
- `src/styles.css` controls the top-centered transparent filter, chevron animation, expanded/collapsed sizing, and slider thumb styling.
- `src/data/nodeGraph.ts` maps file metadata into `GraphNode.timeMs`.
- `src-tauri/src/lib.rs` returns node markdown plus file modification timestamps.
- `src/rendering/SmoothForceRenderer.ts` and `src/interaction/cameraController.ts` implement graph and selected-node camera following.

This node gives file-level context for [[Temporal Graph Time Filter Requirements]], [[Time Filter UI Contract]], and [[Graph Camera Follow Behavior]].

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
