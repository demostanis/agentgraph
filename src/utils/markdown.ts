import MarkdownIt from "markdown-it";

const EXTERNAL_LINK_PATTERN = /^https?:\/\//i;

const markdownRenderer = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: true,
});

markdownRenderer.use(nodeLinkPlugin);
configureRenderer(markdownRenderer);

export function renderMarkdown(markdown: string): string {
  return markdownRenderer.render(markdown);
}

function nodeLinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("emphasis", "node_link", (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x5b || state.src.charCodeAt(state.pos + 1) !== 0x5b) {
      return false;
    }

    const labelStart = state.pos + 2;
    const labelEnd = state.src.indexOf("]]", labelStart);

    if (labelEnd === -1) {
      return false;
    }

    const label = state.src.slice(labelStart, labelEnd).trim();

    if (!label) {
      return false;
    }

    if (!silent) {
      const linkOpen = state.push("node_link_open", "a", 1);
      linkOpen.attrSet("href", "#");
      linkOpen.attrSet("data-node-link", label);

      const text = state.push("text", "", 0);
      text.content = label;

      state.push("node_link_close", "a", -1);
    }

    state.pos = labelEnd + 2;
    return true;
  });
}

function configureRenderer(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence;
  const defaultLinkOpen = md.renderer.rules.link_open;
  const defaultTableOpen = md.renderer.rules.table_open;
  const defaultTableClose = md.renderer.rules.table_close;

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const language = token.info.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";

    if (language === "mermaid") {
      const code = md.utils.escapeHtml(token.content);
      return `<div class="mermaid-diagram" aria-busy="true"><div class="mermaid">${code}</div><div class="mermaid-loading" aria-hidden="true"><span></span></div></div>`;
    }

    return defaultFence?.(tokens, idx, options, env, self) ?? self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet("href");

    if (href && EXTERNAL_LINK_PATTERN.test(href)) {
      token.attrSet("data-external-link", href);
      token.attrJoin("class", "external-link");
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }

    return defaultLinkOpen?.(tokens, idx, options, env, self) ?? self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
    tokens[idx].attrJoin("class", "node-content__table");
    const table = defaultTableOpen?.(tokens, idx, options, env, self) ?? self.renderToken(tokens, idx, options);
    return `<div class="node-content__table-wrap">${table}`;
  };

  md.renderer.rules.table_close = (tokens, idx, options, env, self) => {
    const table = defaultTableClose?.(tokens, idx, options, env, self) ?? self.renderToken(tokens, idx, options);
    return `${table}</div>`;
  };
}
