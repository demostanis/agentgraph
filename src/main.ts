import "./styles.css";

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import * as THREE from "three";

type Cluster = {
  name: string;
  x: number;
  y: number;
};

type InteractionMode = "idle" | "drag-node" | "pan-camera";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  group: number;
  radius: number;
  renderX: number;
  renderY: number;
  pulse: number;
  color: THREE.Color;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
  distance: number;
}

const CLUSTERS: Cluster[] = [
  { name: "Signals", x: -650, y: -230 },
  { name: "Models", x: -330, y: 290 },
  { name: "Pipelines", x: 40, y: -300 },
  { name: "Products", x: 420, y: 280 },
  { name: "Ops", x: 720, y: -150 },
  { name: "Archives", x: -840, y: 280 },
];

const NODE_COLOR = new THREE.Color("#ffffff");
const ACCENT_COLOR = new THREE.Color("#a855f7");

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

app.innerHTML = `
  <main class="shell">
    <div id="graph-stage" class="graph-stage" aria-label="2D D3 force graph rendered by Three.js"></div>
    <button id="back-button" class="back-button" type="button" aria-label="Show entire graph">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15.5 5.5 9 12l6.5 6.5" />
        <path d="M10 12h10" />
      </svg>
      <span>All nodes</span>
    </button>
    <aside id="node-panel" class="node-panel" aria-live="polite" aria-label="Selected node details">
      <div class="node-panel__inner">
        <p class="node-panel__eyebrow">Node document</p>
        <div id="node-content" class="node-content"></div>
      </div>
    </aside>
  </main>
`;

const stage = document.querySelector<HTMLDivElement>("#graph-stage");
const backButton = document.querySelector<HTMLButtonElement>("#back-button");
const nodePanel = document.querySelector<HTMLElement>("#node-panel");
const nodeContent = document.querySelector<HTMLDivElement>("#node-content");

if (!stage || !backButton || !nodePanel || !nodeContent) {
  throw new Error("Renderer UI could not be initialized.");
}

