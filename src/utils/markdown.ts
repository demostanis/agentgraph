export function renderMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const html: string[] = [];
  let inList = false;
  let inCode = false;
  let codeLanguage = "";
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
        const code = escapeHtml(codeLines.join("\n"));
        const languageClass = getLanguageClass(codeLanguage);
        html.push(
          codeLanguage === "mermaid"
            ? `<div class="mermaid-diagram" aria-busy="true"><div class="mermaid">${code}</div><div class="mermaid-loading" aria-hidden="true"><span></span></div></div>`
            : `<pre><code${languageClass}>${code}</code></pre>`,
        );
        codeLines = [];
        codeLanguage = "";
        inCode = false;
      } else {
        closeList();
        codeLanguage = line.slice(3).trim().toLowerCase();
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
    .replace(/\[\[([^\]]+)\]\]/g, (_match, title: string) => `<a href="#" data-node-link="${title}">${title}</a>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function getLanguageClass(language: string): string {
  const normalized = language.replace(/[^a-z0-9_-]/gi, "").toLowerCase();
  return normalized ? ` class="language-${normalized}"` : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
