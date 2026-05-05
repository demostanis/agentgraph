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

import { getClusterAnchor, SIMULATION_CONFIG } from "../config/graphConfig";
import type { GraphLink, GraphNode } from "../types";
import { assignConnectedComponentGroups, getEndpointId } from "../utils/graphComponents";

export function createForceSimulation(nodes: GraphNode[], links: GraphLink[]): Simulation<GraphNode, GraphLink> {
  assignConnectedComponentGroups(nodes, links);

  const groupById = new Map(nodes.map((node) => [node.id, node.group]));
  const getGroup = (endpoint: string | GraphNode): number => (typeof endpoint === "string" ? groupById.get(endpoint) ?? 0 : endpoint.group);
  const degreeById = new Map(nodes.map((node) => [node.id, 0]));

  links.forEach((link) => {
    const sourceId = getEndpointId(link.source);
    const targetId = getEndpointId(link.target);
    degreeById.set(sourceId, (degreeById.get(sourceId) ?? 0) + 1);
    degreeById.set(targetId, (degreeById.get(targetId) ?? 0) + 1);
  });

  const getDegree = (endpoint: string | GraphNode): number => degreeById.get(getEndpointId(endpoint)) ?? 0;
  const getMaxEndpointDegree = (link: GraphLink): number => Math.max(getDegree(link.source), getDegree(link.target));

  return forceSimulation<GraphNode>(nodes)
    .force(
      "link",
      forceLink<GraphNode, GraphLink>(links)
        .id((node) => node.id)
        .distance((link) => {
          const sameGroup = getGroup(link.source) === getGroup(link.target);
          const baseDistance = sameGroup ? link.distance : Math.max(SIMULATION_CONFIG.crossClusterMinDistance, link.distance * SIMULATION_CONFIG.crossClusterDistanceScale);
          const hubBoost = sameGroup ? Math.min(90, Math.max(0, getMaxEndpointDegree(link) - 10) * 3.4) : 0;

          return baseDistance + hubBoost;
        })
        .strength((link) => {
          const sameGroup = getGroup(link.source) === getGroup(link.target);
          const baseStrength = sameGroup
            ? SIMULATION_CONFIG.sameClusterLinkStrengthBase + link.value * SIMULATION_CONFIG.sameClusterLinkStrengthScale
            : SIMULATION_CONFIG.crossClusterLinkStrength;

          return sameGroup ? baseStrength / Math.sqrt(Math.max(1, getMaxEndpointDegree(link) / 6)) : baseStrength;
        })
        .iterations(SIMULATION_CONFIG.linkIterations),
    )
    .force("charge", forceManyBody<GraphNode>().strength((node) => SIMULATION_CONFIG.chargeBase + node.radius * SIMULATION_CONFIG.chargeRadiusScale).distanceMax(SIMULATION_CONFIG.chargeDistanceMax))
    .force(
      "collide",
      forceCollide<GraphNode>()
        .radius((node) => node.radius + SIMULATION_CONFIG.collisionPadding)
        .iterations(SIMULATION_CONFIG.collisionIterations)
        .strength(SIMULATION_CONFIG.collisionStrength),
    )
    .force("x", forceX<GraphNode>((node) => getClusterAnchor(node.group).x).strength(SIMULATION_CONFIG.clusterForceStrength))
    .force("y", forceY<GraphNode>((node) => getClusterAnchor(node.group).y).strength(SIMULATION_CONFIG.clusterForceStrength))
    .force("center", forceCenter<GraphNode>(0, 0).strength(SIMULATION_CONFIG.centerForceStrength))
    .velocityDecay(SIMULATION_CONFIG.velocityDecay)
    .alphaDecay(SIMULATION_CONFIG.alphaDecay)
    .alphaMin(SIMULATION_CONFIG.alphaMin)
    .stop();
}
