# Node Management Scripts

Repository scripts are the intended way to maintain the Markdown node graph from the CLI.

- `./scripts/add-node.sh "Title" "Body"` creates `nodes/<slug>.md` with a generated slug and a leading H1 title.
- `./scripts/edit-node-content.sh "Title or slug"` replaces a node body while preserving the title line.
- `./scripts/get-node-content.sh`, `./scripts/search-nodes-by-title.sh`, and `./scripts/search-nodes-by-content.sh` support inspection before edits.
- `./scripts/check-node-links.sh` verifies that every non-code-fence double-bracket wiki link resolves to an existing node title.
- npm aliases in `package.json` expose the same tools as `npm run node:add --`, `npm run node:edit --`, and related commands.

These scripts protect the graph described in [[Markdown Node Graph Data Pipeline]] and should be run before relying on [[Build And Runtime Commands]].

This belongs to [[AgentGraph Project Overview]] as part of the AgentGraph project knowledge graph.
