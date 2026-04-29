# Node Search UI Contract

The search UI should feel like an app-level search control, not a command-line wrapper.

- The input placeholder is `Search nodes...`.
- The helper text below the empty search bar is hidden.
- Status text appears only for active searching, no matches, errors, or result counts.
- Result cards show the node title and content excerpt only.
- The cards must not show line numbers, `title match`, `content match`, or other implementation metadata.
- The mobile layout keeps the search control below the time filter and hides it when a node panel is selected.

This presentation complements [[Visual Design System]] and consumes ranked results from [[Node Search Result Ranking]].
