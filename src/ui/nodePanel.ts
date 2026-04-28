import type { GraphNode } from "../types";
import { renderMarkdown } from "../utils/markdown";

type HighlightJs = typeof import("highlight.js/lib/core").default;
type Mermaid = typeof import("mermaid").default;

type NodePanelCallbacks = {
  onNodeLinkClick?: (title: string) => void;
};

export class NodePanel {
  private renderId = 0;

  constructor(
    private readonly panel: HTMLElement,
    private readonly toggleButton: HTMLButtonElement,
    private readonly content: HTMLDivElement,
    private readonly backButton: HTMLButtonElement,
    private readonly callbacks: NodePanelCallbacks = {},
  ) {
    this.content.addEventListener("click", this.handleContentClick);
    this.toggleButton.addEventListener("click", this.toggleExpanded);
  }

  show(node: GraphNode, linkCount: number): void {
    this.renderId += 1;
    this.content.innerHTML = renderMarkdown(createNodeMarkdown(node));
    this.panel.classList.add("is-visible");
    this.backButton.classList.add("is-visible");
    void this.highlightCodeBlocks(this.renderId);
    void this.renderMermaidDiagrams(this.renderId);
  }

  hide(): void {
    this.renderId += 1;
    this.setExpanded(false);
    this.panel.classList.remove("is-visible");
    this.backButton.classList.remove("is-visible");
  }

  dispose(): void {
    this.content.removeEventListener("click", this.handleContentClick);
    this.toggleButton.removeEventListener("click", this.toggleExpanded);
  }

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

function createNodeMarkdown(node: GraphNode): string {
  return node.markdown.trim();
}
