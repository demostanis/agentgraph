# Smart Time Bucket Filtering

The slider uses smart buckets derived from actual node timestamps instead of raw continuous time.

- Buckets are created from node `timeMs` values in `src/app.ts`.
- Timestamps within a five-minute gap are grouped into one bucket, so bursts of node activity become one selectable step.
- The range input remains visually smooth with `step=\"any\"`, but filtering snaps internally to the nearest bucket.
- Empty hours and days are not selectable because no bucket exists for them.
- Span filtering uses the bucket at the left handle and the bucket at the right handle as inclusive endpoints.
- The left handle is clamped so it cannot logically pass the right handle, preventing inverted spans.

This supports [[Temporal Graph Time Filter Requirements]] while preserving the smooth feel described by [[Time Filter UI Contract]].

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
