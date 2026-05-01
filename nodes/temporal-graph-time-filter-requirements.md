# Temporal Graph Time Filter Requirements

The graph needs temporal filtering that feels like navigating meaningful node history rather than scrubbing through empty clock time.

- By default, the time filter includes every node, which the UI labels as `All time`.
- In fixed mode, the filter targets one meaningful node-time bucket.
- In span mode, two handles define a range between meaningful node-time buckets.
- Double-clicking the expanded filter switches between fixed mode and span mode.
- The control should not expose hours or days where no nodes exist.
- Nearby node timestamps should collapse into one step when multiple nodes were created or modified within a few minutes.

This requirement connects to [[Smart Time Bucket Filtering]] for the mechanics and to [[Cross-Time Link Navigation]] because node links may need to change the current time span automatically. The presentation details live in [[Time Filter UI Contract]].

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
