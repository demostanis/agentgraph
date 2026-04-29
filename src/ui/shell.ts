export type ShellElements = {
  app: HTMLDivElement;
  stage: HTMLDivElement;
  backButton: HTMLButtonElement;
  timeFilter: HTMLElement;
  timeFilterCurrent: HTMLInputElement;
  timeFilterSpan: HTMLInputElement;
  timeFilterCurrentLabel: HTMLSpanElement;
  timeFilterToggle: HTMLButtonElement;
  nodeSearch: HTMLElement;
  nodeSearchForm: HTMLFormElement;
  nodeSearchInput: HTMLInputElement;
  nodeSearchStatus: HTMLParagraphElement;
  nodeSearchResults: HTMLDivElement;
  nodePanel: HTMLElement;
  nodePanelToggle: HTMLButtonElement;
  nodeDeleteButton: HTMLButtonElement;
  nodeDeleteConfirm: HTMLDivElement;
  nodeDeleteConfirmTitle: HTMLSpanElement;
  nodeDeleteCancel: HTMLButtonElement;
  nodeDeleteConfirmButton: HTMLButtonElement;
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
      <section id="time-filter" class="time-filter" aria-label="Filter nodes by time; double click to toggle span mode">
        <div class="time-filter__readout">
          <span id="time-filter-current-label">No dates</span>
          <button id="time-filter-toggle" class="time-filter__toggle" type="button" aria-label="Show time slider" aria-expanded="false">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        </div>
        <div class="time-filter__range-stack">
          <input id="time-filter-current" class="time-filter__range time-filter__range--current" type="range" min="0" max="0" value="0" step="any" aria-label="Current node time" />
          <input id="time-filter-span" class="time-filter__range time-filter__range--span" type="range" min="0" max="0" value="0" step="any" aria-label="Time span start" />
        </div>
      </section>
      <section id="node-search" class="node-search" aria-label="Search nodes">
        <form id="node-search-form" class="node-search__form" role="search">
          <label class="node-search__label" for="node-search-input">Search nodes</label>
          <div class="node-search__input-wrap">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m14.2 14.2 3 3" />
              <circle cx="8.7" cy="8.7" r="5.8" />
            </svg>
            <input id="node-search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Search nodes..." aria-describedby="node-search-status" />
          </div>
        </form>
        <p id="node-search-status" class="node-search__status"></p>
        <div id="node-search-results" class="node-search__results" role="listbox" aria-label="Node search results"></div>
      </section>
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
        <button id="node-delete-button" class="node-delete-button" type="button" aria-label="Delete selected node">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </button>
        <div id="node-delete-confirm" class="node-delete-confirm" role="dialog" aria-hidden="true" aria-label="Delete node confirmation">
          <p>Delete node?</p>
          <strong id="node-delete-confirm-title"></strong>
          <div class="node-delete-confirm__actions">
            <button id="node-delete-cancel" type="button">Cancel</button>
            <button id="node-delete-confirm-button" type="button">Delete</button>
          </div>
        </div>
      </aside>
    </main>
  `;

  const stage = app.querySelector<HTMLDivElement>("#graph-stage");
  const backButton = app.querySelector<HTMLButtonElement>("#back-button");
  const timeFilter = app.querySelector<HTMLElement>("#time-filter");
  const timeFilterCurrent = app.querySelector<HTMLInputElement>("#time-filter-current");
  const timeFilterSpan = app.querySelector<HTMLInputElement>("#time-filter-span");
  const timeFilterCurrentLabel = app.querySelector<HTMLSpanElement>("#time-filter-current-label");
  const timeFilterToggle = app.querySelector<HTMLButtonElement>("#time-filter-toggle");
  const nodeSearch = app.querySelector<HTMLElement>("#node-search");
  const nodeSearchForm = app.querySelector<HTMLFormElement>("#node-search-form");
  const nodeSearchInput = app.querySelector<HTMLInputElement>("#node-search-input");
  const nodeSearchStatus = app.querySelector<HTMLParagraphElement>("#node-search-status");
  const nodeSearchResults = app.querySelector<HTMLDivElement>("#node-search-results");
  const nodePanel = app.querySelector<HTMLElement>("#node-panel");
  const nodePanelToggle = app.querySelector<HTMLButtonElement>("#node-panel-toggle");
  const nodeDeleteButton = app.querySelector<HTMLButtonElement>("#node-delete-button");
  const nodeDeleteConfirm = app.querySelector<HTMLDivElement>("#node-delete-confirm");
  const nodeDeleteConfirmTitle = app.querySelector<HTMLSpanElement>("#node-delete-confirm-title");
  const nodeDeleteCancel = app.querySelector<HTMLButtonElement>("#node-delete-cancel");
  const nodeDeleteConfirmButton = app.querySelector<HTMLButtonElement>("#node-delete-confirm-button");
  const nodeContent = app.querySelector<HTMLDivElement>("#node-content");

  if (
    !stage ||
    !backButton ||
    !timeFilter ||
    !timeFilterCurrent ||
    !timeFilterSpan ||
    !timeFilterCurrentLabel ||
    !timeFilterToggle ||
    !nodeSearch ||
    !nodeSearchForm ||
    !nodeSearchInput ||
    !nodeSearchStatus ||
    !nodeSearchResults ||
    !nodePanel ||
    !nodePanelToggle ||
    !nodeDeleteButton ||
    !nodeDeleteConfirm ||
    !nodeDeleteConfirmTitle ||
    !nodeDeleteCancel ||
    !nodeDeleteConfirmButton ||
    !nodeContent
  ) {
    throw new Error("Renderer UI could not be initialized.");
  }

  return {
    app,
    stage,
    backButton,
    timeFilter,
    timeFilterCurrent,
    timeFilterSpan,
    timeFilterCurrentLabel,
    timeFilterToggle,
    nodeSearch,
    nodeSearchForm,
    nodeSearchInput,
    nodeSearchStatus,
    nodeSearchResults,
    nodePanel,
    nodePanelToggle,
    nodeDeleteButton,
    nodeDeleteConfirm,
    nodeDeleteConfirmTitle,
    nodeDeleteCancel,
    nodeDeleteConfirmButton,
    nodeContent,
  };
}
