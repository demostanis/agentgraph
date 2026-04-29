import type { SimulationLinkDatum, SimulationNodeDatum } from "d3-force";
import type { Color } from "three";

export type Cluster = {
  name: string;
  x: number;
  y: number;
};

export type InteractionMode = "idle" | "drag-node" | "pan-camera";

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  markdown: string;
  timeMs: number;
  outboundLinks: string[];
  group: number;
  radius: number;
  renderX: number;
  renderY: number;
  pulse: number;
  color: Color;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
  distance: number;
}

export type Graph = {
  nodes: GraphNode[];
  links: GraphLink[];
};

export type NodeDocument = {
  slug: string;
  title: string;
  markdown: string;
  timeMs: number;
  links: string[];
};

export type NodeSearchResult = {
  id: string;
  title: string;
  excerpt: string;
  matchLine: number;
  matchKind: "title" | "content";
};
