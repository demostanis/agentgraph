import type { GraphLink, GraphNode } from "../types";

export type GraphTopology = {
  linkedNodesByNode: Array<Set<number>>;
  linkedLinksByNode: Array<Set<number>>;
};

export function createTopology(nodes: GraphNode[], links: GraphLink[]): GraphTopology {
  const nodeIndexById = new Map(nodes.map((node, index) => [node.id, index]));
  const linkedNodesByNode = nodes.map((_, index) => new Set<number>([index]));
  const linkedLinksByNode = nodes.map(() => new Set<number>());

  links.forEach((link, linkIndex) => {
    const sourceId = typeof link.source === "string" ? link.source : link.source.id;
    const targetId = typeof link.target === "string" ? link.target : link.target.id;
    const sourceIndex = nodeIndexById.get(sourceId);
    const targetIndex = nodeIndexById.get(targetId);

    if (sourceIndex === undefined || targetIndex === undefined) {
      return;
    }

    linkedNodesByNode[sourceIndex].add(targetIndex);
    linkedNodesByNode[targetIndex].add(sourceIndex);
    linkedLinksByNode[sourceIndex].add(linkIndex);
    linkedLinksByNode[targetIndex].add(linkIndex);
  });

  return { linkedNodesByNode, linkedLinksByNode };
}
