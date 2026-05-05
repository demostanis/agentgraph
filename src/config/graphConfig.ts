import type { Cluster } from "../types";

export const CLUSTERS: Cluster[] = [
  { name: "Core", x: 0, y: 0 },
  { name: "Northwest", x: -1350, y: -680 },
  { name: "Northeast", x: 1350, y: -680 },
  { name: "Southeast", x: 1350, y: 680 },
  { name: "Southwest", x: -1350, y: 680 },
  { name: "South", x: 0, y: 1320 },
];

export const COMPONENT_ANCHOR_CONFIG = {
  fallbackRadius: 1720,
  fallbackRingGap: 720,
} as const;

export const NODE_COLOR_HEX = "#ffffff";
export const ACCENT_COLOR_HEX = "#a855f7";

export const CAMERA_CONFIG = {
  fitWidth: 3100,
  fitHeight: 1700,
  minFitZoom: 0.28,
  maxFitZoom: 0.9,
  minZoom: 0.2,
  maxZoom: 4.5,
  selectedZoom: 1.45,
  hoverPreviewZoom: 1.08,
  mobilePanelWidthRatio: 0.82,
  mobilePanelTopRatio: 0.35,
  minSafeZoom: 0.001,
} as const;

export const SIMULATION_CONFIG = {
  linkDistance: 145,
  linkIterations: 3,
  initialClusterSpreadBase: 74,
  initialClusterSpreadRange: 112,
  crossClusterMinDistance: 820,
  crossClusterDistanceScale: 3.1,
  sameClusterLinkStrengthBase: 0.035,
  sameClusterLinkStrengthScale: 0.025,
  crossClusterLinkStrength: 0.0015,
  chargeBase: -142,
  chargeRadiusScale: -5.6,
  chargeDistanceMax: 620,
  collisionPadding: 12,
  collisionIterations: 2,
  collisionStrength: 0.9,
  clusterForceStrength: 0.035,
  centerForceStrength: 0.002,
  velocityDecay: 0.38,
  alphaDecay: 0.018,
  alphaMin: 0.0015,
} as const;

export function getClusterAnchor(group: number): Cluster {
  const preset = CLUSTERS[group];

  if (preset) {
    return preset;
  }

  const extraIndex = Math.max(0, group - CLUSTERS.length);
  const ring = Math.floor(extraIndex / CLUSTERS.length) + 1;
  const slot = extraIndex % CLUSTERS.length;
  const angle = ((slot + (ring % 2) * 0.5) / CLUSTERS.length) * Math.PI * 2 + ring * 0.18;
  const radius = COMPONENT_ANCHOR_CONFIG.fallbackRadius + (ring - 1) * COMPONENT_ANCHOR_CONFIG.fallbackRingGap;

  return {
    name: `Component ${group + 1}`,
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}
