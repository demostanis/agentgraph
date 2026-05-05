---
name: conversation-node-summarizer
description: Turn a conversation, chat transcript, planning thread, meeting notes, or agent run into a small parented set of linked Markdown nodes for the local node graph. Use this skill whenever the user asks to summarize/create nodes/graph a conversation, split a transcript into linked cards, capture decisions/constraints/actions/artifacts, or use the repository's ./scripts node tools. The output should be minimal but technically rich when useful: one parent project node plus focused child nodes with code fences, Mermaid diagrams, Markdown tables, wiki links, and external source links.
---

# Conversation Node Summarizer

Build a minimal node graph that still carries the technical nouns and evidence a future reader needs. The graph should feel like durable project memory, not a transcript recap: one strong parent node, a few focused child nodes, direct prose, and rich Markdown only where it improves understanding.

## Output Shape

Create 5-7 nodes for a substantial technical conversation; create fewer for a tiny chat and only exceed this range when the transcript contains genuinely separate projects or architectural decisions.

- One parent node is mandatory and must link to every child node.
- Child nodes should be concise: one direct paragraph plus focused bullets, a small table, a short code block, or one diagram only when it adds real value.
- Include technical topics when present: schemas/contracts, problem/error payloads, route/API shape, source-doc links, reusable commands, failures/fixes, and final artifact state.
- Do not create glossary-style nodes unless a term is central to the implementation.
- Do not create a standalone verification or command-history node unless command behavior is itself the durable subject.

## Parent Node Requirements

The parent node is the landing page. Title it with the project, artifact, product, repository, or workstream name, not a generic label like `Conversation Summary` or `Concept Map`.

The parent body should include:

- A one-paragraph description of what the project/artifact is.
- Main technologies as inline code names with their roles.
- Current outcome or final artifact state.
- A compact linked map of every child node.
- Main reusable commands or URLs when they help future work, not as a transcript of what ran.
- Optional external Markdown links for source docs, e.g. `[Effect PubSub](https://effect.website/docs/concurrency/pubsub/)`.

Parent body template:

```markdown
[Project] is [description] built with `Technology`, `Technology`, and `Technology`. The final artifact [current useful state].

- Main technologies: `A` for [role], `B` for [role], `C` for [role].
- Useful entry points: `command`, `command`, `/url`.
- Source docs: [Source Name](https://example.com) and [Other Source](https://example.com).
- [[Child Node]] captures [specific topic].
- [[Another Child Node]] captures [specific topic].
```

## Child Node Style

Use natural, direct sentences. Do not repeat formulaic scaffolding such as "This node summarizes", "The concept matters because", or `## Meaning Here`.

Child body template:

```markdown
[Specific technical or product fact] is the durable point future work should preserve.

- Detail with path, command, API, schema, error, source URL, or consequence.
- Detail with why it matters for future work.
- See [[Parent Node]] for the full project map.
```

Good child node shape:

```markdown
# Todo SSE Streaming Contract

`GET /todos/events` streams append-only todo events as Server-Sent Events and supports resuming from a sequence number.

- Resume state comes from `?after=<sequence>` or the `Last-Event-ID` header.
- Each chunk uses the event sequence as `id`, the event type as `event`, and a serialized `TodoEvent` as `data`.
- This depends on [[Todo Event Sourced Repository Shape]] for backlog and live events.
```

## Rich Markdown Evidence

Use Markdown features as evidence, not decoration.

- Use fenced code blocks with language tags for reusable implementation patterns, schema definitions, route shapes, config fragments, or tiny command groups. Prefer 1-2 short code blocks across the whole graph when code exists; avoid dumping patches.
- Use Mermaid diagrams when a small architecture, data-flow, dependency, or debugging flow is clearer visually. Usually 0-1 diagram per graph is enough.
- Use Markdown tables for compact contracts such as routes, schema roles, file responsibilities, event types, or command entry points.
- Use `[label](url)` Markdown links for external docs and `[[Exact Node Title]]` wiki links only for local graph nodes.
- Keep code, diagrams, and tables small enough that the node still reads quickly.

Good rich evidence examples:

```markdown
| Route | Purpose | Schema |
| --- | --- | --- |
| `GET /health` | Health check | `Health` |
| `POST /todos` | Create todo | `CreateTodo` -> `Todo` |
```

```ts
const standard = <A, I>(schema: Schema.Schema<A, I, never>) =>
  Schema.standardSchemaV1(schema) as any
```

