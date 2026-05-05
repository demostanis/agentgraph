import type { GraphNode } from "../types";
import { renderMarkdown } from "../utils/markdown";

type HighlightJs = typeof import("highlight.js/lib/core").default;
type Mermaid = typeof import("mermaid").default;

type LinkPreview = {
  url: string;
  host: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

const LINK_PREVIEW_WIDTH = 320;
const LINK_PREVIEW_HEIGHT = 214;
const MERMAID_MIN_ZOOM = 0.5;
const MERMAID_MAX_ZOOM = 3;
const MERMAID_ZOOM_STEP = 0.25;
const MERMAID_WHEEL_ZOOM_FACTOR = 1.12;
const MERMAID_CONTROLS_HIDE_DELAY = 1000;

type NodePanelCallbacks = {
  onNodeDelete?: (node: GraphNode) => void;
  onNodeLinkClick?: (title: string) => void;
  onNodeBack?: () => void;
};

export class NodePanel {
  private renderId = 0;
  private previewRequestId = 0;
  private previewHideTimeout = 0;
  private selectedNode: GraphNode | null = null;
  private previewTarget: HTMLAnchorElement | null = null;
  private readonly linkPreview = createLinkPreviewElement();
  private readonly linkPreviewCache = new Map<string, LinkPreview>();
  private readonly panelScroller: HTMLElement | null;

  constructor(
    private readonly panel: HTMLElement,
    private readonly toggleButton: HTMLButtonElement,
    private readonly deleteButton: HTMLButtonElement,
    private readonly deleteConfirm: HTMLDivElement,
    private readonly deleteConfirmTitle: HTMLSpanElement,
    private readonly deleteCancelButton: HTMLButtonElement,
    private readonly deleteConfirmButton: HTMLButtonElement,
    private readonly panelBackButton: HTMLButtonElement,
    private readonly content: HTMLDivElement,
    private readonly backButton: HTMLButtonElement,
    private readonly callbacks: NodePanelCallbacks = {},
  ) {
    this.panelScroller = this.content.closest<HTMLElement>(".node-panel__inner");
    this.content.addEventListener("click", this.handleContentClick);
    this.deleteButton.addEventListener("click", this.handleDeleteClick);
    this.deleteCancelButton.addEventListener("click", this.hideDeleteConfirm);
    this.deleteConfirmButton.addEventListener("click", this.confirmDelete);
    this.panelBackButton.addEventListener("click", this.handlePanelBackClick);
    this.toggleButton.addEventListener("click", this.toggleExpanded);
    this.linkPreview.addEventListener("mouseenter", this.clearLinkPreviewHide);
    this.linkPreview.addEventListener("mouseleave", this.scheduleHideLinkPreview);
    this.panelScroller?.addEventListener("scroll", this.repositionLinkPreview, { passive: true });
    window.addEventListener("resize", this.repositionLinkPreview);
    document.addEventListener("keydown", this.handleKeyDown);
    document.body.append(this.linkPreview);
  }

  show(node: GraphNode, linkCount: number, backlinkNodes: GraphNode[] = []): void {
    this.renderId += 1;
    this.selectedNode = node;
    this.hideLinkPreview();
    this.hideDeleteConfirm();
    this.deleteButton.disabled = false;
    this.deleteButton.setAttribute("aria-label", `Delete ${node.label}`);
    this.content.innerHTML = renderMarkdown(createNodeMarkdown(node));
    this.appendReferencedBySection(backlinkNodes);
    this.prepareExternalLinks();
    this.panel.classList.add("is-visible");
    this.backButton.classList.add("is-visible");
    void this.highlightCodeBlocks(this.renderId);
    void this.renderMermaidDiagrams(this.renderId);
  }

  hide(): void {
    this.renderId += 1;
    this.selectedNode = null;
    this.hideLinkPreview();
    this.hideDeleteConfirm();
    this.deleteButton.disabled = true;
    this.deleteButton.setAttribute("aria-label", "Delete selected node");
    this.setExpanded(false);
    this.panel.classList.remove("is-visible");
    this.setCanGoBack(false);
    this.backButton.classList.remove("is-visible");
  }

  setCanGoBack(canGoBack: boolean): void {
    this.panel.classList.toggle("has-node-history", canGoBack);
    this.panelBackButton.disabled = !canGoBack;
    this.panelBackButton.classList.toggle("is-visible", canGoBack);
  }

  dispose(): void {
    this.removeExternalLinkListeners();
    this.content.removeEventListener("click", this.handleContentClick);
    this.deleteButton.removeEventListener("click", this.handleDeleteClick);
    this.deleteCancelButton.removeEventListener("click", this.hideDeleteConfirm);
    this.deleteConfirmButton.removeEventListener("click", this.confirmDelete);
    this.panelBackButton.removeEventListener("click", this.handlePanelBackClick);
    this.toggleButton.removeEventListener("click", this.toggleExpanded);
    this.linkPreview.removeEventListener("mouseenter", this.clearLinkPreviewHide);
    this.linkPreview.removeEventListener("mouseleave", this.scheduleHideLinkPreview);
    this.panelScroller?.removeEventListener("scroll", this.repositionLinkPreview);
    window.removeEventListener("resize", this.repositionLinkPreview);
    document.removeEventListener("keydown", this.handleKeyDown);
    this.linkPreview.remove();
  }

  private handleDeleteClick = (): void => {
    if (!this.selectedNode) {
      return;
    }

    this.showDeleteConfirm();
  };

  private showDeleteConfirm(): void {
    if (!this.selectedNode) {
      return;
    }

    this.deleteConfirmTitle.textContent = this.selectedNode.label;
    this.deleteConfirm.classList.add("is-visible");
    this.deleteConfirm.setAttribute("aria-hidden", "false");
    this.deleteConfirmButton.focus();
  }

  private hideDeleteConfirm = (): void => {
    this.deleteConfirm.classList.remove("is-visible");
    this.deleteConfirm.setAttribute("aria-hidden", "true");
  };

  private confirmDelete = (): void => {
    if (!this.selectedNode) {
      return;
    }

    this.hideDeleteConfirm();
    this.callbacks.onNodeDelete?.(this.selectedNode);
  };

  private handlePanelBackClick = (): void => {
    this.callbacks.onNodeBack?.();
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.deleteConfirm.classList.contains("is-visible")) {
      this.hideDeleteConfirm();
      this.deleteButton.focus();
    }
  };

  private toggleExpanded = (): void => {
    this.setExpanded(!this.panel.classList.contains("is-expanded"));
  };

  private setExpanded(isExpanded: boolean): void {
    this.panel.classList.toggle("is-expanded", isExpanded);
    this.panel.closest(".shell")?.classList.toggle("has-expanded-panel", isExpanded);
    this.toggleButton.setAttribute("aria-expanded", String(isExpanded));
    this.toggleButton.setAttribute("aria-label", isExpanded ? "Collapse markdown panel" : "Expand markdown panel");
  }

  private handleContentClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const referencesToggle = target?.closest<HTMLButtonElement>("button[data-node-references-toggle]");

    if (referencesToggle) {
      event.preventDefault();
      this.toggleReferencedBy(referencesToggle);
      return;
    }

    const externalLink = target?.closest<HTMLAnchorElement>("a[data-external-link]");

    if (externalLink) {
      event.preventDefault();
      const url = externalLink.dataset.externalLink ?? externalLink.href;

      if (url) {
        void this.openExternalLink(url);
      }

      return;
    }

    const link = target?.closest<HTMLAnchorElement>("a[data-node-link]");

    if (!link) {
      return;
    }

    event.preventDefault();
    const title = link.dataset.nodeLink;

    if (title) {
      this.callbacks.onNodeLinkClick?.(title);
    }
  };

  private appendReferencedBySection(backlinkNodes: GraphNode[]): void {
    if (backlinkNodes.length === 0) {
      return;
    }

    this.content.append(createReferencedBySection(backlinkNodes));
  }

  private toggleReferencedBy(toggle: HTMLButtonElement): void {
    const section = toggle.closest<HTMLElement>(".node-references");
    const body = section?.querySelector<HTMLElement>(".node-references__body");
    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
    const nextExpanded = !isExpanded;

    toggle.setAttribute("aria-expanded", String(nextExpanded));
    section?.classList.toggle("is-expanded", nextExpanded);

    if (body) {
      body.hidden = !nextExpanded;
    }
  }

  private prepareExternalLinks(): void {
    Array.from(this.content.querySelectorAll<HTMLAnchorElement>("a[data-external-link]")).forEach((link) => {
      link.addEventListener("mouseenter", this.handleExternalLinkEnter);
      link.addEventListener("mouseleave", this.handleExternalLinkLeave);
      link.addEventListener("focus", this.handleExternalLinkEnter);
      link.addEventListener("blur", this.handleExternalLinkLeave);
    });
  }

  private removeExternalLinkListeners(): void {
    Array.from(this.content.querySelectorAll<HTMLAnchorElement>("a[data-external-link]")).forEach((link) => {
      link.removeEventListener("mouseenter", this.handleExternalLinkEnter);
      link.removeEventListener("mouseleave", this.handleExternalLinkLeave);
      link.removeEventListener("focus", this.handleExternalLinkEnter);
      link.removeEventListener("blur", this.handleExternalLinkLeave);
    });
  }

  private handleExternalLinkEnter = (event: Event): void => {
    const link = event.currentTarget as HTMLAnchorElement | null;

    if (link) {
      this.showExternalLinkPreview(link);
    }
  };

  private handleExternalLinkLeave = (): void => {
    this.scheduleHideLinkPreview();
  };

  private showExternalLinkPreview(link: HTMLAnchorElement): void {
    const url = link.dataset.externalLink ?? link.href;

    if (!url) {
      return;
    }

    this.previewTarget = link;
    this.clearLinkPreviewHide();
    this.positionLinkPreview(link);
    this.linkPreview.classList.add("is-visible");
    this.linkPreview.setAttribute("aria-hidden", "false");

    const requestId = ++this.previewRequestId;
    const cachedPreview = this.linkPreviewCache.get(url);

    if (cachedPreview) {
      this.renderLinkPreview(cachedPreview);
      return;
    }

    this.renderLinkPreviewLoading(url);
    void this.fetchLinkPreview(url)
      .then((preview) => {
        if (!this.isActiveLinkPreview(requestId, url)) {
          return;
        }

        this.linkPreviewCache.set(url, preview);
        this.renderLinkPreview(preview);
      })
      .catch((error) => {
        if (!this.isActiveLinkPreview(requestId, url)) {
          return;
        }

        this.renderLinkPreviewError(url, error);
      });
  }

  private scheduleHideLinkPreview = (): void => {
    this.clearLinkPreviewHide();
    this.previewHideTimeout = window.setTimeout(this.hideLinkPreview, 140);
  };

  private clearLinkPreviewHide = (): void => {
    if (this.previewHideTimeout) {
      window.clearTimeout(this.previewHideTimeout);
      this.previewHideTimeout = 0;
    }
  };

  private hideLinkPreview = (): void => {
    this.clearLinkPreviewHide();
    this.previewRequestId += 1;
    this.previewTarget = null;
    this.linkPreview.classList.remove("is-visible", "is-loading", "is-error");
    this.linkPreview.setAttribute("aria-hidden", "true");
    this.linkPreview.setAttribute("aria-busy", "false");
  };

  private repositionLinkPreview = (): void => {
    if (!this.previewTarget || !this.previewTarget.isConnected) {
      this.hideLinkPreview();
      return;
    }

    this.positionLinkPreview(this.previewTarget);
  };

  private positionLinkPreview(link: HTMLAnchorElement): void {
    const rect = link.getBoundingClientRect();
    const previewWidth = Math.min(LINK_PREVIEW_WIDTH, window.innerWidth - 32);
    const maxLeft = Math.max(16, window.innerWidth - previewWidth - 16);
    const left = Math.min(Math.max(16, rect.left), maxLeft);
    const belowTop = rect.bottom + 12;
    const aboveTop = rect.top - LINK_PREVIEW_HEIGHT - 12;
    const top = belowTop + LINK_PREVIEW_HEIGHT > window.innerHeight - 16 ? Math.max(16, aboveTop) : belowTop;

    this.linkPreview.style.left = `${left}px`;
    this.linkPreview.style.top = `${top}px`;
  }

  private renderLinkPreviewLoading(url: string): void {
    this.linkPreview.className = "link-preview is-visible is-loading";
    this.linkPreview.setAttribute("aria-busy", "true");
    this.linkPreview.replaceChildren(
      createPreviewSkeleton("link-preview__media"),
      createPreviewSkeletonGroup(getHostFromUrl(url)),
    );
  }

  private renderLinkPreview(preview: LinkPreview): void {
    this.linkPreview.className = "link-preview is-visible";
    this.linkPreview.setAttribute("aria-busy", "false");
    this.linkPreview.replaceChildren(createPreviewMedia(preview), createPreviewBody(preview));
  }

  private renderLinkPreviewError(url: string, error: unknown): void {
    const preview = createFallbackLinkPreview(url);
    const message = error instanceof Error ? error.message : String(error);

    this.linkPreview.className = "link-preview is-visible is-error";
    this.linkPreview.setAttribute("aria-busy", "false");
    this.linkPreview.replaceChildren(
      createPreviewMedia(preview),
      createPreviewBody({
        ...preview,
        title: "Preview unavailable",
        description: message || "Click to open this link in your browser.",
      }),
    );
  }

  private isActiveLinkPreview(requestId: number, url: string): boolean {
    return requestId === this.previewRequestId && (this.previewTarget?.dataset.externalLink ?? this.previewTarget?.href) === url;
  }

  private async fetchLinkPreview(url: string): Promise<LinkPreview> {
    if (!isTauriRuntime()) {
      await wait(260);
      return createFallbackLinkPreview(url);
    }

    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<LinkPreview>("fetch_link_preview", { url });
  }

  private async openExternalLink(url: string): Promise<void> {
    this.hideLinkPreview();

    if (isTauriRuntime()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("open_external_url", { url });
        return;
      } catch (error) {
        console.error("Could not open external link in the default browser.", error);
      }
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  private async highlightCodeBlocks(renderId: number): Promise<void> {
    const codeBlocks = Array.from(this.content.querySelectorAll<HTMLElement>("pre code"));

    if (codeBlocks.length === 0) {
      return;
    }

    const highlighter = await loadHighlighter();

    if (renderId !== this.renderId) {
      return;
    }

    codeBlocks.forEach((codeBlock) => {
      const languageClass = Array.from(codeBlock.classList).find((className) => className.startsWith("language-"));
      const language = languageClass?.replace("language-", "");

      if (languageClass && language && !highlighter.getLanguage(language)) {
        codeBlock.classList.remove(languageClass);
      }

      highlighter.highlightElement(codeBlock);
    });
  }

  private async renderMermaidDiagrams(renderId: number): Promise<void> {
    const diagrams = Array.from(this.content.querySelectorAll<HTMLElement>(".mermaid"));
    const containers = diagrams.map((diagram) => diagram.closest<HTMLElement>(".mermaid-diagram")).filter((container): container is HTMLElement => Boolean(container));

    if (diagrams.length === 0) {
      return;
    }

    try {
      const mermaid = await loadMermaid();

      if (renderId !== this.renderId) {
        return;
      }

      await mermaid.run({ nodes: diagrams });

      if (renderId !== this.renderId) {
        return;
      }

      containers.forEach((container) => {
        container.classList.add("is-rendered");
        container.setAttribute("aria-busy", "false");
        initializeMermaidZoom(container);
      });
    } catch (error) {
      containers.forEach((container) => {
        container.classList.add("is-error");
        container.setAttribute("aria-busy", "false");
        container.textContent = error instanceof Error ? error.message : "Mermaid diagram could not be rendered.";
      });
    }
  }
}

