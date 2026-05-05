import * as THREE from "three";

import { getClusterAnchor, NODE_COLOR_HEX, SIMULATION_CONFIG } from "../config/graphConfig";
import type { Graph, GraphLink, GraphNode, NodeDocument, NodeSearchResult } from "../types";
import { assignConnectedComponentGroups } from "../utils/graphComponents";
import { mulberry32 } from "../utils/random";

const LINK_PATTERN = /\[\[([^\]]+)\]\]/g;
const NODES_CHANGED_EVENT = "nodes://changed";

type RuntimeNodeFile = {
  path: string;
  markdown: string;
  modifiedTimeMs?: number;
};

export async function loadNodeGraph(): Promise<Graph> {
  return createGraph(await loadNodeDocuments());
}

export async function watchNodeGraph(onChange: () => void): Promise<() => void> {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen(NODES_CHANGED_EVENT, onChange);
  } catch {
    return () => undefined;
  }
}

export async function searchNodes(query: string): Promise<NodeSearchResult[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<NodeSearchResult[]>("search_nodes", { query });
}

function createGraph(documents: NodeDocument[]): Graph {
  const sortedDocuments = documents.sort((a, b) => a.title.localeCompare(b.title));

  const random = mulberry32(1729);
  const nodeColor = new THREE.Color(NODE_COLOR_HEX);
  const titleToIndex = new Map(sortedDocuments.map((document, index) => [normalizeTitle(document.title), index]));
  const nodes = sortedDocuments.map<GraphNode>((document) => {
    return {
      id: document.slug,
      label: document.title,
      markdown: document.markdown,
      timeMs: document.timeMs,
      outboundLinks: document.links,
      group: 0,
      radius: 9 + Math.min(8, document.markdown.length / 180),
      x: 0,
      y: 0,
      renderX: 0,
      renderY: 0,
      pulse: random() * Math.PI * 2,
      color: nodeColor.clone(),
    };
  });

  const links: GraphLink[] = [];
  const seen = new Set<string>();

  sortedDocuments.forEach((document, sourceIndex) => {
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
      links.push({ source: source.id, target: target.id, value: 1.4, distance: SIMULATION_CONFIG.linkDistance });
    });
  });

  assignConnectedComponentGroups(nodes, links);
  seedNodePositions(nodes, random);

  return { nodes, links };
}

function seedNodePositions(nodes: GraphNode[], random: () => number): void {
  nodes.forEach((node) => {
    const cluster = getClusterAnchor(node.group);
    const angle = random() * Math.PI * 2;
    const spread = SIMULATION_CONFIG.initialClusterSpreadBase + random() * SIMULATION_CONFIG.initialClusterSpreadRange;
    const x = cluster.x + Math.cos(angle) * spread;
    const y = cluster.y + Math.sin(angle) * spread;

    node.x = x;
    node.y = y;
    node.renderX = x;
    node.renderY = y;
  });
}

async function loadNodeDocuments(): Promise<NodeDocument[]> {
  const runtimeNodeFiles = await readRuntimeNodeFiles();

  if (runtimeNodeFiles) {
    return runtimeNodeFiles.map(({ path, markdown, modifiedTimeMs }) => parseNodeDocument(path, markdown, modifiedTimeMs));
  }

  return [];
}

async function readRuntimeNodeFiles(): Promise<RuntimeNodeFile[] | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<RuntimeNodeFile[]>("read_node_files");
  } catch {
    return null;
  }
}

function parseNodeDocument(path: string, markdown: string, modifiedTimeMs?: number): NodeDocument {
  const slug = path.split(/[\\/]/).pop()?.replace(/\.md$/, "") ?? "node";
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || titleFromSlug(slug);
  const links = [...markdown.matchAll(LINK_PATTERN)].map((match) => match[1].trim()).filter(Boolean);
  const timeMs = modifiedTimeMs ?? Date.now();

  return { slug, title, markdown: markdown.trim(), timeMs, links };
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