```mermaid
flowchart LR
  EffectSchema[Effect Schema contracts] --> Standard[Schema.standardSchemaV1]
  Standard --> Elysia[Elysia route validators]
  EffectSchema --> JsonSchema[JSONSchema.make]
  JsonSchema --> OpenAPI[@elysia/openapi docs]
```

## Keep Criteria

Keep a fact if it explains:

- What exists now.
- How the main technologies fit together.
- Which schemas, API contracts, routes, event types, or problem responses shape behavior.
- Which source docs or external links influenced the final design.
- Which reusable command, file path, or URL helps continue the work.
- Which failure/fix prevents repeated debugging.
- Which unresolved risk changes the next action.

## Operational Noise Filter

Operational events are not durable nodes by themselves. Convert them into reusable context or drop them.

- Keep commands as entry points, contracts, or diagnostic evidence; do not preserve a command just because it completed.
- Keep verification only when it establishes a baseline that changes future expectations, and usually place it as a bullet in the parent or artifact node instead of making a separate node.
- Drop delivery and environment chatter: notification/delivery notes, preview or screenshot handoff, tool session mechanics, dependency-install summaries, generic verification lines, and assistant final-message boilerplate.
- Drop tool chronology and assistant self-reporting unless a failed operation caused a technical decision.

Better:

```markdown
`Schema.standardSchemaV1` became the adapter because Elysia route validators expected Standard Schema-compatible objects, while Effect JSON Schema still fed the OpenAPI mapping.
```

Worse:

```markdown
The dependencies were installed and the final checks completed successfully.
```

## Existing Graph Behavior

Treat the node graph as living documentation, not an append-only transcript.

- Search the selected node directory before creating nodes.
- If an existing node already explains the same artifact, behavior, or project, update it so the current truth is centralized.
- Do not create old-state and new-state nodes unless the historical contrast is itself useful future knowledge.
- Prefer clearer titles over numbered variants when title conflicts exist.

## Repository Tools

Use these scripts from the repository root. They read and write `${AG_NODES_DIR:-~/.local/share/agentgraph/nodes}`; set `AG_NODES_DIR` when the caller wants a different graph.

| Purpose | Script | npm alias |
| --- | --- | --- |
| Add a new node | `./scripts/add-node.sh` | `npm run node:add --` |
| Replace a node body while preserving its title | `./scripts/edit-node-content.sh` | `npm run node:edit --` |
| Read a node | `./scripts/get-node-content.sh` | `npm run node:get --` |
| Search titles | `./scripts/search-nodes-by-title.sh` | `npm run node:search:title --` |
| Search bodies | `./scripts/search-nodes-by-content.sh` | `npm run node:search:content --` |
| Verify `[[Wiki Links]]` resolve | `./scripts/check-node-links.sh` | `npm run node:check-links` |

Important: `add-node.sh` writes the `# Title` heading for you. Pass only the node body as the second argument; do not include a Markdown heading in the body.

## Script Workflow

1. Identify the project/artifact name from the conversation, directory, repo, package, remote, or branch when available.
2. Read the transcript enough to identify the final artifact, technologies, key contracts, source links, reusable commands, code patterns, diagrams, and fixes.
3. Search the node directory before adding nodes.
4. Create the parent node first, then create supporting nodes; edit the parent if final child titles change.
5. Use the repository scripts for every node write with the same `AG_NODES_DIR`.
6. Run `./scripts/check-node-links.sh` with that `AG_NODES_DIR`.
7. If links are missing, create the target node or revise the link text to an existing title.

## Quality Checklist

Before responding, check the graph against this list:

- The parent node names the project/artifact and links to every child node.
- Every `[[Wiki Link]]` points to an existing node title.
- The graph is small enough to browse quickly but preserves the main technical contracts.
- Node bodies do not duplicate their own titles; the first sentence adds context, consequence, or rationale beyond the heading.
- Rich Markdown evidence appears where it improves understanding, not as decoration.
- Commands, verification, installs, and delivery notes are not standalone status nodes.
- Existing nodes are updated instead of contradicted by newer duplicate nodes.

## Edge Cases

- If the conversation is tiny, create only the parent node and any child node that adds future value.
- If the user explicitly wants exhaustive coverage, make more nodes but still keep each node meaningful.
- If the transcript includes sensitive data, summarize the operational point without copying secrets.