type MermaidZoomState = {
  zoom: number;
  baseWidth: number;
  baseHeight: number;
};

type MermaidZoomAnchor = {
  contentX: number;
  contentY: number;
  viewportX: number;
  viewportY: number;
};

type MermaidPanState = {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

type MermaidZoomControls = {
  element: HTMLDivElement;
  zoomOutButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  zoomInButton: HTMLButtonElement;
};

function initializeMermaidZoom(container: HTMLElement): void {
  if (container.dataset.mermaidZoomReady === "true") {
    return;
  }

  const viewport = container.querySelector<HTMLElement>(".mermaid-diagram__viewport");
  const diagram = container.querySelector<HTMLElement>(".mermaid");
  const svg = diagram?.querySelector<SVGSVGElement>("svg");

  if (!viewport || !diagram || !svg) {
    return;
  }

  const state: MermaidZoomState = {
    zoom: 1,
    baseWidth: 0,
    baseHeight: 0,
  };
  const controls = createMermaidZoomControls();
  let panState: MermaidPanState | null = null;
  let controlsHideTimeout = 0;

  container.dataset.mermaidZoomReady = "true";
  container.classList.add("is-zoomable");
  measureMermaidBase(svg, state);
  updateMermaidZoomControls(controls, state);
  container.append(controls.element);

  const setZoom = (nextZoom: number, anchor?: MermaidZoomAnchor): void => {
    const zoom = clampMermaidZoom(nextZoom);

    if (zoom === state.zoom) {
      return;
    }

    const previousZoom = state.zoom;
    const zoomAnchor = anchor ?? createCenteredMermaidZoomAnchor(viewport);

    if (previousZoom === 1) {
      measureMermaidBase(svg, state);
    }

    state.zoom = zoom;
    applyMermaidZoom(svg, state);
    updateMermaidZoomControls(controls, state);
    preserveMermaidZoomAnchor(viewport, zoomAnchor, previousZoom, state.zoom);
  };

  const hideControls = (): void => {
    window.clearTimeout(controlsHideTimeout);
    controlsHideTimeout = 0;
    container.classList.remove("is-controls-visible");
  };

  const showControls = (): void => {
    container.classList.add("is-controls-visible");
    window.clearTimeout(controlsHideTimeout);
    controlsHideTimeout = window.setTimeout(hideControls, MERMAID_CONTROLS_HIDE_DELAY);
  };

  controls.zoomOutButton.addEventListener("click", (event) => {
    event.preventDefault();
    setZoom(state.zoom - MERMAID_ZOOM_STEP);
  });
  controls.resetButton.addEventListener("click", (event) => {
    event.preventDefault();
    setZoom(1);
  });
  controls.zoomInButton.addEventListener("click", (event) => {
    event.preventDefault();
    setZoom(state.zoom + MERMAID_ZOOM_STEP);
  });

  viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      showControls();
      const factor = event.deltaY < 0 ? MERMAID_WHEEL_ZOOM_FACTOR : 1 / MERMAID_WHEEL_ZOOM_FACTOR;
      setZoom(state.zoom * factor, createPointerMermaidZoomAnchor(viewport, event));
    },
    { passive: false },
  );

  viewport.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setZoom(state.zoom + MERMAID_ZOOM_STEP);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      setZoom(state.zoom - MERMAID_ZOOM_STEP);
    } else if (event.key === "0") {
      event.preventDefault();
      setZoom(1);
    }
  });

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.pointerType === "touch" || isMermaidZoomControlTarget(event.target)) {
      return;
    }

    showControls();
    panState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
    container.classList.add("is-panning");
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - panState.startX;
    const deltaY = event.clientY - panState.startY;

    if (Math.abs(deltaX) + Math.abs(deltaY) > 2) {
      event.preventDefault();
    }

    viewport.scrollLeft = panState.scrollLeft - deltaX;
    viewport.scrollTop = panState.scrollTop - deltaY;
  });

  container.addEventListener("mouseenter", showControls);
  container.addEventListener("mousemove", showControls);
  container.addEventListener("mouseleave", hideControls);

  const finishPan = (event: PointerEvent): void => {
    if (!panState || panState.pointerId !== event.pointerId) {
      return;
    }

    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    panState = null;
    container.classList.remove("is-panning");
  };

  viewport.addEventListener("pointerup", finishPan);
  viewport.addEventListener("pointercancel", finishPan);
  viewport.addEventListener("lostpointercapture", finishPan);
}

