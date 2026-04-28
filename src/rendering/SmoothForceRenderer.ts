import type { Simulation } from "d3-force";
import * as THREE from "three";

import { ACCENT_COLOR_HEX } from "../config/graphConfig";
import { CameraController } from "../interaction/cameraController";
import { InputController } from "../interaction/inputController";
import type { GraphLink, GraphNode, InteractionMode } from "../types";
import { createGlowPointMaterial } from "./glowMaterial";
import { createTopology } from "./topology";

const ACCENT_COLOR = new THREE.Color(ACCENT_COLOR_HEX);

type SmoothForceRendererCallbacks = {
  onNodeSelect?: (node: GraphNode, linkCount: number) => void;
  onSelectionClear?: () => void;
};

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
  private readonly focusLevels: number[];
  private readonly linkedNodesByNode: Array<Set<number>>;
  private readonly linkedLinksByNode: Array<Set<number>>;
  private readonly dragOffset = new THREE.Vector2();
  private readonly panAnchor = new THREE.Vector2();
  private readonly pointerDownScreen = new THREE.Vector2();
  private readonly fixedStep = 1 / 60;
  private readonly cameraController: CameraController;
  private readonly inputController: InputController;
  private readonly container: HTMLDivElement;
  private readonly nodes: GraphNode[];
  private readonly links: GraphLink[];
  private readonly simulation: Simulation<GraphNode, GraphLink>;
  private readonly callbacks: SmoothForceRendererCallbacks;
  private overlayLevel = 0;
  private animationFrame = 0;
  private accumulator = 0;
  private draggedNode: GraphNode | null = null;
  private pointerDownNodeIndex = -1;
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
    this.cameraController = new CameraController(this.camera, this.container, panelElement);

    this.linkPositions = new Float32Array(this.links.length * 6);
    this.highlightLinkPositions = new Float32Array(this.links.length * 6);
    this.focusLevels = this.nodes.map(() => 0);
    const topology = createTopology(this.nodes, this.links);
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

    this.nodeGlowMaterial = createGlowPointMaterial();
    this.hoverGlowMaterial = createGlowPointMaterial(ACCENT_COLOR);

    const nodeGlowPoints = new THREE.Points(this.nodeGlowGeometry, this.nodeGlowMaterial);
    nodeGlowPoints.frustumCulled = false;
    nodeGlowPoints.renderOrder = 1.5;
    this.scene.add(nodeGlowPoints);

    this.nodeMesh = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, this.nodes.length);
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
    this.connectedNodeMesh = new THREE.InstancedMesh(nodeGeometry, this.connectedNodeMaterial, this.nodes.length);
    this.connectedNodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.connectedNodeMesh.frustumCulled = false;
    this.connectedNodeMesh.renderOrder = 6;
    this.scene.add(this.connectedNodeMesh);

    this.accentNodeMaterial = new THREE.MeshBasicMaterial({ color: ACCENT_COLOR, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    this.accentNodeMesh = new THREE.InstancedMesh(nodeGeometry, this.accentNodeMaterial, this.nodes.length);
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
    this.cameraController.resetView(immediate);
  }

  clearSelection = (): void => {
    this.selectedIndex = -1;
    this.hoveredIndex = -1;
    this.selectionAutoFollow = false;
    this.resetView();
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
    this.nodeLabels.forEach((label) => label.remove());
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

    let steps = 0;
    while (this.accumulator >= this.fixedStep && steps < 4) {
      if (this.simulation.alpha() > this.simulation.alphaMin()) {
        this.simulation.tick();
      }
      this.accumulator -= this.fixedStep;
      steps += 1;
    }

    this.updateSelectedCameraTarget();
    this.cameraController.update(delta);
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

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);

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
      const world = this.getWorldAtPointer(event);
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

    const world = this.getWorldAtPointer(event);
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
    this.updatePointer(event);
    this.cameraController.zoomAtPointer(this.pointer, this.normalizeWheelDelta(event));
  };

  private getNodeAtPointer(event: PointerEvent): number {
    this.updatePointer(event);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hit = this.raycaster.intersectObject(this.nodeMesh, false)[0];
    return hit?.instanceId ?? -1;
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
    this.cameraController.setSelectedZoom();
    this.callbacks.onNodeSelect?.(node, this.linkedLinksByNode[index].size);
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
