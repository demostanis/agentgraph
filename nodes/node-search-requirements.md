# Node Search Requirements

The graph needs a search bar that finds Markdown nodes by title and content.

- Searches must run through `rg` rather than an in-memory browser-only scan.
- Results need to include the node title and a content extract around the match.
- Selecting a result should navigate to that node, including nodes outside the current time span.
- Result ordering should favor pertinence rather than raw filesystem or `rg` output order.
- The visible interface should say `Search`, not expose `rg` as product copy.

This requirement is implemented by [[Rg Backed Node Search Command]] and displayed through [[Node Search UI Contract]]. Node selection reuses the behavior described in [[Cross-Time Link Navigation]].