function createMermaidZoomControls(): MermaidZoomControls {
  const element = document.createElement("div");
  const zoomOutButton = createMermaidZoomButton("-", "Zoom Mermaid diagram out");
  const resetButton = createMermaidZoomButton("100%", "Reset Mermaid diagram zoom");
  const zoomInButton = createMermaidZoomButton("+", "Zoom Mermaid diagram in");

  element.className = "mermaid-zoom-controls";
  element.setAttribute("aria-label", "Mermaid zoom controls");
  resetButton.classList.add("mermaid-zoom-button--value");
  element.append(zoomOutButton, resetButton, zoomInButton);

  return {
    element,
    zoomOutButton,
    resetButton,
    zoomInButton,
  };
}

function createMermaidZoomButton(label: string, ariaLabel: string): HTMLButtonElement {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "mermaid-zoom-button";
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel);
  return button;
}

function updateMermaidZoomControls(controls: MermaidZoomControls, state: MermaidZoomState): void {
  const percent = Math.round(state.zoom * 100);

  controls.zoomOutButton.disabled = state.zoom <= MERMAID_MIN_ZOOM;
  controls.zoomInButton.disabled = state.zoom >= MERMAID_MAX_ZOOM;
  controls.resetButton.textContent = `${percent}%`;
  controls.resetButton.setAttribute("aria-label", `Reset Mermaid diagram zoom to 100%. Current zoom is ${percent}%.`);
}

