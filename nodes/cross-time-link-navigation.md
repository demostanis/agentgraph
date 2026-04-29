# Cross-Time Link Navigation

Node links should remain useful even when the target node is outside the current time filter.

- Clicking a node link first searches the full graph, not just the currently visible graph.
- If the target is outside the current span, the time filter expands to include both the selected node and linked target node.
- The filter switches to span mode when a single fixed bucket cannot include both nodes.
- After the span changes, the graph syncs and the target node is selected.
- This preserves the user's intent: a wiki link means navigate to the target, not fail silently because of a filter.

The behavior lives primarily in `src/app.ts` and depends on [[Smart Time Bucket Filtering]] to map target node times to buckets.
