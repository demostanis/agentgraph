import type { GraphNode } from "../types";
import { renderMarkdown } from "../utils/markdown";

type HighlightJs = typeof import("highlight.js/lib/core").default;
type Mermaid = typeof import("mermaid").default;

type NodePanelCallbacks = {
  onNodeDelete?: (node: GraphNode) => void;
  onNodeLinkClick?: (title: string) => void;
  onNodeBack?: () => void;
};

export class NodePanel {
  private renderId = 0;
  private selectedNode: GraphNode | null = null;

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
    this.content.addEventListener("click", this.handleContentClick);
    this.deleteButton.addEventListener("click", this.handleDeleteClick);
    this.deleteCancelButton.addEventListener("click", this.hideDeleteConfirm);
    this.deleteConfirmButton.addEventListener("click", this.confirmDelete);
    this.panelBackButton.addEventListener("click", this.handlePanelBackClick);
    this.toggleButton.addEventListener("click", this.toggleExpanded);
    document.addEventListener("keydown", this.handleKeyDown);
  }

  show(node: GraphNode, linkCount: number, backlinkNodes: GraphNode[] = []): void {
    this.renderId += 1;
    this.selectedNode = node;
    this.hideDeleteConfirm();
    this.deleteButton.disabled = false;
    this.deleteButton.setAttribute("aria-label", `Delete ${node.label}`);
    this.content.innerHTML = renderMarkdown(createNodeMarkdown(node, backlinkNodes));
    this.panel.classList.add("is-visible");
    this.backButton.classList.add("is-visible");
    void this.highlightCodeBlocks(this.renderId);
    void this.renderMermaidDiagrams(this.renderId);
  }

  hide(): void {
    this.renderId += 1;
    this.selectedNode = null;
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
    this.content.removeEventListener("click", this.handleContentClick);
    this.deleteButton.removeEventListener("click", this.handleDeleteClick);
    this.deleteCancelButton.removeEventListener("click", this.hideDeleteConfirm);
    this.deleteConfirmButton.removeEventListener("click", this.confirmDelete);
    this.panelBackButton.removeEventListener("click", this.handlePanelBackClick);
    this.toggleButton.removeEventListener("click", this.toggleExpanded);
    document.removeEventListener("keydown", this.handleKeyDown);
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
    const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[data-node-link]");

    if (!link) {
      return;
    }

    event.preventDefault();
    const title = link.dataset.nodeLink;

    if (title) {
      this.callbacks.onNodeLinkClick?.(title);
    }
  };

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