function measureMermaidBase(svg: SVGSVGElement, state: MermaidZoomState): void {
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const width = rect.width || viewBox.width || getSvgNumberAttribute(svg, "width");
  const height = rect.height || viewBox.height || getSvgNumberAttribute(svg, "height");

  state.baseWidth = Math.max(1, width / state.zoom);
  state.baseHeight = Math.max(1, height / state.zoom);
}

function applyMermaidZoom(svg: SVGSVGElement, state: MermaidZoomState): void {
  if (state.zoom === 1) {
    svg.style.width = "";
    svg.style.height = "";
    svg.style.maxWidth = "";
    return;
  }

  svg.style.width = `${state.baseWidth * state.zoom}px`;
  svg.style.height = `${state.baseHeight * state.zoom}px`;
  svg.style.maxWidth = "none";
}

function createCenteredMermaidZoomAnchor(viewport: HTMLElement): MermaidZoomAnchor {
  return {
    contentX: viewport.scrollLeft + viewport.clientWidth / 2,
    contentY: viewport.scrollTop + viewport.clientHeight / 2,
    viewportX: viewport.clientWidth / 2,
    viewportY: viewport.clientHeight / 2,
  };
}

function createPointerMermaidZoomAnchor(viewport: HTMLElement, event: WheelEvent): MermaidZoomAnchor {
  const rect = viewport.getBoundingClientRect();
  const viewportX = event.clientX - rect.left;
  const viewportY = event.clientY - rect.top;

  return {
    contentX: viewport.scrollLeft + viewportX,
    contentY: viewport.scrollTop + viewportY,
    viewportX,
    viewportY,
  };
}

