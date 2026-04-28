import { CLUSTERS } from "../config/graphConfig";
import type { GraphNode } from "../types";
import { renderMarkdown } from "../utils/markdown";

export class NodePanel {
  constructor(
    private readonly panel: HTMLElement,
    private readonly content: HTMLDivElement,
    private readonly backButton: HTMLButtonElement,
  ) {}

  show(node: GraphNode, linkCount: number): void {
    this.content.innerHTML = renderMarkdown(createNodeMarkdown(node, linkCount));
    this.panel.classList.add("is-visible");
    this.backButton.classList.add("is-visible");
  }

  hide(): void {
    this.panel.classList.remove("is-visible");
    this.backButton.classList.remove("is-visible");
  }
}

function createNodeMarkdown(node: GraphNode, linkCount: number): string {
  const cluster = CLUSTERS[node.group];

  return `
# ${node.label}

Mock documentation for the **${cluster.name}** cluster node.

## Signals

- Connected links: **${linkCount}**
- Layout position: \`${Math.round(node.renderX)}, ${Math.round(node.renderY)}\`
- Status: _active in the force graph_

## Notes

This panel is rendered from markdown and stays visually blended into the galaxy canvas. Replace this mock payload with node-specific documentation later.

\`\`\`json
{ "id": "${node.id}", "cluster": "${cluster.name}", "links": ${linkCount} }
\`\`\`
`.trim();
}
