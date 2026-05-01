# Cross-Time Link Navigation

AgentGraph navigation should remain useful when the target node is outside the current time filter.

- Clicking a node link first searches the full graph, not just the currently visible graph.
- If the linked target is outside the current span, the time filter expands to include both the selected node and linked target node.
- The filter switches to span mode when a single fixed bucket cannot include both nodes.
- After the span changes, the graph syncs and the target node is selected.
- Clicking a search result outside the current time span expands the current span to include that result's timestamp instead of switching the filter to only the result timestamp.
- This preserves the user's context: links connect related nodes, while search-result selection extends the current filtered view just enough to include the selected result.

The behavior lives primarily in `src/app.ts` and depends on [[Smart Time Bucket Filtering]] to map target node times to buckets. The UI ordering of in-filter and out-of-filter results is described in [[Node Search UI Contract]].

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
