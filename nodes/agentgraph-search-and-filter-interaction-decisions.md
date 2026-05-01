# AgentGraph Search And Filter Interaction Decisions

AgentGraph coordinates search, time filtering, and selection so users keep context instead of losing the current graph state.

- Search expands from a compact icon because the top bar needs to preserve space beside the time span filter on small screens.
- Expanded search hides the time filter and centers itself to avoid competing controls in the same visual area.
- Search results are temporarily hidden by filter changes and result clicks, but input focus can reveal them again.
- Clearing a selected-node panel restores expanded search when search was active before the panel appeared.
- Results outside the current time filter move to the bottom so the list reflects both relevance and the current graph view.
- Selecting an out-of-span search result expands the current span to include the node timestamp; it does not collapse the filter to only that timestamp.

This rationale explains current behavior in [[Node Search UI Contract]], [[Time Filter UI Contract]], and [[Cross-Time Link Navigation]].

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
