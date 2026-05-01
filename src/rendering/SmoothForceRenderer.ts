import type { Simulation } from "d3-force";
import * as THREE from "three";

import { ACCENT_COLOR_HEX } from "../config/graphConfig";
import { CameraController, type CameraViewport } from "../interaction/cameraController";
import { InputController } from "../interaction/inputController";
import type { GraphLink, GraphNode, InteractionMode } from "../types";
import { createGlowPointMaterial } from "./glowMaterial";
import { createTopology } from "./topology";

const ACCENT_COLOR = new THREE.Color(ACCENT_COLOR_HEX);
const BACKGROUND_CLICK_DISTANCE = 6;
const BACKGROUND_CLEAR_NODE_PADDING = 56;
const LABEL_HOVER_BRIDGE_PADDING = 10;
const DEFAULT_NODE_CAPACITY = 4096;
const DEFAULT_LINK_CAPACITY = 16384;

type SmoothForceRendererCallbacks = {
  onNodeSelect?: (node: GraphNode, linkCount: number, source: NodeSelectionSource) => void;
  onSelectionClear?: () => void;
};

type NodeSelectionSource = "pointer" | "programmatic" | "sync";

type SmoothForceRendererOptions = {
  container: HTMLDivElement;
  panelElement: HTMLElement;
  nodes: GraphNode[];
  links: GraphLink[];
  simulation: Simulation<GraphNode, GraphLink>;
  callbacks?: SmoothForceRendererCallbacks;
};

