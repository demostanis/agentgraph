# Graph Camera Follow Behavior

The camera follows graph motion by default, but user intent overrides it.

- When no node is selected and the user has not moved the camera manually, the camera continuously refits to the visible graph as the simulation moves.
- Changing the time filter refits the camera to the current visible node set.
- Manual pan or wheel zoom disables graph auto-follow.
- Selecting a node disables graph auto-follow and preserves selected-node camera follow.
- Clearing the selected node re-enables graph auto-follow for the visible graph.
- Cross-time link navigation selects the target node after changing the time span, so the camera follows that selected node.

Implementation touches `SmoothForceRenderer.fitVisibleNodes()` and `CameraController.fitNodes()`. This links to [[Cross-Time Link Navigation]] and [[Temporal Graph Time Filter Requirements]].
