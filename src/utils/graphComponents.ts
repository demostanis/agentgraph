import type { GraphLink, GraphNode } from "../types";

export function assignConnectedComponentGroups(nodes: GraphNode[], links: GraphLink[]): void {
  const parents = new Map<string, string>();
  const ranks = new Map<string, number>();

  nodes.forEach((node) => {
    parents.set(node.id, node.id);
    ranks.set(node.id, 0);
  });

  const find = (id: string): string => {
    const parent = parents.get(id);

    if (!parent) {
      return id;
    }

    if (parent === id) {
      return parent;
    }

    const root = find(parent);
    parents.set(id, root);
    return root;
  };

  const union = (left: string, right: string): void => {
    if (!parents.has(left) || !parents.has(right)) {
      return;
    }

    let leftRoot = find(left);
    let rightRoot = find(right);

    if (leftRoot === rightRoot) {
      return;
    }

    const leftRank = ranks.get(leftRoot) ?? 0;
    const rightRank = ranks.get(rightRoot) ?? 0;

    if (leftRank < rightRank) {
      [leftRoot, rightRoot] = [rightRoot, leftRoot];
    }

    parents.set(rightRoot, leftRoot);

    if (leftRank === rightRank) {
      ranks.set(leftRoot, leftRank + 1);
    }
  };

  links.forEach((link) => {
    union(getEndpointId(link.source), getEndpointId(link.target));
  });

  const componentNodesByRoot = new Map<string, GraphNode[]>();
  const componentFirstIndexByRoot = new Map<string, number>();

  nodes.forEach((node, index) => {
    const root = find(node.id);
    const componentNodes = componentNodesByRoot.get(root);

    if (componentNodes) {
      componentNodes.push(node);
    } else {
      componentNodesByRoot.set(root, [node]);
      componentFirstIndexByRoot.set(root, index);
    }
  });

  [...componentNodesByRoot.entries()]
    .sort((left, right) => {
      const sizeDelta = right[1].length - left[1].length;

      if (sizeDelta !== 0) {
        return sizeDelta;
      }

      return (componentFirstIndexByRoot.get(left[0]) ?? 0) - (componentFirstIndexByRoot.get(right[0]) ?? 0);
    })
    .forEach(([, componentNodes], group) => {
      componentNodes.forEach((node) => {
        node.group = group;
      });
    });
}

export function getEndpointId(endpoint: string | GraphNode): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}
