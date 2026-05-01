# Node Search Result Ranking

Node search results are sorted by pertinence before they reach the UI.

- Title matches receive more weight than body matches.
- Exact title matches outrank prefix matches, which outrank title contains matches.
- Lines containing all query terms or the full query phrase gain relevance.
- Multiple submatches in a line increase the score.
- Earlier match lines break ties, then titles provide deterministic ordering.
- The excerpt comes from the best-scoring match for that node, not necessarily the first raw match.

This ranking belongs to [[Rg Backed Node Search Command]] and satisfies [[Node Search Requirements]].

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