function preserveMermaidZoomAnchor(viewport: HTMLElement, anchor: MermaidZoomAnchor, previousZoom: number, nextZoom: number): void {
  window.requestAnimationFrame(() => {
    viewport.scrollLeft = (anchor.contentX / previousZoom) * nextZoom - anchor.viewportX;
    viewport.scrollTop = (anchor.contentY / previousZoom) * nextZoom - anchor.viewportY;
  });
}

function clampMermaidZoom(zoom: number): number {
  const clamped = Math.min(MERMAID_MAX_ZOOM, Math.max(MERMAID_MIN_ZOOM, zoom));

  return Math.round(clamped * 100) / 100;
}

function getSvgNumberAttribute(svg: SVGSVGElement, name: string): number {
  const value = svg.getAttribute(name);
  const number = value ? Number.parseFloat(value) : 0;

  return Number.isFinite(number) ? number : 0;
}

function isMermaidZoomControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".mermaid-zoom-controls"));
}

function createLinkPreviewElement(): HTMLDivElement {
  const preview = document.createElement("div");
  preview.className = "link-preview";
  preview.setAttribute("role", "tooltip");
  preview.setAttribute("aria-hidden", "true");
  preview.setAttribute("aria-busy", "false");
  return preview;
}

let referencedBySectionId = 0;