export class SmoothForceRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private readonly webgl: THREE.WebGLRenderer;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(-10, -10);
  private readonly matrix = new THREE.Object3D();
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;
  private readonly nodeLabels: HTMLSpanElement[];
  private readonly hoverNodeClone: HTMLDivElement;
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
  private focusLevels: number[];
  private appearanceLevels: number[];
  private linkedNodesByNode: Array<Set<number>>;
  private linkedLinksByNode: Array<Set<number>>;
  private readonly dragOffset = new THREE.Vector2();
  private readonly panAnchor = new THREE.Vector2();
  private readonly pointerDownScreen = new THREE.Vector2();
  private readonly wheelPointer = new THREE.Vector2();
  private readonly labelProjection = new THREE.Vector3();
  private readonly fixedStep = 1 / 60;
  private readonly cameraController: CameraController;
  private readonly inputController: InputController;
  private readonly defaultPixelRatio = Math.min(window.devicePixelRatio, 2);
  private readonly interactionPixelRatio = Math.min(window.devicePixelRatio, 1.15);
  private labelVisible: boolean[];
  private labelActive: boolean[];
  private labelLinked: boolean[];
  private labelOpacity: string[];
  private readonly nodeCapacity: number;
  private readonly linkCapacity: number;
  private readonly container: HTMLDivElement;
  private nodes: GraphNode[];
  private links: GraphLink[];
  private simulation: Simulation<GraphNode, GraphLink>;
  private readonly callbacks: SmoothForceRendererCallbacks;
  private overlayLevel = 0;
  private animationFrame = 0;
  private accumulator = 0;
  private pendingWheelDelta = 0;
  private wheelCooldownFrames = 0;
  private currentPixelRatio = this.defaultPixelRatio;
  private viewportLeft = 0;
  private viewportTop = 0;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private draggedNode: GraphNode | null = null;
  private pointerDownNodeIndex = -1;
  private pointerDownWasBackground = false;
  private pointerDownWasFarFromNodes = false;
  private preSelectionViewport: CameraViewport | null = null;
  private graphAutoFollow = true;
  private selectedIndex = -1;
  private selectionAutoFollow = false;
  private hoveredIndex = -1;
  private interactionMode: InteractionMode = "idle";
  private didSetInitialView = false;
  private isAnimating = false;
  private isDisposed = false;

  constructor({ container, panelElement, nodes, links, simulation, callbacks = {} }: SmoothForceRendererOptions) {
    this.container = container;
    this.nodes = nodes;
    this.links = links;
    this.simulation = simulation;
    this.callbacks = callbacks;
    this.nodeCapacity = Math.max(DEFAULT_NODE_CAPACITY, this.nodes.length);
    this.linkCapacity = Math.max(DEFAULT_LINK_CAPACITY, this.links.length);

    this.webgl = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.webgl.setClearColor(0x000000, 0);
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.setPixelRatio(this.defaultPixelRatio);
    this.webgl.domElement.style.touchAction = "none";
    this.container.appendChild(this.webgl.domElement);
    this.nodeLabels = this.nodes.map((node) => this.createNodeLabel(node));
    this.hoverNodeClone = this.createHoverNodeClone();

    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);
    this.cameraController = new CameraController(this.camera, this.container, panelElement);

    this.linkPositions = new Float32Array(this.linkCapacity * 6);
    this.highlightLinkPositions = new Float32Array(this.linkCapacity * 6);
    this.focusLevels = this.nodes.map(() => 0);
    this.appearanceLevels = this.nodes.map(() => 1);
    this.labelVisible = this.nodes.map(() => false);
    this.labelActive = this.nodes.map(() => false);
    this.labelLinked = this.nodes.map(() => false);
    this.labelOpacity = this.nodes.map(() => "0");
    const topology = createTopology(this.nodes, this.links);
    this.linkedNodesByNode = topology.linkedNodesByNode;
    this.linkedLinksByNode = topology.linkedLinksByNode;
    this.linkGeometry.setAttribute("position", new THREE.BufferAttribute(this.linkPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.linkGeometry.setDrawRange(0, this.links.length * 2);

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

    this.nodeGlowPositions = new Float32Array(this.nodeCapacity * 3);
    this.nodeGlowSizes = new Float32Array(this.nodeCapacity);
    this.nodeGlowOpacities = new Float32Array(this.nodeCapacity).fill(0.5);
    this.hoverGlowPositions = new Float32Array(this.nodeCapacity * 3);
    this.hoverGlowSizes = new Float32Array(this.nodeCapacity);
    this.hoverGlowOpacities = new Float32Array(this.nodeCapacity);
    this.nodeGlowGeometry.setAttribute("position", new THREE.BufferAttribute(this.nodeGlowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.nodeGlowGeometry.setAttribute("pointSize", new THREE.BufferAttribute(this.nodeGlowSizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.nodeGlowGeometry.setAttribute("pointOpacity", new THREE.BufferAttribute(this.nodeGlowOpacities, 1).setUsage(THREE.DynamicDrawUsage));
    this.nodeGlowGeometry.setDrawRange(0, this.nodes.length);
    this.hoverGlowGeometry.setAttribute("position", new THREE.BufferAttribute(this.hoverGlowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.hoverGlowGeometry.setAttribute("pointSize", new THREE.BufferAttribute(this.hoverGlowSizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.hoverGlowGeometry.setAttribute("pointOpacity", new THREE.BufferAttribute(this.hoverGlowOpacities, 1).setUsage(THREE.DynamicDrawUsage));
    this.hoverGlowGeometry.setDrawRange(0, this.nodes.length);

    this.nodeGlowMaterial = createGlowPointMaterial();
    this.hoverGlowMaterial = createGlowPointMaterial(ACCENT_COLOR);

    const nodeGlowPoints = new THREE.Points(this.nodeGlowGeometry, this.nodeGlowMaterial);
    nodeGlowPoints.frustumCulled = false;
    nodeGlowPoints.renderOrder = 1.5;
    this.scene.add(nodeGlowPoints);

    this.nodeMesh = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, this.nodeCapacity);
    this.nodeMesh.count = this.nodes.length;
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
    this.connectedNodeMesh = new THREE.InstancedMesh(nodeGeometry, this.connectedNodeMaterial, this.nodeCapacity);
    this.connectedNodeMesh.count = this.nodes.length;
    this.connectedNodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.connectedNodeMesh.frustumCulled = false;
    this.connectedNodeMesh.renderOrder = 6;
    this.scene.add(this.connectedNodeMesh);

    this.accentNodeMaterial = new THREE.MeshBasicMaterial({ color: ACCENT_COLOR, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    this.accentNodeMesh = new THREE.InstancedMesh(nodeGeometry, this.accentNodeMaterial, this.nodeCapacity);
    this.accentNodeMesh.count = this.nodes.length;
    this.accentNodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.accentNodeMesh.frustumCulled = false;
    this.accentNodeMesh.renderOrder = 8;
    this.scene.add(this.accentNodeMesh);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.inputController = new InputController(this.container, {
      pointerDown: this.handlePointerDown,
      pointerMove: this.handlePointerMove,
      pointerUp: this.handlePointerUp,
      pointerLeave: this.handlePointerLeave,
      wheel: this.handleWheel,
    });
    window.addEventListener("visibilitychange", this.handleVisibilityChange);

    this.resize();
    this.updateMeshes(1 / 60);
    this.webgl.render(this.scene, this.camera);
    this.startAnimation();
  }

  resetView(immediate = false): void {
    this.graphAutoFollow = false;
    this.cameraController.resetView(immediate);
  }

  fitVisibleNodes(): void {
    if (this.selectedIndex !== -1) {
      this.selectionAutoFollow = true;
      this.graphAutoFollow = false;
      this.updateSelectedCameraTarget();
      return;
    }

    this.graphAutoFollow = true;
    this.cameraController.fitNodes(this.nodes);
  }

  selectNodeByTitle(title: string): void {
    const normalizedTitle = title.trim().toLowerCase();
    const index = this.nodes.findIndex((node) => node.label.trim().toLowerCase() === normalizedTitle);

    if (index !== -1) {
      this.selectNode(index);
    }
  }

  syncGraph(nodes: GraphNode[], links: GraphLink[], simulation: Simulation<GraphNode, GraphLink>): void {
    if (nodes.length > this.nodeCapacity || links.length > this.linkCapacity) {
      console.warn(
        `Graph update skipped: capacity exceeded (${nodes.length}/${this.nodeCapacity} nodes, ${links.length}/${this.linkCapacity} links).`,
      );
      simulation.stop();
      return;
    }

    const previousNodesById = new Map(this.nodes.map((node, index) => [node.id, { node, index }]));
    const labelsById = new Map(this.nodes.map((node, index) => [node.id, this.nodeLabels[index]]));
    const selectedId = this.selectedIndex === -1 ? null : this.nodes[this.selectedIndex]?.id ?? null;
    const hoveredId = this.hoveredIndex === -1 ? null : this.nodes[this.hoveredIndex]?.id ?? null;

    nodes.forEach((node) => {
      const previous = previousNodesById.get(node.id);

      if (previous) {
        this.copyNodeLayout(previous.node, node);
        return;
      }

      this.seedNewNodePosition(node, links, previousNodesById);
    });

    this.nodeLabels.forEach((label) => {
      if (!nodes.some((node) => labelsById.get(node.id) === label)) {
        this.removeNodeLabel(label);
      }
    });
    this.nodeLabels.length = 0;
    nodes.forEach((node) => {
      const label = labelsById.get(node.id) ?? this.createNodeLabel(node);
      label.textContent = node.label;
      label.style.opacity = "0";
      label.classList.remove("is-active", "is-linked", "is-visible");
      this.nodeLabels.push(label);
    });

    this.simulation.stop();
    this.simulation = simulation;
    this.nodes = nodes;
    this.links = links;

    const topology = createTopology(this.nodes, this.links);
    this.linkedNodesByNode = topology.linkedNodesByNode;
    this.linkedLinksByNode = topology.linkedLinksByNode;
    this.focusLevels = this.nodes.map(() => 0);
    this.appearanceLevels = this.nodes.map((node) => (previousNodesById.has(node.id) ? 1 : 0));
    this.labelVisible = this.nodes.map(() => false);
    this.labelActive = this.nodes.map(() => false);
    this.labelLinked = this.nodes.map(() => false);
    this.labelOpacity = this.nodes.map(() => "0");
    this.selectedIndex = selectedId ? this.nodes.findIndex((node) => node.id === selectedId) : -1;
    this.hoveredIndex = hoveredId ? this.nodes.findIndex((node) => node.id === hoveredId) : -1;

    if (this.selectedIndex === -1) {
      this.selectionAutoFollow = false;
      this.callbacks.onSelectionClear?.();
    } else {
      const selectedNode = this.nodes[this.selectedIndex];
      this.callbacks.onNodeSelect?.(selectedNode, this.linkedLinksByNode[this.selectedIndex].size, "sync");
    }

    this.nodeMesh.count = this.nodes.length;
    this.connectedNodeMesh.count = this.nodes.length;
    this.accentNodeMesh.count = this.nodes.length;
    this.nodeGlowGeometry.setDrawRange(0, this.nodes.length);
    this.hoverGlowGeometry.setDrawRange(0, this.nodes.length);
    this.linkGeometry.setDrawRange(0, this.links.length * 2);
    this.highlightLinkGeometry.setDrawRange(0, 0);
    this.simulation.alpha(Math.max(this.simulation.alpha(), 0.72));
    this.updateMeshes(1 / 60);
    this.updateGraphCameraTarget();
    this.setInteractionClasses();
  }

  clearSelection = (): void => {
    this.selectedIndex = -1;
    this.hoveredIndex = -1;
    this.selectionAutoFollow = false;
    this.graphAutoFollow = false;
    if (this.preSelectionViewport) {
      this.cameraController.restoreViewport(this.preSelectionViewport);
      this.preSelectionViewport = null;
    } else {
      this.cameraController.fitNodes(this.nodes);
    }
    this.callbacks.onSelectionClear?.();
    this.setInteractionClasses();
  };

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.stopAnimation();
    this.simulation.stop();
    this.resizeObserver.disconnect();
    this.inputController.dispose();
    window.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.container.classList.remove("is-hovering", "is-dragging-node", "is-panning", "has-selection");
    this.nodeLabels.forEach((label) => this.removeNodeLabel(label));
    this.hoverNodeClone.remove();
    this.disposeScene();
    this.webgl.domElement.remove();
    this.webgl.dispose();
  }

  private startAnimation(): void {
    if (this.isAnimating || this.isDisposed) {
      return;
    }

    this.isAnimating = true;
    this.clock.getDelta();
    this.animate();
  }

  private createNodeLabel(node: GraphNode): HTMLSpanElement {
    const label = document.createElement("span");
    label.className = "node-label";
    label.textContent = node.label;
    label.addEventListener("pointerenter", this.handleLabelPointerEnter);
    label.addEventListener("pointerleave", this.handleLabelPointerLeave);
    label.addEventListener("pointermove", this.stopLabelPointerEvent);
    label.addEventListener("pointerdown", this.handleLabelPointerDown);
    label.addEventListener("pointerup", this.handleLabelPointerUp);
    label.draggable = false;
    this.container.appendChild(label);
    return label;
  }

  private createHoverNodeClone(): HTMLDivElement {
    const clone = document.createElement("div");
    clone.className = "hover-node-clone";
    clone.setAttribute("aria-hidden", "true");
    this.container.appendChild(clone);
    return clone;
  }

  private removeNodeLabel(label: HTMLSpanElement): void {
    label.removeEventListener("pointerenter", this.handleLabelPointerEnter);
    label.removeEventListener("pointerleave", this.handleLabelPointerLeave);
    label.removeEventListener("pointermove", this.stopLabelPointerEvent);
    label.removeEventListener("pointerdown", this.handleLabelPointerDown);
    label.removeEventListener("pointerup", this.handleLabelPointerUp);
    label.remove();
  }

  private copyNodeLayout(source: GraphNode, target: GraphNode): void {
    target.x = source.x;
    target.y = source.y;
    target.vx = source.vx;
    target.vy = source.vy;
    target.fx = source.fx;
    target.fy = source.fy;
    target.renderX = source.renderX;
    target.renderY = source.renderY;
    target.pulse = source.pulse;
  }

  private seedNewNodePosition(node: GraphNode, links: GraphLink[], previousNodesById: Map<string, { node: GraphNode; index: number }>): void {
    const anchor = this.findExistingLinkedNode(node.id, links, previousNodesById);
    const angle = this.hashAngle(node.id);
    const distance = 82;
    const x = anchor ? (anchor.x ?? anchor.renderX) + Math.cos(angle) * distance : node.x ?? 0;
    const y = anchor ? (anchor.y ?? anchor.renderY) + Math.sin(angle) * distance : node.y ?? 0;

    node.x = x;
    node.y = y;
    node.renderX = x;
    node.renderY = y;
    node.vx = 0;
    node.vy = 0;
  }

  private findExistingLinkedNode(id: string, links: GraphLink[], previousNodesById: Map<string, { node: GraphNode; index: number }>): GraphNode | null {
    for (const link of links) {
      const sourceId = this.getEndpointId(link.source);
      const targetId = this.getEndpointId(link.target);

      if (sourceId === id) {
        return previousNodesById.get(targetId)?.node ?? null;
      }

      if (targetId === id) {
        return previousNodesById.get(sourceId)?.node ?? null;
      }
    }

    return null;
  }

  private getEndpointId(endpoint: string | GraphNode): string {
    return typeof endpoint === "string" ? endpoint : endpoint.id;
  }

  private hashAngle(value: string): number {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(31, hash) + value.charCodeAt(index);
    }

    return ((hash >>> 0) / 4294967295) * Math.PI * 2;
  }

  private stopAnimation(): void {
    if (!this.isAnimating) {
      return;
    }

    window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.isAnimating = false;
  }

  private animate = (): void => {
    if (!this.isAnimating || this.isDisposed) {
      return;
    }

    this.animationFrame = window.requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.04);
    this.accumulator += delta;
    const isWheelZooming = this.applyPendingWheelZoom() || this.wheelCooldownFrames > 0;
    this.setInteractionQuality(isWheelZooming);

    if (isWheelZooming) {
      this.accumulator = 0;
    } else {
      let steps = 0;
      while (this.accumulator >= this.fixedStep && steps < 4) {
        if (this.simulation.alpha() > this.simulation.alphaMin()) {
          this.simulation.tick();
        }
        this.accumulator -= this.fixedStep;
        steps += 1;
      }
    }

    this.updateSelectedCameraTarget();
    this.updateGraphCameraTarget();
    this.cameraController.update(delta);
    if (isWheelZooming && !this.draggedNode) {
      this.updateCameraOnlyVisuals();
    } else {
      this.updateMeshes(delta);
    }
    this.webgl.render(this.scene, this.camera);

    if (this.wheelCooldownFrames > 0) {
      this.wheelCooldownFrames -= 1;
    }
  };

  private setInteractionQuality(isInteracting: boolean): void {
    const nextPixelRatio = isInteracting ? this.interactionPixelRatio : this.defaultPixelRatio;

    if (Math.abs(nextPixelRatio - this.currentPixelRatio) < 0.01) {
      return;
    }

    this.currentPixelRatio = nextPixelRatio;
    this.webgl.setPixelRatio(nextPixelRatio);
    this.webgl.setSize(this.viewportWidth, this.viewportHeight, false);
  }

  private applyPendingWheelZoom(): boolean {
    if (this.pendingWheelDelta === 0) {
      return false;
    }

    const wheelDelta = this.pendingWheelDelta;
    this.pendingWheelDelta = 0;
    return this.cameraController.zoomAtPointer(this.wheelPointer, wheelDelta);
  }

  private updateCameraOnlyVisuals(): void {
    this.updateDimPlane();
    this.updateHoverNodeClone();
    this.updateLabels();
    this.nodeGlowMaterial.uniforms.cameraZoom.value = this.camera.zoom;
    this.hoverGlowMaterial.uniforms.cameraZoom.value = this.camera.zoom;
  }

  private updateMeshes(delta: number): void {
    const defaultBlend = 1 - Math.exp(-delta * 12);
    const focusBlend = 1 - Math.exp(-delta * 10);
    const appearanceBlend = 1 - Math.exp(-delta * 9);
    const time = performance.now() * 0.001;
    const activeIndex = this.selectedIndex !== -1 ? this.selectedIndex : this.hoveredIndex;

    this.nodes.forEach((node, index) => {
      this.appearanceLevels[index] += (1 - this.appearanceLevels[index]) * appearanceBlend;
      const blend = node === this.draggedNode ? 1 : defaultBlend;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      node.renderX += (x - node.renderX) * blend;
      node.renderY += (y - node.renderY) * blend;

      const targetFocus = index === activeIndex ? 1 : 0;
      this.focusLevels[index] += (targetFocus - this.focusLevels[index]) * focusBlend;
      const appearance = this.appearanceLevels[index];
      const hoverScale = 1 + this.focusLevels[index] * 0.08;
      const pulseScale = 1 + Math.sin(time * 1.8 + node.pulse) * 0.02;
      const radius = node.radius * hoverScale * pulseScale * appearance;
      const hasFocus = activeIndex !== -1;
      const isLinked = hasFocus && this.linkedNodesByNode[activeIndex].has(index);
      const isActive = index === activeIndex;
      const glowOffset = index * 3;
      const hoverOpacity = this.focusLevels[index] * 0.72;

      this.nodeGlowPositions[glowOffset] = node.renderX;
      this.nodeGlowPositions[glowOffset + 1] = node.renderY;
      this.nodeGlowPositions[glowOffset + 2] = 0.02;
      this.nodeGlowSizes[index] = radius * 6.2;
      this.nodeGlowOpacities[index] = 0.5 * appearance;

      this.hoverGlowPositions[glowOffset] = node.renderX;
      this.hoverGlowPositions[glowOffset + 1] = node.renderY;
      this.hoverGlowPositions[glowOffset + 2] = 0.17;
      this.hoverGlowSizes[index] = Math.max(node.radius * 8.4, radius * 6.8);
      this.hoverGlowOpacities[index] = hoverOpacity < 0.01 ? 0 : hoverOpacity * appearance;

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
    this.updateHoverNodeClone();
    this.updateLabels();
    this.nodeGlowMaterial.uniforms.cameraZoom.value = this.camera.zoom;
    this.hoverGlowMaterial.uniforms.cameraZoom.value = this.camera.zoom;
    this.nodeGlowGeometry.getAttribute("position").needsUpdate = true;
    this.nodeGlowGeometry.getAttribute("pointSize").needsUpdate = true;
    this.nodeGlowGeometry.getAttribute("pointOpacity").needsUpdate = true;
    this.hoverGlowGeometry.getAttribute("position").needsUpdate = true;
    this.hoverGlowGeometry.getAttribute("pointSize").needsUpdate = true;
    this.hoverGlowGeometry.getAttribute("pointOpacity").needsUpdate = true;
    this.nodeMesh.instanceMatrix.needsUpdate = true;
    this.nodeMesh.computeBoundingSphere();
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

    this.linkGeometry.setDrawRange(0, this.links.length * 2);

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

    this.updateDimPlane();

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
    const zoom = this.camera.zoom;
    const activeIndex = this.selectedIndex !== -1 ? this.selectedIndex : this.hoveredIndex;
    const linkedNodes = activeIndex !== -1 ? this.linkedNodesByNode[activeIndex] : null;
    const zoomShowsLabels = zoom >= 0.78;

    if (!zoomShowsLabels && activeIndex === -1) {
      this.hideVisibleLabels();
      return;
    }

    this.nodes.forEach((node, index) => {
      const isActive = index === activeIndex;
      const isLinked = linkedNodes?.has(index) ?? false;
      const visible = isActive || (zoomShowsLabels && (this.selectedIndex === -1 || isLinked));

      if (!visible) {
        this.hideLabel(index);
        return;
      }

      const position = this.labelProjection.set(node.renderX, node.renderY, 0.32).project(this.camera);
      const isInViewport = position.x > -1.12 && position.x < 1.12 && position.y > -1.12 && position.y < 1.12;

      if (!isInViewport) {
        this.hideLabel(index);
        return;
      }

      const label = this.nodeLabels[index];
      const screenX = (position.x * 0.5 + 0.5) * this.viewportWidth;
      const screenY = (-position.y * 0.5 + 0.5) * this.viewportHeight;
      const nodeRadiusPx = node.radius * zoom;
      const scale = 1 + this.focusLevels[index] * 0.24;
      const opacity = isActive ? "1" : "0.78";

      label.style.transform = `translate3d(${screenX.toFixed(1)}px, ${(screenY + nodeRadiusPx + 7).toFixed(1)}px, 0) translate(-50%, 0) scale(${scale.toFixed(3)})`;
      this.showLabel(index, opacity, isActive, isLinked && !isActive);
    });
  }

  private updateHoverNodeClone(): void {
    const activeIndex = this.selectedIndex !== -1 ? this.selectedIndex : this.hoveredIndex;

    if (activeIndex === -1) {
      this.hideHoverNodeClone();
      return;
    }

    const node = this.nodes[activeIndex];

    if (!node) {
      this.hideHoverNodeClone();
      return;
    }

    const position = this.labelProjection.set(node.renderX, node.renderY, 0.42).project(this.camera);
    const isInViewport = position.x > -1.12 && position.x < 1.12 && position.y > -1.12 && position.y < 1.12;

    if (!isInViewport) {
      this.hideHoverNodeClone();
      return;
    }

    const screenX = (position.x * 0.5 + 0.5) * this.viewportWidth;
    const screenY = (-position.y * 0.5 + 0.5) * this.viewportHeight;
    const focusScale = 1 + this.focusLevels[activeIndex] * 0.08;
    const appearance = this.appearanceLevels[activeIndex] ?? 1;
    const diameter = Math.max(node.radius * focusScale * appearance * this.camera.zoom * 2, 1);

    this.hoverNodeClone.style.setProperty("--hover-node-size", `${diameter.toFixed(2)}px`);
    this.hoverNodeClone.style.transform = `translate3d(${screenX.toFixed(1)}px, ${screenY.toFixed(1)}px, 0) translate(-50%, -50%)`;
    this.hoverNodeClone.classList.add("is-visible");
  }

  private hideHoverNodeClone(): void {
    this.hoverNodeClone.classList.remove("is-visible");
  }

  private updateDimPlane(): void {
    const visibleWidth = this.viewportWidth / this.camera.zoom;
    const visibleHeight = this.viewportHeight / this.camera.zoom;
    this.dimPlane.position.set(this.camera.position.x, this.camera.position.y, 0.16);
    this.dimPlane.scale.set(visibleWidth, visibleHeight, 1);
  }

  private showLabel(index: number, opacity: string, isActive: boolean, isLinked: boolean): void {
    const label = this.nodeLabels[index];

    if (!this.labelVisible[index] || this.labelOpacity[index] !== opacity) {
      label.style.opacity = opacity;
      this.labelOpacity[index] = opacity;
    }

    if (this.labelActive[index] !== isActive) {
      label.classList.toggle("is-active", isActive);
      this.labelActive[index] = isActive;
    }

    if (this.labelLinked[index] !== isLinked) {
      label.classList.toggle("is-linked", isLinked);
      this.labelLinked[index] = isLinked;
    }

    this.labelVisible[index] = true;
    label.classList.add("is-visible");
  }

  private hideVisibleLabels(): void {
    this.labelVisible.forEach((visible, index) => {
      if (visible) {
        this.hideLabel(index);
      }
    });
  }

  private hideLabel(index: number): void {
    if (!this.labelVisible[index]) {
      return;
    }

    const label = this.nodeLabels[index];
    label.style.opacity = "0";
    label.classList.remove("is-active", "is-linked", "is-visible");
    this.labelVisible[index] = false;
    this.labelActive[index] = false;
    this.labelLinked[index] = false;
    this.labelOpacity[index] = "0";
  }

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const bounds = this.container.getBoundingClientRect();

    this.viewportLeft = bounds.left;
    this.viewportTop = bounds.top;
    this.viewportWidth = Math.max(bounds.width, width, 1);
    this.viewportHeight = Math.max(bounds.height, height, 1);

    this.cameraController.resize();
    this.webgl.setSize(width, height, false);

    if (!this.didSetInitialView) {
      this.resetView(true);
      this.didSetInitialView = true;
    }
  }

  private updateSelectedCameraTarget(): void {
    if (this.selectedIndex === -1 || !this.selectionAutoFollow) {
      return;
    }

    const node = this.nodes[this.selectedIndex];
    this.cameraController.followNode(node);
  }

  private updateGraphCameraTarget(): void {
    if (!this.graphAutoFollow || this.selectedIndex !== -1) {
      return;
    }

    this.cameraController.fitNodes(this.nodes);
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    this.clearNativeSelection();
    this.container.setPointerCapture(event.pointerId);
    this.pointerDownScreen.set(event.clientX, event.clientY);
    this.pointerDownNodeIndex = -1;
    this.pointerDownWasBackground = false;
    this.pointerDownWasFarFromNodes = false;
    const hitIndex = this.getNodeAtPointer(event);

    if (hitIndex !== -1) {
      this.startNodeDrag(hitIndex, event);
      return;
    }

    const bridgeIndex = this.getLabelBridgeAtPointer(event);

    if (bridgeIndex !== -1) {
      this.startNodeDrag(bridgeIndex, event);
      return;
    }

    const world = this.getWorldAtPointer(event);
    this.panAnchor.copy(world);
    this.graphAutoFollow = false;
    if (this.selectedIndex !== -1) {
      this.selectionAutoFollow = false;
    }
    this.hoveredIndex = -1;
    this.pointerDownWasBackground = true;
    this.pointerDownWasFarFromNodes = this.isPointerFarFromNodes(event);
    this.interactionMode = "pan-camera";
    this.setInteractionClasses();
  };

  private startNodeDrag(index: number, event: PointerEvent): void {
    const node = this.nodes[index];
    const world = this.getWorldAtPointer(event);
    this.draggedNode = node;
    this.hoveredIndex = index;
    this.pointerDownNodeIndex = index;
    if (this.selectedIndex !== -1) {
      this.selectionAutoFollow = false;
    }
    this.dragOffset.set((node.x ?? node.renderX) - world.x, (node.y ?? node.renderY) - world.y);
    node.fx = node.x ?? node.renderX;
    node.fy = node.y ?? node.renderY;
    this.interactionMode = "drag-node";
    this.simulation.alphaTarget(0.18).alpha(0.42);
    this.setInteractionClasses();
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.interactionMode === "drag-node" && this.draggedNode) {
      const world = this.getWorldAtPointer(event);
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
      const world = this.getWorldAtPointer(event);
      this.cameraController.panByWorldDelta(this.panAnchor.x - world.x, this.panAnchor.y - world.y);
      return;
    }

    if (this.selectedIndex !== -1) {
      this.setInteractionClasses();
      return;
    }

    const hitIndex = this.getHoverIndexAtPointer(event);
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

    if (this.pointerDownNodeIndex !== -1 && clickDistance < BACKGROUND_CLICK_DISTANCE) {
      this.selectNode(this.pointerDownNodeIndex, "pointer");
    } else if (
      this.pointerDownWasBackground &&
      this.pointerDownWasFarFromNodes &&
      clickDistance < BACKGROUND_CLICK_DISTANCE &&
      this.selectedIndex !== -1 &&
      this.isPointerFarFromNodes(event)
    ) {
      this.clearSelection();
    }

    this.interactionMode = "idle";
    this.pointerDownNodeIndex = -1;
    this.pointerDownWasBackground = false;
    this.pointerDownWasFarFromNodes = false;
    this.setInteractionClasses();
  };

  private handlePointerLeave = (): void => {
    if (this.interactionMode !== "idle") {
      return;
    }

    this.hoveredIndex = -1;
    this.setInteractionClasses();
  };

  private handleLabelPointerEnter = (event: PointerEvent): void => {
    if (this.selectedIndex !== -1 || this.interactionMode !== "idle") {
      return;
    }

    const label = event.currentTarget as HTMLSpanElement;
    const index = this.nodeLabels.indexOf(label);

    if (index === -1 || !this.labelVisible[index]) {
      return;
    }

    this.hoveredIndex = index;
    this.setInteractionClasses();
  };

  private handleLabelPointerLeave = (): void => {
    if (this.selectedIndex !== -1 || this.interactionMode !== "idle") {
      return;
    }

    this.hoveredIndex = -1;
    this.setInteractionClasses();
  };

  private handleLabelPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();

    if (event.button !== 0) {
      return;
    }

    const label = event.currentTarget as HTMLSpanElement;
    const index = this.nodeLabels.indexOf(label);

    if (index === -1 || !this.labelVisible[index]) {
      return;
    }

    this.clearNativeSelection();
    this.container.setPointerCapture(event.pointerId);
    this.pointerDownScreen.set(event.clientX, event.clientY);
    this.pointerDownWasBackground = false;
    this.pointerDownWasFarFromNodes = false;
    this.startNodeDrag(index, event);
  };

  private handleLabelPointerUp = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.handlePointerUp(event);
  };

  private stopLabelPointerEvent = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  private clearNativeSelection(): void {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
      return;
    }

    selection.removeAllRanges();
  }

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.graphAutoFollow = false;
    if (this.selectedIndex !== -1) {
      this.selectionAutoFollow = false;
    }
    this.updatePointer(event);
    this.wheelPointer.copy(this.pointer);
    this.pendingWheelDelta += this.normalizeWheelDelta(event);
    this.wheelCooldownFrames = 18;
  };

  private getNodeAtPointer(event: PointerEvent): number {
    this.updatePointer(event);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hit = this.raycaster.intersectObject(this.nodeMesh, false)[0];
    return hit?.instanceId ?? -1;
  }

  private getHoverIndexAtPointer(event: PointerEvent): number {
    const nodeIndex = this.getNodeAtPointer(event);

    if (nodeIndex !== -1) {
      return nodeIndex;
    }

    return this.getLabelBridgeAtPointer(event);
  }

  private getLabelBridgeAtPointer(event: PointerEvent): number {
    const screenX = event.clientX - this.viewportLeft;
    const screenY = event.clientY - this.viewportTop;

    for (let index = 0; index < this.nodes.length; index += 1) {
      if (!this.labelVisible[index]) {
        continue;
      }

      const node = this.nodes[index];
      const position = this.labelProjection.set(node.renderX, node.renderY, 0.32).project(this.camera);

      if (position.x < -1.12 || position.x > 1.12 || position.y < -1.12 || position.y > 1.12) {
        continue;
      }

      const labelRect = this.nodeLabels[index].getBoundingClientRect();
      const nodeScreenX = (position.x * 0.5 + 0.5) * this.viewportWidth;
      const nodeScreenY = (-position.y * 0.5 + 0.5) * this.viewportHeight;
      const nodeRadiusPx = node.radius * this.camera.zoom;
      const bridgeLeft = nodeScreenX - nodeRadiusPx - LABEL_HOVER_BRIDGE_PADDING;
      const bridgeRight = nodeScreenX + nodeRadiusPx + LABEL_HOVER_BRIDGE_PADDING;
      const bridgeTop = nodeScreenY - LABEL_HOVER_BRIDGE_PADDING;
      const bridgeBottom = labelRect.top - this.viewportTop + LABEL_HOVER_BRIDGE_PADDING;

      if (screenX >= bridgeLeft && screenX <= bridgeRight && screenY >= bridgeTop && screenY <= bridgeBottom) {
        return index;
      }
    }

    return -1;
  }

  private isPointerFarFromNodes(event: PointerEvent): boolean {
    const screenX = event.clientX - this.viewportLeft;
    const screenY = event.clientY - this.viewportTop;

    return this.nodes.every((node) => {
      const position = this.labelProjection.set(node.renderX, node.renderY, 0.32).project(this.camera);

      if (position.x < -1.2 || position.x > 1.2 || position.y < -1.2 || position.y > 1.2) {
        return true;
      }

      const nodeScreenX = (position.x * 0.5 + 0.5) * this.viewportWidth;
      const nodeScreenY = (-position.y * 0.5 + 0.5) * this.viewportHeight;
      const clearRadius = node.radius * this.camera.zoom + BACKGROUND_CLEAR_NODE_PADDING;
      return Math.hypot(screenX - nodeScreenX, screenY - nodeScreenY) > clearRadius;
    });
  }

  private getWorldAtPointer(event: PointerEvent | WheelEvent): THREE.Vector2 {
    this.updatePointer(event);
    return this.cameraController.screenToWorld(this.pointer);
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
    this.pointer.x = ((event.clientX - this.viewportLeft) / this.viewportWidth) * 2 - 1;
    this.pointer.y = -((event.clientY - this.viewportTop) / this.viewportHeight) * 2 + 1;
  }

  private selectNode(index: number, source: NodeSelectionSource = "programmatic"): void {
    const node = this.nodes[index];
    if (this.selectedIndex === -1) {
      this.preSelectionViewport = this.cameraController.getTargetViewport();
    }
    this.selectedIndex = index;
    this.hoveredIndex = index;
    this.selectionAutoFollow = true;
    this.graphAutoFollow = false;
    this.cameraController.setSelectedZoom();
    this.callbacks.onNodeSelect?.(node, this.linkedLinksByNode[index].size, source);
    this.updateSelectedCameraTarget();
    this.setInteractionClasses();
  }

  private setInteractionClasses(): void {
    this.container.classList.toggle("is-hovering", this.hoveredIndex !== -1 && this.interactionMode === "idle");
    this.container.classList.toggle("is-dragging-node", this.interactionMode === "drag-node");
    this.container.classList.toggle("is-panning", this.interactionMode === "pan-camera");
    this.container.classList.toggle("has-selection", this.selectedIndex !== -1);
  }

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.stopAnimation();
      return;
    }

    this.startAnimation();
  };

  private disposeScene(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();

    this.scene.traverse((object) => {
      const renderable = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };

      if (renderable.geometry) {
        geometries.add(renderable.geometry);
      }

      if (Array.isArray(renderable.material)) {
        renderable.material.forEach((material) => materials.add(material));
      } else if (renderable.material) {
        materials.add(renderable.material);
      }
    });

    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.scene.clear();
  }
}