function createDemoGraph(): { nodes: GraphNode[]; links: GraphLink[] } {
  const random = mulberry32(1729);
  const archiveGroup = CLUSTERS.length - 1;
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
      color: NODE_COLOR.clone(),
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
      color: NODE_COLOR.clone(),
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

function createForceSimulation(nodes: GraphNode[], links: GraphLink[]): Simulation<GraphNode, GraphLink> {
  const groupById = new Map(nodes.map((node) => [node.id, node.group]));
  const getGroup = (endpoint: string | GraphNode): number => (typeof endpoint === "string" ? groupById.get(endpoint) ?? 0 : endpoint.group);

  return forceSimulation<GraphNode>(nodes)
    .force(
      "link",
      forceLink<GraphNode, GraphLink>(links)
        .id((node) => node.id)
        .distance((link) => {
          const sameGroup = getGroup(link.source) === getGroup(link.target);
          return sameGroup ? link.distance : Math.max(560, link.distance * 2.35);
        })
        .strength((link) => {
          const sameGroup = getGroup(link.source) === getGroup(link.target);
          return sameGroup ? 0.05 + link.value * 0.045 : 0.0035;
        })
        .iterations(2),
    )
    .force("charge", forceManyBody<GraphNode>().strength((node) => -98 - node.radius * 5).distanceMax(390))
    .force("collide", forceCollide<GraphNode>().radius((node) => node.radius + 7).iterations(2).strength(0.82))
    .force("x", forceX<GraphNode>((node) => CLUSTERS[node.group].x).strength(0.09))
    .force("y", forceY<GraphNode>((node) => CLUSTERS[node.group].y).strength(0.09))
    .force("center", forceCenter<GraphNode>(0, 0).strength(0.004))
    .velocityDecay(0.35)
    .alphaDecay(0.018)
    .alphaMin(0.0015)
    .stop();
}

class SmoothForceRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private readonly webgl: THREE.WebGLRenderer;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(-10, -10);
  private readonly matrix = new THREE.Object3D();
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;
  private readonly nodeLabels: HTMLSpanElement[];
  private readonly nodeGlowGeometry = new THREE.BufferGeometry();
  private readonly hoverGlowGeometry = new THREE.BufferGeometry();
  private readonly nodeGlowMaterial: THREE.ShaderMaterial;
  private readonly hoverGlowMaterial: THREE.ShaderMaterial;
  private readonly nodeGlowPositions: Float32Array;
  private readonly nodeGlowSizes: Float32Array;
  private readonly nodeGlowOpacities: Float32Array;
  private readonly hoverGlowPositions: Float32Array;
  private readonly hoverGlowSizes: Float32Array;
  private readonly hoverGlowOpacities: Float32Array;
  private readonly nodeMesh: THREE.InstancedMesh;
  private readonly connectedNodeMesh: THREE.InstancedMesh;
  private readonly accentNodeMesh: THREE.InstancedMesh;
  private readonly dimPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly dimMaterial: THREE.MeshBasicMaterial;
  private readonly connectedNodeMaterial: THREE.MeshBasicMaterial;
  private readonly accentNodeMaterial: THREE.MeshBasicMaterial;
  private readonly linkGeometry = new THREE.BufferGeometry();
  private readonly linkPositions: Float32Array;
  private readonly highlightLinkGeometry = new THREE.BufferGeometry();
  private readonly highlightLinkPositions: Float32Array;
  private readonly highlightLinkMaterial: THREE.LineBasicMaterial;
  private overlayLevel = 0;
  private readonly focusLevels: number[];
  private readonly linkedNodesByNode: Array<Set<number>>;
  private readonly linkedLinksByNode: Array<Set<number>>;
  private readonly dragOffset = new THREE.Vector2();
  private readonly panAnchor = new THREE.Vector2();
  private readonly pointerDownScreen = new THREE.Vector2();
  private readonly targetPosition = new THREE.Vector2();
  private readonly fixedStep = 1 / 60;
  private animationFrame = 0;
  private accumulator = 0;
  private targetZoom = 1;
  private draggedNode: GraphNode | null = null;
  private pointerDownNodeIndex = -1;
  private selectedIndex = -1;
  private selectionAutoFollow = false;
  private hoveredIndex = -1;
  private interactionMode: InteractionMode = "idle";
  private didSetInitialView = false;

  constructor(
    private readonly container: HTMLDivElement,
    private readonly backButton: HTMLButtonElement,
    private readonly nodePanel: HTMLElement,
    private readonly nodeContent: HTMLDivElement,
    private readonly nodes: GraphNode[],
    private readonly links: GraphLink[],
    private readonly simulation: Simulation<GraphNode, GraphLink>,
  ) {
    this.webgl = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.webgl.setClearColor(0x000000, 0);
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webgl.domElement.style.touchAction = "none";
    this.container.appendChild(this.webgl.domElement);
    this.nodeLabels = this.nodes.map((node) => {
      const label = document.createElement("span");
      label.className = "node-label";
      label.textContent = node.label;
      this.container.appendChild(label);
      return label;
    });

    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    this.linkPositions = new Float32Array(this.links.length * 6);
    this.highlightLinkPositions = new Float32Array(this.links.length * 6);
    this.focusLevels = this.nodes.map(() => 0);
    const topology = this.createTopology();
    this.linkedNodesByNode = topology.linkedNodesByNode;
    this.linkedLinksByNode = topology.linkedLinksByNode;
    this.linkGeometry.setAttribute("position", new THREE.BufferAttribute(this.linkPositions, 3).setUsage(THREE.DynamicDrawUsage));

    const linkMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.58,
      depthTest: false,
      depthWrite: false,
    });
    const linkSegments = new THREE.LineSegments(this.linkGeometry, linkMaterial);
    linkSegments.frustumCulled = false;
    linkSegments.renderOrder = 1;
    this.scene.add(linkSegments);

    this.highlightLinkGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.highlightLinkPositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.highlightLinkGeometry.setDrawRange(0, 0);
    this.highlightLinkMaterial = new THREE.LineBasicMaterial({
      color: ACCENT_COLOR,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    const highlightLinkSegments = new THREE.LineSegments(this.highlightLinkGeometry, this.highlightLinkMaterial);
    highlightLinkSegments.frustumCulled = false;
    highlightLinkSegments.renderOrder = 5;
    this.scene.add(highlightLinkSegments);

    const nodeGeometry = new THREE.CircleGeometry(1, 48);
    const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthTest: false, depthWrite: false });

    this.nodeGlowPositions = new Float32Array(this.nodes.length * 3);
    this.nodeGlowSizes = new Float32Array(this.nodes.length);
    this.nodeGlowOpacities = new Float32Array(this.nodes.length).fill(0.5);
    this.hoverGlowPositions = new Float32Array(this.nodes.length * 3);
    this.hoverGlowSizes = new Float32Array(this.nodes.length);
    this.hoverGlowOpacities = new Float32Array(this.nodes.length);
    this.nodeGlowGeometry.setAttribute("position", new THREE.BufferAttribute(this.nodeGlowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.nodeGlowGeometry.setAttribute("pointSize", new THREE.BufferAttribute(this.nodeGlowSizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.nodeGlowGeometry.setAttribute("pointOpacity", new THREE.BufferAttribute(this.nodeGlowOpacities, 1).setUsage(THREE.DynamicDrawUsage));
    this.hoverGlowGeometry.setAttribute("position", new THREE.BufferAttribute(this.hoverGlowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.hoverGlowGeometry.setAttribute("pointSize", new THREE.BufferAttribute(this.hoverGlowSizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.hoverGlowGeometry.setAttribute("pointOpacity", new THREE.BufferAttribute(this.hoverGlowOpacities, 1).setUsage(THREE.DynamicDrawUsage));

    this.nodeGlowMaterial = this.createGlowPointMaterial();
    this.hoverGlowMaterial = this.createGlowPointMaterial(ACCENT_COLOR);

    const nodeGlowPoints = new THREE.Points(this.nodeGlowGeometry, this.nodeGlowMaterial);
    nodeGlowPoints.frustumCulled = false;
    nodeGlowPoints.renderOrder = 1.5;
    this.scene.add(nodeGlowPoints);

    this.nodeMesh = new THREE.InstancedMesh(
      nodeGeometry,
      nodeMaterial,
      this.nodes.length,
    );
    this.nodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.nodeMesh.frustumCulled = false;
    this.nodeMesh.renderOrder = 2;
    this.scene.add(this.nodeMesh);

    this.dimMaterial = new THREE.MeshBasicMaterial({
      color: 0x02020a,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    this.dimPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.dimMaterial);
    this.dimPlane.frustumCulled = false;
    this.dimPlane.renderOrder = 4;
    this.scene.add(this.dimPlane);

    const hoverGlowPoints = new THREE.Points(this.hoverGlowGeometry, this.hoverGlowMaterial);
    hoverGlowPoints.frustumCulled = false;
    hoverGlowPoints.renderOrder = 7;
    this.scene.add(hoverGlowPoints);

    this.connectedNodeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    this.connectedNodeMesh = new THREE.InstancedMesh(
      nodeGeometry,
      this.connectedNodeMaterial,
      this.nodes.length,
    );
    this.connectedNodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.connectedNodeMesh.frustumCulled = false;
    this.connectedNodeMesh.renderOrder = 6;
    this.scene.add(this.connectedNodeMesh);

    this.accentNodeMaterial = new THREE.MeshBasicMaterial({ color: ACCENT_COLOR, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    this.accentNodeMesh = new THREE.InstancedMesh(
      nodeGeometry,
      this.accentNodeMaterial,
      this.nodes.length,
    );
    this.accentNodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.accentNodeMesh.frustumCulled = false;
    this.accentNodeMesh.renderOrder = 8;
    this.scene.add(this.accentNodeMesh);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.container.addEventListener("pointerdown", this.handlePointerDown);
    this.container.addEventListener("pointermove", this.handlePointerMove);
    this.container.addEventListener("pointerup", this.handlePointerUp);
    this.container.addEventListener("pointercancel", this.handlePointerUp);
    this.container.addEventListener("pointerleave", this.handlePointerLeave);
    this.container.addEventListener("wheel", this.handleWheel, { passive: false });
    this.backButton.addEventListener("click", this.clearSelection);
    window.addEventListener("visibilitychange", this.handleVisibilityChange);

    this.resize();
    this.updateMeshes(1 / 60);
    this.webgl.render(this.scene, this.camera);
    this.animate();
  }

  resetView(immediate = false): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const fitZoom = Math.min(width / 2300, height / 1200);
    this.targetPosition.set(0, 0);
    this.targetZoom = THREE.MathUtils.clamp(fitZoom, 0.45, 1.15);

    if (immediate) {
      this.camera.position.set(this.targetPosition.x, this.targetPosition.y, 10);
      this.camera.zoom = this.targetZoom;
    }

    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  private animate = (): void => {
    this.animationFrame = window.requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.04);
    this.accumulator += delta;

    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < 4) {
      if (this.simulation.alpha() > this.simulation.alphaMin()) {
        this.simulation.tick();
      }
      this.accumulator -= this.fixedStep;
      steps += 1;
    }

    this.updateSelectedCameraTarget();
    this.updateCamera(delta);
    this.updateMeshes(delta);
    this.webgl.render(this.scene, this.camera);
  };

  private updateMeshes(delta: number): void {
    const defaultBlend = 1 - Math.exp(-delta * 12);
    const focusBlend = 1 - Math.exp(-delta * 10);
    const time = performance.now() * 0.001;
    const activeIndex = this.selectedIndex !== -1 ? this.selectedIndex : this.hoveredIndex;

    this.nodes.forEach((node, index) => {
      const blend = node === this.draggedNode ? 1 : defaultBlend;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      node.renderX += (x - node.renderX) * blend;
      node.renderY += (y - node.renderY) * blend;

      const targetFocus = index === activeIndex ? 1 : 0;
      this.focusLevels[index] += (targetFocus - this.focusLevels[index]) * focusBlend;
      const hoverScale = 1 + this.focusLevels[index] * 0.08;
      const pulseScale = 1 + Math.sin(time * 1.8 + node.pulse) * 0.02;
      const radius = node.radius * hoverScale * pulseScale;
      const hasFocus = activeIndex !== -1;
      const isLinked = hasFocus && this.linkedNodesByNode[activeIndex].has(index);
      const isActive = index === activeIndex;
      const glowOffset = index * 3;
      const hoverOpacity = this.focusLevels[index] * 0.72;

      this.nodeGlowPositions[glowOffset] = node.renderX;
      this.nodeGlowPositions[glowOffset + 1] = node.renderY;
      this.nodeGlowPositions[glowOffset + 2] = 0.02;
      this.nodeGlowSizes[index] = radius * 6.2;

      this.hoverGlowPositions[glowOffset] = node.renderX;
      this.hoverGlowPositions[glowOffset + 1] = node.renderY;
      this.hoverGlowPositions[glowOffset + 2] = 0.17;
      this.hoverGlowSizes[index] = Math.max(node.radius * 8.4, radius * 6.8);
      this.hoverGlowOpacities[index] = hoverOpacity < 0.01 ? 0 : hoverOpacity;

      this.matrix.position.set(node.renderX, node.renderY, isActive ? 0.12 : 0.04);
      this.matrix.scale.setScalar(radius);
      this.matrix.updateMatrix();
      this.nodeMesh.setMatrixAt(index, this.matrix.matrix);

      this.matrix.position.set(node.renderX, node.renderY, 0.14);
      this.matrix.scale.setScalar(hasFocus && isLinked && !isActive ? radius : 0);
      this.matrix.updateMatrix();
      this.connectedNodeMesh.setMatrixAt(index, this.matrix.matrix);

      this.matrix.position.set(node.renderX, node.renderY, 0.18);
      this.matrix.scale.setScalar(isActive ? radius : 0);
      this.matrix.updateMatrix();
      this.accentNodeMesh.setMatrixAt(index, this.matrix.matrix);
    });

    this.updateHoverOverlay(delta);
    this.updateLabels();
    this.nodeGlowMaterial.uniforms.cameraZoom.value = this.camera.zoom;
    this.hoverGlowMaterial.uniforms.cameraZoom.value = this.camera.zoom;
    this.nodeGlowGeometry.getAttribute("position").needsUpdate = true;
    this.nodeGlowGeometry.getAttribute("pointSize").needsUpdate = true;
    this.hoverGlowGeometry.getAttribute("position").needsUpdate = true;
    this.hoverGlowGeometry.getAttribute("pointSize").needsUpdate = true;
    this.hoverGlowGeometry.getAttribute("pointOpacity").needsUpdate = true;
    this.nodeMesh.instanceMatrix.needsUpdate = true;
    this.connectedNodeMesh.instanceMatrix.needsUpdate = true;
    this.accentNodeMesh.instanceMatrix.needsUpdate = true;

    let offset = 0;
    this.links.forEach((link) => {
      const source = link.source as GraphNode;
      const target = link.target as GraphNode;
      this.linkPositions[offset++] = source.renderX;
      this.linkPositions[offset++] = source.renderY;
      this.linkPositions[offset++] = -0.04;
      this.linkPositions[offset++] = target.renderX;
      this.linkPositions[offset++] = target.renderY;
      this.linkPositions[offset++] = -0.04;
    });

    const position = this.linkGeometry.getAttribute("position") as THREE.BufferAttribute;
    position.needsUpdate = true;
  }

  private updateHoverOverlay(delta: number): void {
    const blend = 1 - Math.exp(-delta * 9);
    const activeIndex = this.selectedIndex !== -1 ? this.selectedIndex : this.hoveredIndex;
    const hasFocus = activeIndex !== -1;
    this.overlayLevel += ((hasFocus ? 1 : 0) - this.overlayLevel) * blend;

    const level = this.overlayLevel < 0.001 ? 0 : this.overlayLevel;
    this.dimMaterial.opacity = level * (this.selectedIndex !== -1 ? 0.78 : 0.58);
    this.connectedNodeMaterial.opacity = level;
    this.accentNodeMaterial.opacity = level;
    this.highlightLinkMaterial.opacity = level;

    const visibleWidth = Math.max(this.container.clientWidth, 1) / this.camera.zoom;
    const visibleHeight = Math.max(this.container.clientHeight, 1) / this.camera.zoom;
    this.dimPlane.position.set(this.camera.position.x, this.camera.position.y, 0.16);
    this.dimPlane.scale.set(visibleWidth, visibleHeight, 1);

    let offset = 0;
    if (hasFocus) {
      this.linkedLinksByNode[activeIndex].forEach((linkIndex) => {
        const link = this.links[linkIndex];
        const source = link.source as GraphNode;
        const target = link.target as GraphNode;
        this.highlightLinkPositions[offset++] = source.renderX;
        this.highlightLinkPositions[offset++] = source.renderY;
        this.highlightLinkPositions[offset++] = 0.2;
        this.highlightLinkPositions[offset++] = target.renderX;
        this.highlightLinkPositions[offset++] = target.renderY;
        this.highlightLinkPositions[offset++] = 0.2;
      });
    }

    this.highlightLinkGeometry.setDrawRange(0, offset / 3);
    const highlightPosition = this.highlightLinkGeometry.getAttribute("position") as THREE.BufferAttribute;
    highlightPosition.needsUpdate = true;
  }

  private updateLabels(): void {
    const rect = this.webgl.domElement.getBoundingClientRect();
    const zoom = this.camera.zoom;
    const activeIndex = this.selectedIndex !== -1 ? this.selectedIndex : this.hoveredIndex;
    const linkedNodes = activeIndex !== -1 ? this.linkedNodesByNode[activeIndex] : null;
    const zoomShowsLabels = zoom >= 0.78;

    this.nodes.forEach((node, index) => {
      const label = this.nodeLabels[index];
      const isActive = index === activeIndex;
      const isLinked = linkedNodes?.has(index) ?? false;
      const visible = zoomShowsLabels && (this.selectedIndex === -1 || isLinked);
      const position = new THREE.Vector3(node.renderX, node.renderY, 0.32).project(this.camera);
      const screenX = (position.x * 0.5 + 0.5) * rect.width;
      const screenY = (-position.y * 0.5 + 0.5) * rect.height;
      const nodeRadiusPx = node.radius * zoom;
      const scale = 1 + this.focusLevels[index] * 0.24;

      label.style.left = `${screenX}px`;
      label.style.top = `${screenY + nodeRadiusPx + 7}px`;
      label.style.opacity = visible ? (isActive ? "1" : "0.78") : "0";
      label.style.transform = `translate(-50%, 0) scale(${scale.toFixed(3)})`;
      label.classList.toggle("is-active", isActive && visible);
      label.classList.toggle("is-linked", isLinked && visible && !isActive);
    });
  }

  private createGlowPointMaterial(color = NODE_COLOR): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        cameraZoom: { value: 1 },
        glowColor: { value: color },
      },
      vertexShader: `
        attribute float pointSize;
        attribute float pointOpacity;
        varying float vOpacity;
        uniform float cameraZoom;

        void main() {
          vOpacity = pointOpacity;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = pointSize * cameraZoom;
        }
      `,
      fragmentShader: `
        varying float vOpacity;
        uniform vec3 glowColor;

        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          float distanceFromCenter = length(coord) * 2.0;
          float alpha = 1.0 - smoothstep(0.05, 1.0, distanceFromCenter);
          alpha = pow(alpha, 1.85) * vOpacity;
          gl_FragColor = vec4(glowColor, alpha);
        }
      `,
    });
  }

  private createTopology(): { linkedNodesByNode: Array<Set<number>>; linkedLinksByNode: Array<Set<number>> } {
    const nodeIndexById = new Map(this.nodes.map((node, index) => [node.id, index]));
    const linkedNodesByNode = this.nodes.map((_, index) => new Set<number>([index]));
    const linkedLinksByNode = this.nodes.map(() => new Set<number>());

    this.links.forEach((link, linkIndex) => {
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

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.webgl.setSize(width, height, false);

    if (!this.didSetInitialView) {
      this.resetView(true);
      this.didSetInitialView = true;
    }
  }

  private updateCamera(delta: number): void {
    const blend = 1 - Math.exp(-delta * 15);
    const nextX = THREE.MathUtils.lerp(this.camera.position.x, this.targetPosition.x, blend);
    const nextY = THREE.MathUtils.lerp(this.camera.position.y, this.targetPosition.y, blend);
    const nextZoom = THREE.MathUtils.lerp(this.camera.zoom, this.targetZoom, blend);

    this.camera.position.x = Math.abs(nextX - this.targetPosition.x) < 0.001 ? this.targetPosition.x : nextX;
    this.camera.position.y = Math.abs(nextY - this.targetPosition.y) < 0.001 ? this.targetPosition.y : nextY;
    this.camera.zoom = Math.abs(nextZoom - this.targetZoom) < 0.0005 ? this.targetZoom : nextZoom;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  private updateSelectedCameraTarget(): void {
    if (this.selectedIndex === -1 || !this.selectionAutoFollow) {
      return;
    }

    const node = this.nodes[this.selectedIndex];
    const offset = this.getPanelCameraOffset(this.targetZoom);
    this.targetPosition.set(node.renderX + offset.x, node.renderY + offset.y);
  }

  private getPanelCameraOffset(zoom: number): THREE.Vector2 {
    if (this.selectedIndex === -1) {
      return new THREE.Vector2(0, 0);
    }

    const panelRect = this.nodePanel.getBoundingClientRect();
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const safeZoom = Math.max(zoom, 0.001);
    const isBottomPanel = panelRect.width > width * 0.82 && panelRect.top > height * 0.35;

    if (isBottomPanel) {
      return new THREE.Vector2(0, -panelRect.height / (2 * safeZoom));
    }

    return new THREE.Vector2(panelRect.width / (2 * safeZoom), 0);
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }

    this.container.setPointerCapture(event.pointerId);
    this.pointerDownScreen.set(event.clientX, event.clientY);
    this.pointerDownNodeIndex = -1;
    const hitIndex = this.getNodeAtPointer(event);

    if (hitIndex !== -1) {
      const node = this.nodes[hitIndex];
      const world = this.screenToWorld(event);
      this.draggedNode = node;
      this.hoveredIndex = hitIndex;
      this.pointerDownNodeIndex = hitIndex;
      if (this.selectedIndex !== -1) {
        this.selectionAutoFollow = false;
      }
      this.dragOffset.set((node.x ?? node.renderX) - world.x, (node.y ?? node.renderY) - world.y);
      node.fx = node.x ?? node.renderX;
      node.fy = node.y ?? node.renderY;
      this.interactionMode = "drag-node";
      this.simulation.alphaTarget(0.18).alpha(0.42);
      this.setInteractionClasses();
      return;
    }

    const world = this.screenToWorld(event);
    this.panAnchor.copy(world);
    if (this.selectedIndex !== -1) {
      this.selectionAutoFollow = false;
    }
    this.hoveredIndex = -1;
    this.interactionMode = "pan-camera";
    this.setInteractionClasses();
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.interactionMode === "drag-node" && this.draggedNode) {
      const world = this.screenToWorld(event);
      const x = world.x + this.dragOffset.x;
      const y = world.y + this.dragOffset.y;
      this.draggedNode.fx = x;
      this.draggedNode.fy = y;
      this.draggedNode.x = x;
      this.draggedNode.y = y;
      this.draggedNode.renderX = x;
      this.draggedNode.renderY = y;
      this.simulation.alpha(Math.max(this.simulation.alpha(), 0.28));
      return;
    }

    if (this.interactionMode === "pan-camera") {
      const world = this.screenToWorld(event);
      this.camera.position.x += this.panAnchor.x - world.x;
      this.camera.position.y += this.panAnchor.y - world.y;
      this.targetPosition.set(this.camera.position.x, this.camera.position.y);
      this.camera.updateMatrixWorld();
      return;
    }

    if (this.selectedIndex !== -1) {
      this.setInteractionClasses();
      return;
    }

    const hitIndex = this.getNodeAtPointer(event);
    this.hoveredIndex = hitIndex;

    this.setInteractionClasses();
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (this.container.hasPointerCapture(event.pointerId)) {
      this.container.releasePointerCapture(event.pointerId);
    }

    const clickDistance = Math.hypot(event.clientX - this.pointerDownScreen.x, event.clientY - this.pointerDownScreen.y);

    if (this.draggedNode) {
      this.draggedNode.fx = null;
      this.draggedNode.fy = null;
      this.draggedNode = null;
      this.simulation.alphaTarget(0).alpha(Math.max(this.simulation.alpha(), 0.18));
    }

    if (this.pointerDownNodeIndex !== -1 && clickDistance < 6) {
      this.selectNode(this.pointerDownNodeIndex);
    }

    this.interactionMode = "idle";
    this.pointerDownNodeIndex = -1;
    this.setInteractionClasses();
  };

  private handlePointerLeave = (): void => {
    if (this.interactionMode !== "idle") {
      return;
    }

    this.hoveredIndex = -1;
    this.setInteractionClasses();
  };

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (this.selectedIndex !== -1) {
      this.selectionAutoFollow = false;
    }
    const before = this.screenToTargetWorld(event);
    const zoomDelta = Math.exp(-this.normalizeWheelDelta(event) * 0.0011);
    const nextZoom = THREE.MathUtils.clamp(this.targetZoom * zoomDelta, 0.32, 4.5);

    if (nextZoom === this.targetZoom) {
      return;
    }

    this.targetZoom = nextZoom;
    const offset = this.pointerOffsetForZoom(this.targetZoom);
    this.targetPosition.set(before.x - offset.x, before.y - offset.y);
  };

  private getNodeAtPointer(event: PointerEvent): number {
    this.updatePointer(event);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hit = this.raycaster.intersectObject(this.nodeMesh, false)[0];
    return hit?.instanceId ?? -1;
  }

  private screenToWorld(event: PointerEvent | WheelEvent): THREE.Vector2 {
    this.updatePointer(event);
    this.camera.updateMatrixWorld();
    const world = new THREE.Vector3(this.pointer.x, this.pointer.y, 0).unproject(this.camera);
    return new THREE.Vector2(world.x, world.y);
  }

  private screenToTargetWorld(event: PointerEvent | WheelEvent): THREE.Vector2 {
    this.updatePointer(event);
    const offset = this.pointerOffsetForZoom(this.targetZoom);
    return new THREE.Vector2(this.targetPosition.x + offset.x, this.targetPosition.y + offset.y);
  }

  private pointerOffsetForZoom(zoom: number): THREE.Vector2 {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    return new THREE.Vector2((this.pointer.x * width) / (2 * zoom), (this.pointer.y * height) / (2 * zoom));
  }

  private normalizeWheelDelta(event: WheelEvent): number {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return event.deltaY * 16;
    }

    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      return event.deltaY * Math.max(this.container.clientHeight, 1);
    }

    return event.deltaY;
  }

  private updatePointer(event: PointerEvent | WheelEvent): void {
    const rect = this.webgl.domElement.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    this.pointer.x = ((event.clientX - rect.left) / width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / height) * 2 + 1;
  }

  private selectNode(index: number): void {
    const node = this.nodes[index];
    this.selectedIndex = index;
    this.hoveredIndex = index;
    this.selectionAutoFollow = true;
    this.targetZoom = THREE.MathUtils.clamp(1.45, 0.32, 4.5);
    this.nodeContent.innerHTML = renderMarkdown(createNodeMarkdown(node, this.linkedLinksByNode[index].size));
    this.nodePanel.classList.add("is-visible");
    this.backButton.classList.add("is-visible");
    this.updateSelectedCameraTarget();
    this.setInteractionClasses();
  }

  private clearSelection = (): void => {
    this.selectedIndex = -1;
    this.hoveredIndex = -1;
    this.selectionAutoFollow = false;
    this.resetView();
    this.nodePanel.classList.remove("is-visible");
    this.backButton.classList.remove("is-visible");
    this.setInteractionClasses();
  };

  private setInteractionClasses(): void {
    this.container.classList.toggle("is-hovering", this.hoveredIndex !== -1 && this.interactionMode === "idle");
    this.container.classList.toggle("is-dragging-node", this.interactionMode === "drag-node");
    this.container.classList.toggle("is-panning", this.interactionMode === "pan-camera");
    this.container.classList.toggle("has-selection", this.selectedIndex !== -1);
  }

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      window.cancelAnimationFrame(this.animationFrame);
      return;
    }

    this.clock.getDelta();
    this.animate();
  };
}

