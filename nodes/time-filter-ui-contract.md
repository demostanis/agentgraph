# Time Filter UI Contract

The time filter should be compact by default and reveal detail only when requested.

- The default collapsed state shows a label and a down chevron, with no slider visible.
- When all nodes are selected, the label reads `All time`.
- The filter box should fit its content rather than using a large fixed panel width.
- Clicking the chevron expands or collapses the slider.
- Expanding and collapsing animate width and height changes.
- The expanded state shows the smooth slider handles; double-clicking the expanded control toggles fixed mode and span mode.
- The visual treatment is dark, transparent, top-centered, and avoids circular slider thumbs.

This UI supports [[Temporal Graph Time Filter Requirements]] and must stay consistent with [[Smart Time Bucket Filtering]].