function createReferencedBySection(backlinkNodes: GraphNode[]): HTMLElement {
  const section = document.createElement("section");
  const toggle = document.createElement("button");
  const label = document.createElement("span");
  const count = document.createElement("span");
  const body = document.createElement("div");
  const list = document.createElement("ul");
  const bodyId = `node-references-${++referencedBySectionId}`;

  section.className = "node-references";
  toggle.className = "node-references__toggle";
  toggle.type = "button";
  toggle.dataset.nodeReferencesToggle = "";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", bodyId);
  label.className = "node-references__label";
  label.textContent = "Referenced by";
  count.className = "node-references__count";
  count.textContent = String(backlinkNodes.length);
  body.id = bodyId;
  body.className = "node-references__body";
  body.hidden = true;

  backlinkNodes.forEach((backlinkNode) => {
    const item = document.createElement("li");
    const link = document.createElement("a");

    link.href = "#";
    link.dataset.nodeLink = backlinkNode.label;
    link.textContent = backlinkNode.label;
    item.append(link);
    list.append(item);
  });

  toggle.append(createChevronDownIcon(), label, count);
  body.append(list);
  section.append(toggle, body);
  return section;
}

function createChevronDownIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "node-references__icon lucide lucide-chevron-down");
  svg.setAttribute("aria-hidden", "true");
  path.setAttribute("d", "m6 9 6 6 6-6");
  svg.append(path);
  return svg;
}

