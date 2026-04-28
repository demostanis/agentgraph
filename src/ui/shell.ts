export type ShellElements = {
  app: HTMLDivElement;
  stage: HTMLDivElement;
  backButton: HTMLButtonElement;
  nodePanel: HTMLElement;
  nodeContent: HTMLDivElement;
};

export function mountShell(app: HTMLDivElement): ShellElements {
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

  const stage = app.querySelector<HTMLDivElement>("#graph-stage");
  const backButton = app.querySelector<HTMLButtonElement>("#back-button");
  const nodePanel = app.querySelector<HTMLElement>("#node-panel");
  const nodeContent = app.querySelector<HTMLDivElement>("#node-content");

  if (!stage || !backButton || !nodePanel || !nodeContent) {
    throw new Error("Renderer UI could not be initialized.");
  }

  return { app, stage, backButton, nodePanel, nodeContent };
}
