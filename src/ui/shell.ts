export type ShellElements = {
  app: HTMLDivElement;
  stage: HTMLDivElement;
  backButton: HTMLButtonElement;
  nodePanel: HTMLElement;
  nodePanelToggle: HTMLButtonElement;
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
        <button id="node-panel-toggle" class="node-panel__toggle" type="button" aria-label="Expand markdown panel" aria-expanded="false">
          <svg class="node-panel__toggle-icon node-panel__toggle-icon--expand" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          <svg class="node-panel__toggle-icon node-panel__toggle-icon--collapse" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        <div class="node-panel__inner">
          <div id="node-content" class="node-content"></div>
        </div>
      </aside>
    </main>
  `;

  const stage = app.querySelector<HTMLDivElement>("#graph-stage");
  const backButton = app.querySelector<HTMLButtonElement>("#back-button");
  const nodePanel = app.querySelector<HTMLElement>("#node-panel");
  const nodePanelToggle = app.querySelector<HTMLButtonElement>("#node-panel-toggle");
  const nodeContent = app.querySelector<HTMLDivElement>("#node-content");

  if (!stage || !backButton || !nodePanel || !nodePanelToggle || !nodeContent) {
    throw new Error("Renderer UI could not be initialized.");
  }

  return { app, stage, backButton, nodePanel, nodePanelToggle, nodeContent };
}
