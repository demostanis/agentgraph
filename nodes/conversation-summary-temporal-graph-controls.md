# Conversation Summary - Temporal Graph Controls

The conversation evolved a graph time-filter feature into a richer temporal navigation model for node graphs.

## Main Threads

- [[Temporal Graph Time Filter Requirements]] captures the product behavior expected from the filter.
- [[Smart Time Bucket Filtering]] explains how the slider avoids empty periods while staying smooth.
- [[Time Metadata Source Decision]] records the move from content dates to file modification time.
- [[Time Filter UI Contract]] describes the collapsed `All time` control and expandable slider.
- [[Cross-Time Link Navigation]] covers links that jump outside the visible time span.
- [[Graph Camera Follow Behavior]] documents the camera rules for graph movement, manual movement, and selected nodes.
- [[Timeline Test Nodes]] records the synthetic nodes used to exercise the feature.

Useful implementation areas include `src/app.ts`, `src/ui/shell.ts`, `src/styles.css`, `src/data/nodeGraph.ts`, `src-tauri/src/lib.rs`, `src/rendering/SmoothForceRenderer.ts`, and `src/interaction/cameraController.ts`.
