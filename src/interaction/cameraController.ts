import * as THREE from "three";

import { CAMERA_CONFIG } from "../config/graphConfig";
import type { GraphNode } from "../types";

export class CameraController {
  private readonly targetPosition = new THREE.Vector2();
  private targetZoom = 1;

  constructor(
    private readonly camera: THREE.OrthographicCamera,
    private readonly container: HTMLElement,
    private readonly panelElement: HTMLElement,
  ) {}

  resize(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  resetView(immediate = false): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const fitZoom = Math.min(width / CAMERA_CONFIG.fitWidth, height / CAMERA_CONFIG.fitHeight);
    this.targetPosition.set(0, 0);
    this.targetZoom = THREE.MathUtils.clamp(fitZoom, CAMERA_CONFIG.minFitZoom, CAMERA_CONFIG.maxFitZoom);

    if (immediate) {
      this.camera.position.set(this.targetPosition.x, this.targetPosition.y, 10);
      this.camera.zoom = this.targetZoom;
    }

    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  update(delta: number): void {
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

  setSelectedZoom(): void {
    this.targetZoom = THREE.MathUtils.clamp(CAMERA_CONFIG.selectedZoom, CAMERA_CONFIG.minZoom, CAMERA_CONFIG.maxZoom);
  }

  followNode(node: GraphNode): void {
    const offset = this.getPanelCameraOffset(this.targetZoom);
    this.targetPosition.set(node.renderX + offset.x, node.renderY + offset.y);
  }

  fitNodes(nodes: GraphNode[]): void {
    if (nodes.length === 0) {
      this.resetView();
      return;
    }

    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const padding = Math.min(Math.max(Math.min(width, height) * 0.16, 96), 220);
    const bounds = nodes.reduce(
      (box, node) => {
        const radius = Math.max(node.radius, 18);
        const x = node.renderX ?? node.x ?? 0;
        const y = node.renderY ?? node.y ?? 0;

        box.minX = Math.min(box.minX, x - radius);
        box.maxX = Math.max(box.maxX, x + radius);
        box.minY = Math.min(box.minY, y - radius);
        box.maxY = Math.max(box.maxY, y + radius);
        return box;
      },
      { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
    );
    const graphWidth = Math.max(bounds.maxX - bounds.minX, 120);
    const graphHeight = Math.max(bounds.maxY - bounds.minY, 120);
    const availableWidth = Math.max(width - padding * 2, width * 0.32);
    const availableHeight = Math.max(height - padding * 2, height * 0.32);
    const fitZoom = Math.min(availableWidth / graphWidth, availableHeight / graphHeight);

    this.targetPosition.set((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
    this.targetZoom = THREE.MathUtils.clamp(fitZoom, CAMERA_CONFIG.minZoom, CAMERA_CONFIG.maxZoom);
  }

  panByWorldDelta(deltaX: number, deltaY: number): void {
    this.camera.position.x += deltaX;
    this.camera.position.y += deltaY;
    this.targetPosition.set(this.camera.position.x, this.camera.position.y);
    this.camera.updateMatrixWorld();
  }

  screenToWorld(pointer: THREE.Vector2): THREE.Vector2 {
    this.camera.updateMatrixWorld();
    const world = new THREE.Vector3(pointer.x, pointer.y, 0).unproject(this.camera);
    return new THREE.Vector2(world.x, world.y);
  }

  zoomAtPointer(pointer: THREE.Vector2, wheelDelta: number): boolean {
    const before = this.targetWorldAtPointer(pointer);
    const zoomDelta = Math.exp(-wheelDelta * 0.0011);
    const nextZoom = THREE.MathUtils.clamp(this.targetZoom * zoomDelta, CAMERA_CONFIG.minZoom, CAMERA_CONFIG.maxZoom);

    if (nextZoom === this.targetZoom) {
      return false;
    }

    this.targetZoom = nextZoom;
    const offset = this.pointerOffsetForZoom(pointer, this.targetZoom);
    this.targetPosition.set(before.x - offset.x, before.y - offset.y);
    return true;
  }

  private targetWorldAtPointer(pointer: THREE.Vector2): THREE.Vector2 {
    const offset = this.pointerOffsetForZoom(pointer, this.targetZoom);
    return new THREE.Vector2(this.targetPosition.x + offset.x, this.targetPosition.y + offset.y);
  }

  private pointerOffsetForZoom(pointer: THREE.Vector2, zoom: number): THREE.Vector2 {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    return new THREE.Vector2((pointer.x * width) / (2 * zoom), (pointer.y * height) / (2 * zoom));
  }

  private getPanelCameraOffset(zoom: number): THREE.Vector2 {
    const panelRect = this.panelElement.getBoundingClientRect();
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const safeZoom = Math.max(zoom, CAMERA_CONFIG.minSafeZoom);
    const isBottomPanel = panelRect.width > width * CAMERA_CONFIG.mobilePanelWidthRatio && panelRect.top > height * CAMERA_CONFIG.mobilePanelTopRatio;

    if (isBottomPanel) {
      return new THREE.Vector2(0, -panelRect.height / (2 * safeZoom));
    }

    return new THREE.Vector2(panelRect.width / (2 * safeZoom), 0);
  }
}
