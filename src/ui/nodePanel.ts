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
    this.content.innerHTML = renderMarkdown(createNodeMarkdown(node, backlinkNodes));
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
      containers.forEach((container) => {
        container.classList.add("is-rendered");
        container.setAttribute("aria-busy", "false");
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

function createLinkPreviewElement(): HTMLDivElement {
  const preview = document.createElement("div");
  preview.className = "link-preview";
  preview.setAttribute("role", "tooltip");
  preview.setAttribute("aria-hidden", "true");
  preview.setAttribute("aria-busy", "false");
  return preview;
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

function createNodeMarkdown(node: GraphNode, backlinkNodes: GraphNode[]): string {
  const backlinks = backlinkNodes.map((backlinkNode) => `- [[${backlinkNode.label}]]`).join("\n");

  if (!backlinks) {
    return node.markdown.trim();
  }

  return `
${node.markdown.trim()}

## Referenced by

${backlinks}
`.trim();
}
