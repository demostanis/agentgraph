import type { Cluster } from "../types";

export const CLUSTERS: Cluster[] = [
  { name: "Signals", x: -650, y: -230 },
  { name: "Models", x: -330, y: 290 },
  { name: "Pipelines", x: 40, y: -300 },
  { name: "Products", x: 420, y: 280 },
  { name: "Ops", x: 720, y: -150 },
  { name: "Archives", x: -840, y: 280 },
];

export const NODE_COLOR_HEX = "#ffffff";
export const ACCENT_COLOR_HEX = "#a855f7";

export const CAMERA_CONFIG = {
  fitWidth: 2300,
  fitHeight: 1200,
  minFitZoom: 0.45,
  maxFitZoom: 1.15,
  minZoom: 0.32,
  maxZoom: 4.5,
  selectedZoom: 1.45,
  mobilePanelWidthRatio: 0.82,
  mobilePanelTopRatio: 0.35,
  minSafeZoom: 0.001,
} as const;

export const SIMULATION_CONFIG = {
  crossClusterMinDistance: 560,
  crossClusterDistanceScale: 2.35,
  sameClusterLinkStrengthBase: 0.05,
  sameClusterLinkStrengthScale: 0.045,
  crossClusterLinkStrength: 0.0035,
  chargeBase: -98,
  chargeRadiusScale: -5,
  chargeDistanceMax: 390,
  collisionPadding: 7,
  collisionIterations: 2,
  collisionStrength: 0.82,
  clusterForceStrength: 0.09,
  centerForceStrength: 0.004,
  velocityDecay: 0.35,
  alphaDecay: 0.018,
  alphaMin: 0.0015,
} as const;
