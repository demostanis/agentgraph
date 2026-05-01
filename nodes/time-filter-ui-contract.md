# Time Filter UI Contract

The AgentGraph time filter should stay compact by default and yield focus to expanded search.

- The default collapsed state shows a label and a down chevron, with no slider visible.
- When all nodes are selected, the label reads `All time`.
- The filter box fits its content rather than using a large fixed panel width.
- Clicking the chevron expands or collapses the slider; clicking outside the expanded filter collapses it without changing active filter values.
- Expanding and collapsing animate width and height changes.
- The expanded state shows the smooth slider handles; double-clicking the expanded control toggles fixed mode and span mode.
- The filter uses the same dark translucent surface, border color, blur, and shadow as the search bar while keeping its original rectangular `18px` corner radius.
- Expanded search hides the time filter because [[Node Search UI Contract]] treats search as the dominant top-center control.

This UI supports [[Temporal Graph Time Filter Requirements]], stays consistent with [[Smart Time Bucket Filtering]], and reflects the decision tradeoffs in [[AgentGraph Search And Filter Interaction Decisions]].

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