const graph = createDemoGraph();
const simulation = createForceSimulation(graph.nodes, graph.links);
new SmoothForceRenderer(stage, backButton, nodePanel, nodeContent, graph.nodes, graph.links, simulation);

function createNodeMarkdown(node: GraphNode, linkCount: number): string {
  const cluster = CLUSTERS[node.group];
  return `
# ${node.label}

Mock documentation for the **${cluster.name}** cluster node.

## Signals

- Connected links: **${linkCount}**
- Layout position: \`${Math.round(node.renderX)}, ${Math.round(node.renderY)}\`
- Status: _active in the force graph_

## Notes

This panel is rendered from markdown and stays visually blended into the galaxy canvas. Replace this mock payload with node-specific documentation later.

\`\`\`json
{ "id": "${node.id}", "cluster": "${cluster.name}", "links": ${linkCount} }
\`\`\`
`.trim();
}

function renderMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const html: string[] = [];
  let inList = false;
  let inCode = false;
  let codeLines: string[] = [];

  const closeList = (): void => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  lines.forEach((line) => {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      return;
    }

    if (inCode) {
      codeLines.push(line);
      return;
    }

    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1>${formatInline(line.slice(2))}</h1>`);
      return;
    }

    if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2>${formatInline(line.slice(3))}</h2>`);
      return;
    }

    if (line.startsWith("- ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${formatInline(line.slice(2))}</li>`);
      return;
    }

    if (line.trim()) {
      closeList();
      html.push(`<p>${formatInline(line)}</p>`);
    } else {
      closeList();
    }
  });

  closeList();
  return html.join("");
}

function formatInline(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mulberry32(seed: number): () => number {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
