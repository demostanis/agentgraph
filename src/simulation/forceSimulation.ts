import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";

import { CLUSTERS, SIMULATION_CONFIG } from "../config/graphConfig";
import type { GraphLink, GraphNode } from "../types";

export function createForceSimulation(nodes: GraphNode[], links: GraphLink[]): Simulation<GraphNode, GraphLink> {
  const groupById = new Map(nodes.map((node) => [node.id, node.group]));
  const getGroup = (endpoint: string | GraphNode): number => (typeof endpoint === "string" ? groupById.get(endpoint) ?? 0 : endpoint.group);

  return forceSimulation<GraphNode>(nodes)
    .force(
      "link",
      forceLink<GraphNode, GraphLink>(links)
        .id((node) => node.id)
        .distance((link) => {
          const sameGroup = getGroup(link.source) === getGroup(link.target);
          return sameGroup ? link.distance : Math.max(SIMULATION_CONFIG.crossClusterMinDistance, link.distance * SIMULATION_CONFIG.crossClusterDistanceScale);
        })
        .strength((link) => {
          const sameGroup = getGroup(link.source) === getGroup(link.target);
          return sameGroup
            ? SIMULATION_CONFIG.sameClusterLinkStrengthBase + link.value * SIMULATION_CONFIG.sameClusterLinkStrengthScale
            : SIMULATION_CONFIG.crossClusterLinkStrength;
        })
        .iterations(2),
    )
    .force("charge", forceManyBody<GraphNode>().strength((node) => SIMULATION_CONFIG.chargeBase + node.radius * SIMULATION_CONFIG.chargeRadiusScale).distanceMax(SIMULATION_CONFIG.chargeDistanceMax))
    .force(
      "collide",
      forceCollide<GraphNode>()
        .radius((node) => node.radius + SIMULATION_CONFIG.collisionPadding)
        .iterations(SIMULATION_CONFIG.collisionIterations)
        .strength(SIMULATION_CONFIG.collisionStrength),
    )
    .force("x", forceX<GraphNode>((node) => CLUSTERS[node.group].x).strength(SIMULATION_CONFIG.clusterForceStrength))
    .force("y", forceY<GraphNode>((node) => CLUSTERS[node.group].y).strength(SIMULATION_CONFIG.clusterForceStrength))
    .force("center", forceCenter<GraphNode>(0, 0).strength(SIMULATION_CONFIG.centerForceStrength))
    .velocityDecay(SIMULATION_CONFIG.velocityDecay)
    .alphaDecay(SIMULATION_CONFIG.alphaDecay)
    .alphaMin(SIMULATION_CONFIG.alphaMin)
    .stop();
}