function createPreviewSkeleton(className: string): HTMLDivElement {
  const skeleton = document.createElement("div");
  skeleton.className = `${className} link-preview__skeleton`;
  return skeleton;
}

function createPreviewSkeletonGroup(host: string): HTMLDivElement {
  const body = document.createElement("div");
  const eyebrow = document.createElement("div");
  const title = createPreviewSkeleton("link-preview__title");
  const description = createPreviewSkeleton("link-preview__description");
  const url = createPreviewSkeleton("link-preview__url");

  body.className = "link-preview__body";
  eyebrow.className = "link-preview__eyebrow";
  eyebrow.textContent = host;
  body.append(eyebrow, title, description, url);
  return body;
}

function createPreviewMedia(preview: LinkPreview): HTMLDivElement {
  const media = document.createElement("div");
  media.className = "link-preview__media";

  if (preview.image) {
    const image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.loading = "lazy";
    image.src = preview.image;
    image.addEventListener("error", () => renderPreviewMediaFallback(media, preview.host), { once: true });
    media.append(image);
  } else {
    renderPreviewMediaFallback(media, preview.host);
  }

  return media;
}

function renderPreviewMediaFallback(media: HTMLDivElement, host: string): void {
  media.className = "link-preview__media link-preview__media--fallback";
  media.textContent = getHostInitial(host);
}

function createPreviewBody(preview: LinkPreview): HTMLDivElement {
  const body = document.createElement("div");
  const eyebrow = document.createElement("div");
  const title = document.createElement("strong");
  const description = document.createElement("p");
  const url = document.createElement("span");

  body.className = "link-preview__body";
  eyebrow.className = "link-preview__eyebrow";
  title.className = "link-preview__title";
  description.className = "link-preview__description";
  url.className = "link-preview__url";
  eyebrow.textContent = preview.siteName || preview.host;
  title.textContent = preview.title || preview.host;
  description.textContent = preview.description || "Click to open this link in your browser.";
  url.textContent = preview.url;
  body.append(eyebrow, title, description, url);
  return body;
}

function createFallbackLinkPreview(url: string): LinkPreview {
  const host = getHostFromUrl(url);

  return {
    url,
    host,
    title: host,
    description: "Click to open this link in your browser.",
    image: null,
    siteName: null,
  };
}

function getHostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function getHostInitial(host: string): string {
  return host.trim().replace(/^www\./i, "").charAt(0).toUpperCase() || "?";
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

let highlighterLoader: Promise<HighlightJs> | null = null;

function loadHighlighter(): Promise<HighlightJs> {
  highlighterLoader ??= Promise.all([
    import("highlight.js/lib/core"),
    import("highlight.js/lib/languages/bash"),
    import("highlight.js/lib/languages/css"),
    import("highlight.js/lib/languages/javascript"),
    import("highlight.js/lib/languages/json"),
    import("highlight.js/lib/languages/markdown"),
    import("highlight.js/lib/languages/typescript"),
    import("highlight.js/lib/languages/xml"),
  ]).then(([{ default: highlighter }, bash, css, javascript, json, markdown, typescript, xml]) => {
    highlighter.registerLanguage("bash", bash.default);
    highlighter.registerLanguage("css", css.default);
    highlighter.registerLanguage("javascript", javascript.default);
    highlighter.registerLanguage("json", json.default);
    highlighter.registerLanguage("markdown", markdown.default);
    highlighter.registerLanguage("typescript", typescript.default);
    highlighter.registerLanguage("xml", xml.default);
    highlighter.registerAliases(["sh", "shell"], { languageName: "bash" });
    highlighter.registerAliases("js", { languageName: "javascript" });
    highlighter.registerAliases("ts", { languageName: "typescript" });
    highlighter.registerAliases(["html", "svg"], { languageName: "xml" });
    return highlighter;
  });
  return highlighterLoader;
}

let mermaidLoader: Promise<Mermaid> | null = null;

function loadMermaid(): Promise<Mermaid> {
  mermaidLoader ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "strict",
      fontFamily: "IBM Plex Mono, monospace",
    });
    return mermaid;
  });

  return mermaidLoader;
}

function createNodeMarkdown(node: GraphNode): string {
  return node.markdown.trim();
}
