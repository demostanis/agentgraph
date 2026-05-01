# Graph Camera Follow Behavior

The AgentGraph camera follows graph motion by default, while manual movement, selection, and search-result previews temporarily override it.

- When no node is selected and the user has not moved the camera manually, the camera continuously refits to the visible graph as the simulation moves.
- Changing the time filter refits the camera to the current visible node set.
- Manual pan or wheel zoom disables graph auto-follow.
- Selecting a node disables graph auto-follow and preserves selected-node camera follow.
- Clearing the selected node re-enables graph auto-follow for the visible graph.
- Cross-time link navigation selects the target node after changing the time span, so the camera follows that selected node.
- Hovering a search result previews the matching node with a softer zoom than selection and targets a lower centered screen position beneath the search results overlay.
- Leaving a search result restores the pre-hover viewport unless the result was selected.

Implementation touches `SmoothForceRenderer.fitVisibleNodes()`, `SmoothForceRenderer.hoverNodeById()`, and `CameraController.previewNode()`. This links to [[Cross-Time Link Navigation]], [[Temporal Graph Time Filter Requirements]], and [[Node Search UI Contract]].

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
