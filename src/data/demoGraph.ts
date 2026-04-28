import * as THREE from "three";

import { CLUSTERS, NODE_COLOR_HEX } from "../config/graphConfig";
import type { Graph, GraphLink, GraphNode } from "../types";
import { mulberry32 } from "../utils/random";

export function createDemoGraph(): Graph {
  const random = mulberry32(1729);
  const archiveGroup = CLUSTERS.length - 1;
  const nodeColor = new THREE.Color(NODE_COLOR_HEX);
  const nodes: GraphNode[] = Array.from({ length: 168 }, (_, index) => {
    const group = index % archiveGroup;
    const cluster = CLUSTERS[group];
    const angle = random() * Math.PI * 2;
    const spread = 46 + random() * 62;
    const x = cluster.x + Math.cos(angle) * spread;
    const y = cluster.y + Math.sin(angle) * spread;

    return {
      id: `node-${index + 1}`,
      label: `${cluster.name} ${index + 1}`,
      group,
      radius: 6 + random() * 8,
      x,
      y,
      renderX: x,
      renderY: y,
      pulse: random() * Math.PI * 2,
      color: nodeColor.clone(),
    };
  });

  const archiveStart = nodes.length;
  const archiveCluster = CLUSTERS[archiveGroup];
  Array.from({ length: 44 }, (_, index) => {
    const angle = random() * Math.PI * 2;
    const spread = 32 + random() * 70;
    const x = archiveCluster.x + Math.cos(angle) * spread;
    const y = archiveCluster.y + Math.sin(angle) * spread;

    nodes.push({
      id: `archive-${index + 1}`,
      label: `${archiveCluster.name} ${index + 1}`,
      group: archiveGroup,
      radius: 5 + random() * 7,
      x,
      y,
      renderX: x,
      renderY: y,
      pulse: random() * Math.PI * 2,
      color: nodeColor.clone(),
    });
  });

  const links: GraphLink[] = [];
  const seen = new Set<string>();

  const addLink = (sourceIndex: number, targetIndex: number, value: number, distance: number): void => {
    const source = nodes[sourceIndex];
    const target = nodes[targetIndex];
    const key = [source.id, target.id].sort().join(":");

    if (source.id === target.id || seen.has(key)) {
      return;
    }

    seen.add(key);
    links.push({ source: source.id, target: target.id, value, distance });
  };

  nodes.forEach((node, index) => {
    const clusterMate = nodes.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.group === node.group);
    addLink(index, clusterMate > -1 ? clusterMate : (index + CLUSTERS.length) % nodes.length, 1.4, 54 + random() * 34);

    if (index % 2 === 0) {
      addLink(index, (index + 7 + Math.floor(random() * 19)) % nodes.length, 0.8, 110 + random() * 50);
    }

    if (index % 9 === 0) {
      addLink(index, (index + 31) % nodes.length, 1.9, 145 + random() * 70);
    }
  });

  for (let index = 0; index < nodes.length - 1; index += 1) {
    if (index % 3 === 0) {
      addLink(index, Math.floor(random() * (nodes.length - 1)), 0.45, 180 + random() * 120);
    }

    if (index % 11 === 0) {
      addLink(index, Math.floor(random() * (nodes.length - 1)), 0.35, 230 + random() * 160);
    }
  }

  for (let index = archiveStart; index < nodes.length; index += 1) {
    addLink(index, archiveStart + ((index - archiveStart + 3) % (nodes.length - archiveStart)), 1.1, 48 + random() * 26);

    if (index % 4 === 0) {
      addLink(index, archiveStart + Math.floor(random() * (nodes.length - archiveStart)), 0.9, 72 + random() * 36);
    }
  }

  [7, 29, 83].forEach((coreIndex, bridgeIndex) => {
    addLink(coreIndex, archiveStart + bridgeIndex * 9, 0.28, 260 + random() * 90);
  });

  return { nodes, links };
}
