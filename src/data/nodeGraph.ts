import * as THREE from "three";

import { CLUSTERS, NODE_COLOR_HEX } from "../config/graphConfig";
import type { Graph, GraphLink, GraphNode, NodeDocument } from "../types";
import { mulberry32 } from "../utils/random";

const LINK_PATTERN = /\[\[([^\]]+)\]\]/g;
const markdownModules = import.meta.glob<string>("../../nodes/*.md", {
  eager: true,
  import: "default",
  query: "?raw",
});

export function createNodeGraph(): Graph {
  const documents = Object.entries(markdownModules)
    .map(([path, markdown]) => parseNodeDocument(path, markdown))
    .sort((a, b) => a.title.localeCompare(b.title));

  const random = mulberry32(1729);
  const nodeColor = new THREE.Color(NODE_COLOR_HEX);
  const titleToIndex = new Map(documents.map((document, index) => [normalizeTitle(document.title), index]));
  const nodes = documents.map<GraphNode>((document, index) => {
    const group = index % CLUSTERS.length;
    const cluster = CLUSTERS[group];
    const angle = random() * Math.PI * 2;
    const spread = 42 + random() * 66;
    const x = cluster.x + Math.cos(angle) * spread;
    const y = cluster.y + Math.sin(angle) * spread;

    return {
      id: document.slug,
      label: document.title,
      markdown: document.markdown,
      outboundLinks: document.links,
      group,
      radius: 9 + Math.min(8, document.markdown.length / 180),
      x,
      y,
      renderX: x,
      renderY: y,
      pulse: random() * Math.PI * 2,
      color: nodeColor.clone(),
    };
  });

  const links: GraphLink[] = [];
  const seen = new Set<string>();

  documents.forEach((document, sourceIndex) => {
    document.links.forEach((linkTitle) => {
      const targetIndex = titleToIndex.get(normalizeTitle(linkTitle));

      if (targetIndex === undefined || targetIndex === sourceIndex) {
        return;
      }

      const source = nodes[sourceIndex];
      const target = nodes[targetIndex];
      const key = [source.id, target.id].sort().join(":");

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      links.push({ source: source.id, target: target.id, value: 1.4, distance: source.group === target.group ? 100 : 170 });
    });
  });

  return { nodes, links };
}

function parseNodeDocument(path: string, markdown: string): NodeDocument {
  const slug = path.split("/").pop()?.replace(/\.md$/, "") ?? "node";
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || titleFromSlug(slug);
  const links = [...markdown.matchAll(LINK_PATTERN)].map((match) => match[1].trim()).filter(Boolean);

  return { slug, title, markdown: markdown.trim(), links };
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
