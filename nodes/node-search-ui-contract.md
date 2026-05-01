# Node Search UI Contract

The AgentGraph search UI should behave like a compact app-level search control that coordinates with the time filter and selected-node panel.

- The collapsed search control is a round icon button positioned next to the time span filter, including on small screens.
- Clicking the loop/search icon expands the control into an input centered horizontally; clicking the icon again collapses it back to the round button.
- Expanded search hides the time filter so the two controls do not compete for the same top-center space.
- The icon stays centered in the collapsed button and remains on the left side of the expanded input.
- Clicking outside an expanded search collapses it, except graph clicks that are clearing an active selected-node panel may restore search if it was active before the panel appeared.
- The input placeholder is `Search nodes...`, and result cards show only the node title and excerpt.
- Result cards must not show line numbers, `title match`, `content match`, or other implementation metadata.
- Clicking a result toggles result visibility; focusing or clicking the input reveals temporarily hidden results again.
- Search results inside the active time filter sort above results outside the current filter while preserving relevance order within each group.

This presentation complements [[Visual Design System]], consumes ranked results from [[Node Search Result Ranking]], and follows the rationale in [[AgentGraph Search And Filter Interaction Decisions]].

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
