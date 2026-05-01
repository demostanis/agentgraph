import { loadNodeGraph, searchNodes, watchNodeGraph } from "./data/nodeGraph";
import { SmoothForceRenderer } from "./rendering/SmoothForceRenderer";
import { createForceSimulation } from "./simulation/forceSimulation";
import type { Graph, GraphLink, GraphNode, NodeSearchResult } from "./types";
import { NodePanel } from "./ui/nodePanel";
import { mountShell } from "./ui/shell";

export type AppController = {
  destroy: () => void;
};

type TimeFilterState = {
  mode: "fixed" | "span";
  buckets: TimeBucket[];
  currentBucketIndex: number;
  spanStartBucketIndex: number;
  currentPosition: number;
  spanStartPosition: number;
};

type TimeBucket = {
  startTimeMs: number;
  endTimeMs: number;
};

type TimeSpanInclusionMode = "selected-node" | "current-span";

const CLUSTER_GAP_MS = 5 * 60 * 1000;

export async function mountApp(app: HTMLDivElement): Promise<AppController> {
  const elements = mountShell(app);
  let renderer: SmoothForceRenderer | null = null;
  let fullGraph: Graph = { nodes: [], links: [] };
  let currentGraph: Graph = { nodes: [], links: [] };
  let selectedNodeId: string | null = null;
  let isTimeFilterExpanded = false;
  let isSearchExpanded = false;
  let areSearchResultsVisible = true;
  let shouldRestoreSearchAfterSelection = false;
  let refreshTimeout = 0;
  let searchTimeout = 0;
  let activeSearchToken = 0;
  let activeTimeSlider: "current" | "span" = "current";
  const nodePanelHistory: string[] = [];
  const timeFilterState: TimeFilterState = { mode: "span", buckets: [], currentBucketIndex: 0, spanStartBucketIndex: 0, currentPosition: 0, spanStartPosition: 0 };
  const deleteNode = async (nodeId: string): Promise<void> => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("delete_node_file", { nodeId });
  };
  const nodePanel = new NodePanel(
    elements.nodePanel,
    elements.nodePanelToggle,
    elements.nodeDeleteButton,
    elements.nodeDeleteConfirm,
    elements.nodeDeleteConfirmTitle,
    elements.nodeDeleteCancel,
    elements.nodeDeleteConfirmButton,
    elements.nodePanelBackButton,
    elements.nodeContent,
    elements.backButton,
    {
      onNodeDelete: (node) => {
        renderer?.clearSelection();
        void deleteNode(node.id).catch((error) => {
          window.alert(error instanceof Error ? error.message : String(error));
        });
      },
      onNodeLinkClick: (title) => selectLinkedNode(title),
      onNodeBack: () => navigateNodePanelBack(),
    },
  );

  const backClickHandler = (): void => {
    nodePanelHistory.length = 0;
    nodePanel.setCanGoBack(false);
    areSearchResultsVisible = true;
    renderer?.clearSelection();
    elements.stage.classList.remove("has-selection");
    renderSearchControls();
  };

  const renderTimeControls = (): void => {
    const maxBucketIndex = Math.max(timeFilterState.buckets.length - 1, 0);
    const isDisabled = timeFilterState.buckets.length <= 1;

    elements.timeFilterCurrent.min = "0";
    elements.timeFilterCurrent.max = String(maxBucketIndex);
    elements.timeFilterCurrent.step = "any";
    elements.timeFilterCurrent.value = String(timeFilterState.currentPosition);
    elements.timeFilterCurrent.disabled = isDisabled;

    elements.timeFilterSpan.min = "0";
    elements.timeFilterSpan.max = String(maxBucketIndex);
    elements.timeFilterSpan.step = "any";
    elements.timeFilterSpan.value = String(timeFilterState.spanStartPosition);
    elements.timeFilterSpan.disabled = isDisabled || timeFilterState.mode === "fixed";

    const readout = formatTimeReadout(timeFilterState);
    elements.timeFilterCurrentLabel.textContent = readout;
    const timeFilterWidth = getTimeFilterWidth(readout, isTimeFilterExpanded);
    elements.app.style.setProperty("--time-filter-width", `${timeFilterWidth}px`);
    elements.app.style.setProperty("--time-filter-half-width", `${timeFilterWidth / 2}px`);
    elements.timeFilter.classList.toggle("is-disabled", isDisabled);
    elements.timeFilter.classList.toggle("is-span-mode", timeFilterState.mode === "span");
    elements.timeFilter.classList.toggle("is-expanded", isTimeFilterExpanded);
    elements.timeFilter.classList.toggle("is-current-thumb-active", activeTimeSlider === "current" || timeFilterState.currentPosition === 0);
    elements.timeFilterToggle.setAttribute("aria-expanded", String(isTimeFilterExpanded));
    elements.timeFilterToggle.setAttribute("aria-label", isTimeFilterExpanded ? "Hide time slider" : "Show time slider");
    elements.timeFilter.setAttribute("aria-label", `Filter nodes by ${timeFilterState.mode === "span" ? "time span" : "fixed day-hour"}; double click to toggle mode`);
  };

  const renderSearchControls = (): void => {
    elements.app.classList.toggle("is-search-expanded", isSearchExpanded);
    elements.nodeSearch.classList.toggle("is-expanded", isSearchExpanded);
    elements.nodeSearch.classList.remove("is-results-suppressed");
    elements.nodeSearch.classList.toggle("is-results-hidden", !areSearchResultsVisible);
    elements.nodeSearchToggle.setAttribute("aria-expanded", String(isSearchExpanded));
    elements.nodeSearchToggle.setAttribute("aria-label", isSearchExpanded ? "Collapse node search" : "Expand node search");
    elements.nodeSearchInput.tabIndex = isSearchExpanded ? 0 : -1;
  };

  const setSearchExpanded = (isExpanded: boolean, shouldFocus = false): void => {
    isSearchExpanded = isExpanded;
    renderSearchControls();

    if (isExpanded && shouldFocus) {
      areSearchResultsVisible = true;
      renderSearchControls();
      window.requestAnimationFrame(() => elements.nodeSearchInput.focus());
      return;
    }

    if (!isExpanded && document.activeElement === elements.nodeSearchInput) {
      elements.nodeSearchInput.blur();
    }
  };

  const syncTimeValues = (graph: Graph): void => {
    const previousCurrentTime = getCurrentBucket(timeFilterState)?.endTimeMs ?? null;
    const previousSpanStartTime = getSpanStartBucket(timeFilterState)?.startTimeMs ?? null;
    const hadBuckets = timeFilterState.buckets.length > 0;
    const wasAllTime = !hadBuckets || isAllTimeSelected(timeFilterState);
    timeFilterState.buckets = createTimeBuckets(graph.nodes);

    if (timeFilterState.buckets.length === 0) {
      timeFilterState.currentBucketIndex = 0;
      timeFilterState.spanStartBucketIndex = 0;
      timeFilterState.currentPosition = 0;
      timeFilterState.spanStartPosition = 0;
      return;
    }

    const lastBucketIndex = timeFilterState.buckets.length - 1;
    timeFilterState.currentBucketIndex = hadBuckets && previousCurrentTime !== null && !wasAllTime ? findNearestBucketIndex(timeFilterState.buckets, previousCurrentTime) : lastBucketIndex;
    timeFilterState.spanStartBucketIndex = hadBuckets && previousSpanStartTime !== null && !wasAllTime ? findNearestBucketIndex(timeFilterState.buckets, previousSpanStartTime) : 0;
    timeFilterState.currentPosition = timeFilterState.currentBucketIndex;
    timeFilterState.spanStartPosition = timeFilterState.spanStartBucketIndex;
    timeFilterState.mode = wasAllTime ? "span" : timeFilterState.mode;

    if (timeFilterState.spanStartBucketIndex > timeFilterState.currentBucketIndex) {
      timeFilterState.spanStartBucketIndex = timeFilterState.currentBucketIndex;
      timeFilterState.spanStartPosition = timeFilterState.currentPosition;
    }
  };

  const filteredGraph = (): Graph => filterGraphByTime(fullGraph, timeFilterState);

  const applyTimeFilter = (): void => {
    const graph = filteredGraph();
    currentGraph = graph;
    const simulation = createForceSimulation(graph.nodes, graph.links);

    renderer?.syncGraph(graph.nodes, graph.links, simulation);
    renderer?.fitVisibleNodes();
    reorderSearchResultsForTimeFilter();
    renderTimeControls();
    renderSearchControls();
  };

  const includeLinkedNodeInTimeSpan = (targetNode: GraphNode): void => {
    const targetBucketIndex = findBucketIndexForTime(timeFilterState.buckets, targetNode.timeMs);

    if (targetBucketIndex === -1) {
      return;
    }

    const selectedNode = selectedNodeId ? fullGraph.nodes.find((node) => node.id === selectedNodeId) : null;
    const selectedBucketIndex = selectedNode ? findBucketIndexForTime(timeFilterState.buckets, selectedNode.timeMs) : targetBucketIndex;
    const startBucketIndex = selectedBucketIndex === -1 ? targetBucketIndex : Math.min(selectedBucketIndex, targetBucketIndex);
    const endBucketIndex = selectedBucketIndex === -1 ? targetBucketIndex : Math.max(selectedBucketIndex, targetBucketIndex);

    timeFilterState.mode = startBucketIndex === endBucketIndex ? "fixed" : "span";
    timeFilterState.spanStartBucketIndex = startBucketIndex;
    timeFilterState.currentBucketIndex = endBucketIndex;
    timeFilterState.spanStartPosition = startBucketIndex;
    timeFilterState.currentPosition = endBucketIndex;
  };

  const includeNodeInCurrentTimeSpan = (targetNode: GraphNode): void => {
    const targetBucketIndex = findBucketIndexForTime(timeFilterState.buckets, targetNode.timeMs);

    if (targetBucketIndex === -1) {
      return;
    }

    const currentStartBucketIndex = timeFilterState.mode === "span" ? timeFilterState.spanStartBucketIndex : timeFilterState.currentBucketIndex;
    const startBucketIndex = Math.min(currentStartBucketIndex, targetBucketIndex);
    const endBucketIndex = Math.max(timeFilterState.currentBucketIndex, targetBucketIndex);

    timeFilterState.mode = "span";
    timeFilterState.spanStartBucketIndex = startBucketIndex;
    timeFilterState.currentBucketIndex = endBucketIndex;
    timeFilterState.spanStartPosition = startBucketIndex;
    timeFilterState.currentPosition = endBucketIndex;
  };

  const selectNode = (targetNode: GraphNode, resetPanelHistory = false, timeSpanInclusionMode: TimeSpanInclusionMode = "selected-node"): void => {
    if (resetPanelHistory) {
      nodePanelHistory.length = 0;
      nodePanel.setCanGoBack(false);
    }

    if (!currentGraph.nodes.some((node) => node.id === targetNode.id)) {
      if (timeSpanInclusionMode === "current-span") {
        includeNodeInCurrentTimeSpan(targetNode);
      } else {
        includeLinkedNodeInTimeSpan(targetNode);
      }

      const graph = filteredGraph();
      currentGraph = graph;
      const simulation = createForceSimulation(graph.nodes, graph.links);
      renderer?.syncGraph(graph.nodes, graph.links, simulation);
      reorderSearchResultsForTimeFilter();
      renderTimeControls();
    }

    renderer?.selectNodeByTitle(targetNode.label);
  };

  const selectLinkedNode = (title: string): void => {
    const targetNode = findNodeByTitle(fullGraph.nodes, title);

    if (!targetNode) {
      return;
    }

    if (selectedNodeId && selectedNodeId !== targetNode.id) {
      nodePanelHistory.push(selectedNodeId);
      nodePanel.setCanGoBack(true);
    }

    selectNode(targetNode);
  };

  const navigateNodePanelBack = (): void => {
    const previousNodeId = nodePanelHistory.pop();

    if (!previousNodeId) {
      nodePanel.setCanGoBack(false);
      return;
    }

    const previousNode = fullGraph.nodes.find((node) => node.id === previousNodeId);

    if (!previousNode) {
      nodePanel.setCanGoBack(nodePanelHistory.length > 0);
      return;
    }

    selectNode(previousNode);
    nodePanel.setCanGoBack(nodePanelHistory.length > 0);
  };

  const timeInputHandler = (event: Event): void => {
    if (timeFilterState.buckets.length === 0) {
      return;
    }

    if (event.currentTarget === elements.timeFilterSpan) {
      activeTimeSlider = "span";
      timeFilterState.spanStartPosition = clampPosition(Number(elements.timeFilterSpan.value), 0, timeFilterState.currentPosition);
      timeFilterState.spanStartBucketIndex = clampIndex(timeFilterState.spanStartPosition, timeFilterState.buckets.length);

      if (timeFilterState.spanStartPosition > timeFilterState.currentPosition || timeFilterState.spanStartBucketIndex > timeFilterState.currentBucketIndex) {
        timeFilterState.spanStartBucketIndex = timeFilterState.currentBucketIndex;
        timeFilterState.spanStartPosition = timeFilterState.currentPosition;
      }
    } else {
      activeTimeSlider = "current";
      const minCurrentPosition = timeFilterState.mode === "span" ? timeFilterState.spanStartPosition : 0;
      timeFilterState.currentPosition = clampPosition(Number(elements.timeFilterCurrent.value), minCurrentPosition, timeFilterState.buckets.length - 1);
      timeFilterState.currentBucketIndex = clampIndex(timeFilterState.currentPosition, timeFilterState.buckets.length);

      if (timeFilterState.mode === "span" && (timeFilterState.currentPosition < timeFilterState.spanStartPosition || timeFilterState.currentBucketIndex < timeFilterState.spanStartBucketIndex)) {
        timeFilterState.currentBucketIndex = timeFilterState.spanStartBucketIndex;
        timeFilterState.currentPosition = timeFilterState.spanStartPosition;
      } else if (timeFilterState.spanStartBucketIndex > timeFilterState.currentBucketIndex) {
        timeFilterState.spanStartBucketIndex = timeFilterState.currentBucketIndex;
        timeFilterState.spanStartPosition = timeFilterState.currentPosition;
      }
    }

    areSearchResultsVisible = false;
    applyTimeFilter();
  };

  const activateCurrentTimeSlider = (): void => {
    activeTimeSlider = "current";
    renderTimeControls();
  };

  const activateSpanTimeSlider = (): void => {
    activeTimeSlider = "span";
    renderTimeControls();
  };

  const timeModeToggleHandler = (event: MouseEvent): void => {
    if (!(event.target as HTMLElement | null)?.closest(".time-filter__range-stack")) {
      return;
    }

    if (!isTimeFilterExpanded) {
      return;
    }

    timeFilterState.mode = timeFilterState.mode === "fixed" ? "span" : "fixed";
    areSearchResultsVisible = false;
    applyTimeFilter();
  };

  const timeFilterToggleHandler = (): void => {
    isTimeFilterExpanded = !isTimeFilterExpanded;
    areSearchResultsVisible = false;
    renderTimeControls();
    renderSearchControls();
  };

  const clearSearchResults = (message = ""): void => {
    areSearchResultsVisible = true;
    elements.nodeSearch.classList.remove("has-results", "is-loading", "has-error");
    elements.nodeSearchStatus.textContent = message;
    elements.nodeSearchResults.replaceChildren();
    renderSearchControls();
  };

  const sortSearchResultElements = (results: HTMLButtonElement[]): HTMLButtonElement[] => {
    const currentNodeIds = new Set(currentGraph.nodes.map((node) => node.id));
    return [...results].sort((a, b) => {
      const aInFilter = currentNodeIds.has(a.dataset.nodeId ?? "");
      const bInFilter = currentNodeIds.has(b.dataset.nodeId ?? "");

      if (aInFilter !== bInFilter) {
        return aInFilter ? -1 : 1;
      }

      return Number(a.dataset.searchRank ?? 0) - Number(b.dataset.searchRank ?? 0);
    });
  };

  const reorderSearchResultsForTimeFilter = (): void => {
    const results = Array.from(elements.nodeSearchResults.querySelectorAll<HTMLButtonElement>("button[data-node-id]"));

    if (results.length === 0) {
      return;
    }

    elements.nodeSearchResults.replaceChildren(...sortSearchResultElements(results));
  };

  const renderSearchResults = (query: string, results: NodeSearchResult[]): void => {
    areSearchResultsVisible = true;
    elements.nodeSearch.classList.remove("is-loading", "has-error");
    elements.nodeSearch.classList.toggle("has-results", results.length > 0);
    elements.nodeSearchStatus.textContent = results.length === 0 ? `No matches for "${query}".` : `${results.length} search result${results.length === 1 ? "" : "s"}.`;
    elements.nodeSearchResults.replaceChildren(...sortSearchResultElements(results.map((result, index) => createSearchResultElement(result, index))));
    renderSearchControls();
  };

  const renderSearchError = (message: string): void => {
    areSearchResultsVisible = true;
    elements.nodeSearch.classList.remove("is-loading", "has-results");
    elements.nodeSearch.classList.add("has-error");
    elements.nodeSearchStatus.textContent = message;
    elements.nodeSearchResults.replaceChildren();
    renderSearchControls();
  };

  const runSearch = async (query: string, token: number): Promise<void> => {
    elements.nodeSearch.classList.add("is-loading");
    elements.nodeSearch.classList.remove("has-error");
    elements.nodeSearchStatus.textContent = `Searching nodes for "${query}"...`;

    try {
      const results = await searchNodes(query);

      if (token !== activeSearchToken) {
        return;
      }

      renderSearchResults(query, results);
    } catch (error) {
      if (token !== activeSearchToken) {
        return;
      }

      renderSearchError(error instanceof Error ? error.message : String(error));
    }
  };

  const scheduleSearch = (): void => {
    const query = elements.nodeSearchInput.value.trim();
    window.clearTimeout(searchTimeout);
    activeSearchToken += 1;
    areSearchResultsVisible = true;
    renderSearchControls();

    if (!query) {
      clearSearchResults();
      return;
    }

    const token = activeSearchToken;
    searchTimeout = window.setTimeout(() => {
      void runSearch(query, token);
    }, 180);
  };

  const searchSubmitHandler = (event: SubmitEvent): void => {
    event.preventDefault();
    setSearchExpanded(true);
    window.clearTimeout(searchTimeout);
    activeSearchToken += 1;
    const query = elements.nodeSearchInput.value.trim();

    if (!query) {
      clearSearchResults();
      return;
    }

    void runSearch(query, activeSearchToken);
  };

  const revealSearchResultsHandler = (): void => {
    if (areSearchResultsVisible) {
      return;
    }

    areSearchResultsVisible = true;
    renderSearchControls();
  };

  const searchResultsClickHandler = (event: MouseEvent): void => {
    const resultButton = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("button[data-node-id]");

    if (!resultButton) {
      return;
    }

    const targetNode = fullGraph.nodes.find((node) => node.id === resultButton.dataset.nodeId);

    if (targetNode) {
      selectNode(targetNode, true, "current-span");
      areSearchResultsVisible = !areSearchResultsVisible;
      renderSearchControls();
    }
  };

  const searchResultsPointerOverHandler = (event: PointerEvent): void => {
    const resultButton = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("button[data-node-id]");

    if (!resultButton || !elements.nodeSearchResults.contains(resultButton)) {
      return;
    }

    const stageRect = elements.stage.getBoundingClientRect();
    const resultsRect = elements.nodeSearchResults.getBoundingClientRect();
    const previewY = Math.min(Math.max(resultsRect.bottom - stageRect.top + 150, stageRect.height * 0.58), Math.max(stageRect.height - 96, 96));
    renderer?.hoverNodeById(resultButton.dataset.nodeId ?? null, true, { x: stageRect.width / 2, y: previewY });
  };

  const searchResultsPointerOutHandler = (event: PointerEvent): void => {
    const resultButton = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("button[data-node-id]");

    if (!resultButton || resultButton.contains(event.relatedTarget as Node | null)) {
      return;
    }

    renderer?.hoverNodeById(null);
  };

  const searchToggleHandler = (): void => {
    setSearchExpanded(!isSearchExpanded, !isSearchExpanded);
  };

  const documentPointerDownHandler = (event: PointerEvent): void => {
    const target = event.target as Node | null;

    if (isTimeFilterExpanded && !elements.timeFilter.contains(target)) {
      isTimeFilterExpanded = false;
      renderTimeControls();
    }

    if (!isSearchExpanded || elements.nodeSearch.contains(target)) {
      return;
    }

    if (selectedNodeId && elements.stage.contains(target)) {
      return;
    }

    setSearchExpanded(false);
    renderer?.hoverNodeById(null);
  };

  const selectAllHandler = (event: KeyboardEvent): void => {
    if ((!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== "a") {
      return;
    }

    if (isTextSelectionContext(event.target, elements.nodeContent)) {
      return;
    }

    event.preventDefault();
    window.getSelection()?.removeAllRanges();
  };

  const createRenderer = async (): Promise<void> => {
    fullGraph = await loadNodeGraph();
    syncTimeValues(fullGraph);
    const graph = filteredGraph();
    currentGraph = graph;
    const simulation = createForceSimulation(graph.nodes, graph.links);

    renderer = new SmoothForceRenderer({
      container: elements.stage,
      panelElement: elements.nodePanel,
      nodes: graph.nodes,
      links: graph.links,
      simulation,
      callbacks: {
        onNodeSelect: (node, linkCount, source) => {
          if (source === "pointer") {
            nodePanelHistory.length = 0;
          }

          shouldRestoreSearchAfterSelection = shouldRestoreSearchAfterSelection || isSearchExpanded;
          selectedNodeId = node.id;
          nodePanel.show(node, linkCount, getUnlinkedBacklinks(node, currentGraph.nodes));
          nodePanel.setCanGoBack(nodePanelHistory.length > 0);
        },
        onSelectionClear: () => {
          const hadSelectedNode = selectedNodeId !== null;
          selectedNodeId = null;
          nodePanelHistory.length = 0;
          isSearchExpanded = shouldRestoreSearchAfterSelection ? true : isSearchExpanded;
          shouldRestoreSearchAfterSelection = false;
          areSearchResultsVisible = hadSelectedNode ? true : areSearchResultsVisible;
          nodePanel.hide();
          renderSearchControls();
        },
      },
    });
    renderer.fitVisibleNodes();
  };

  const syncGraph = async (): Promise<void> => {
    fullGraph = await loadNodeGraph();
    syncTimeValues(fullGraph);
    const graph = filteredGraph();
    currentGraph = graph;
    const simulation = createForceSimulation(graph.nodes, graph.links);

    renderer?.syncGraph(graph.nodes, graph.links, simulation);
    renderer?.fitVisibleNodes();
    renderTimeControls();
  };

  const scheduleGraphRefresh = (): void => {
    window.clearTimeout(refreshTimeout);
    refreshTimeout = window.setTimeout(() => {
      void syncGraph();
    }, 120);
  };

  await createRenderer();
  renderTimeControls();
  renderSearchControls();
  const unlistenNodeChanges = await watchNodeGraph(scheduleGraphRefresh);

  elements.backButton.addEventListener("click", backClickHandler);
  elements.timeFilterCurrent.addEventListener("focus", activateCurrentTimeSlider);
  elements.timeFilterCurrent.addEventListener("pointerdown", activateCurrentTimeSlider);
  elements.timeFilterCurrent.addEventListener("input", timeInputHandler);
  elements.timeFilterSpan.addEventListener("focus", activateSpanTimeSlider);
  elements.timeFilterSpan.addEventListener("pointerdown", activateSpanTimeSlider);
  elements.timeFilterSpan.addEventListener("input", timeInputHandler);
  elements.timeFilter.addEventListener("dblclick", timeModeToggleHandler);
  elements.timeFilterToggle.addEventListener("click", timeFilterToggleHandler);
  elements.nodeSearchToggle.addEventListener("click", searchToggleHandler);
  elements.nodeSearchInput.addEventListener("input", scheduleSearch);
  elements.nodeSearchInput.addEventListener("focus", revealSearchResultsHandler);
  elements.nodeSearchInput.addEventListener("click", revealSearchResultsHandler);
  elements.nodeSearchForm.addEventListener("submit", searchSubmitHandler);
  elements.nodeSearchResults.addEventListener("click", searchResultsClickHandler);
  elements.nodeSearchResults.addEventListener("pointerover", searchResultsPointerOverHandler);
  elements.nodeSearchResults.addEventListener("pointerout", searchResultsPointerOutHandler);
  document.addEventListener("pointerdown", documentPointerDownHandler);
  document.addEventListener("keydown", selectAllHandler);

  return {
    destroy: () => {
      window.clearTimeout(refreshTimeout);
      window.clearTimeout(searchTimeout);
      unlistenNodeChanges();
      elements.backButton.removeEventListener("click", backClickHandler);
      elements.timeFilterCurrent.removeEventListener("focus", activateCurrentTimeSlider);
      elements.timeFilterCurrent.removeEventListener("pointerdown", activateCurrentTimeSlider);
      elements.timeFilterCurrent.removeEventListener("input", timeInputHandler);
      elements.timeFilterSpan.removeEventListener("focus", activateSpanTimeSlider);
      elements.timeFilterSpan.removeEventListener("pointerdown", activateSpanTimeSlider);
      elements.timeFilterSpan.removeEventListener("input", timeInputHandler);
      elements.timeFilter.removeEventListener("dblclick", timeModeToggleHandler);
      elements.timeFilterToggle.removeEventListener("click", timeFilterToggleHandler);
      elements.nodeSearchToggle.removeEventListener("click", searchToggleHandler);
      elements.nodeSearchInput.removeEventListener("input", scheduleSearch);
      elements.nodeSearchInput.removeEventListener("focus", revealSearchResultsHandler);
      elements.nodeSearchInput.removeEventListener("click", revealSearchResultsHandler);
      elements.nodeSearchForm.removeEventListener("submit", searchSubmitHandler);
      elements.nodeSearchResults.removeEventListener("click", searchResultsClickHandler);
      elements.nodeSearchResults.removeEventListener("pointerover", searchResultsPointerOverHandler);
      elements.nodeSearchResults.removeEventListener("pointerout", searchResultsPointerOutHandler);
      document.removeEventListener("pointerdown", documentPointerDownHandler);
      document.removeEventListener("keydown", selectAllHandler);
      nodePanel.dispose();
      renderer?.dispose();
      app.replaceChildren();
    },
  };
}

function filterGraphByTime(graph: Graph, timeFilterState: TimeFilterState): Graph {
  if (graph.nodes.length === 0 || timeFilterState.buckets.length === 0) {
    return { nodes: [], links: [] };
  }

  const nodes = graph.nodes.filter((node) => isNodeInTimeWindow(node, timeFilterState));
  const visibleIds = new Set(nodes.map((node) => node.id));
  const links = graph.links
    .filter((link) => visibleIds.has(getEndpointId(link.source)) && visibleIds.has(getEndpointId(link.target)))
    .map<GraphLink>((link) => ({ ...link, source: getEndpointId(link.source), target: getEndpointId(link.target) }));

  return { nodes, links };
}

function isNodeInTimeWindow(node: GraphNode, timeFilterState: TimeFilterState): boolean {
  const currentBucket = getCurrentBucket(timeFilterState);

  if (!currentBucket) {
    return false;
  }

  if (timeFilterState.mode === "span") {
    const spanStartBucket = getSpanStartBucket(timeFilterState) ?? currentBucket;
    return node.timeMs >= spanStartBucket.startTimeMs && node.timeMs <= currentBucket.endTimeMs;
  }

  return node.timeMs >= currentBucket.startTimeMs && node.timeMs <= currentBucket.endTimeMs;
}

function createTimeBuckets(nodes: GraphNode[]): TimeBucket[] {
  const sortedTimes = [...new Set(nodes.map((node) => node.timeMs).filter(Number.isFinite))].sort((left, right) => left - right);
  const buckets: TimeBucket[] = [];

  sortedTimes.forEach((timeMs) => {
    const currentBucket = buckets[buckets.length - 1];

    if (currentBucket && timeMs - currentBucket.endTimeMs <= CLUSTER_GAP_MS) {
      currentBucket.endTimeMs = timeMs;
      return;
    }

    buckets.push({ startTimeMs: timeMs, endTimeMs: timeMs });
  });

  return buckets;
}

function getCurrentBucket(timeFilterState: TimeFilterState): TimeBucket | null {
  return timeFilterState.buckets[timeFilterState.currentBucketIndex] ?? null;
}

function getSpanStartBucket(timeFilterState: TimeFilterState): TimeBucket | null {
  return timeFilterState.buckets[timeFilterState.spanStartBucketIndex] ?? null;
}

function findNearestBucketIndex(buckets: TimeBucket[], timeMs: number): number {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  buckets.forEach((bucket, index) => {
    const distance = Math.min(Math.abs(bucket.startTimeMs - timeMs), Math.abs(bucket.endTimeMs - timeMs));

    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  });

  return nearestIndex;
}

function findBucketIndexForTime(buckets: TimeBucket[], timeMs: number): number {
  return buckets.findIndex((bucket) => timeMs >= bucket.startTimeMs && timeMs <= bucket.endTimeMs);
}

function findNodeByTitle(nodes: GraphNode[], title: string): GraphNode | null {
  const normalizedTitle = normalizeTitle(title);
  return nodes.find((node) => normalizeTitle(node.label) === normalizedTitle) ?? null;
}

function getEndpointId(endpoint: string | GraphNode): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

function formatTimeLabel(timeMs?: number): string {
  if (timeMs === undefined || timeMs === 0) {
    return "No dates";
  }

  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit" }).format(new Date(timeMs));
}

function formatTimeReadout(timeFilterState: TimeFilterState): string {
  const currentBucket = getCurrentBucket(timeFilterState);

  if (!currentBucket) {
    return "No dates";
  }

  if (isAllTimeSelected(timeFilterState)) {
    return "All time";
  }

  if (timeFilterState.mode === "span") {
    const spanStartBucket = getSpanStartBucket(timeFilterState) ?? currentBucket;
    return `${formatTimeLabel(spanStartBucket.startTimeMs)} - ${formatTimeLabel(currentBucket.endTimeMs)}`;
  }

  return formatTimeLabel(currentBucket.startTimeMs);
}

function isAllTimeSelected(timeFilterState: TimeFilterState): boolean {
  return (
    timeFilterState.mode === "span" &&
    timeFilterState.buckets.length > 0 &&
    timeFilterState.spanStartBucketIndex === 0 &&
    timeFilterState.currentBucketIndex === timeFilterState.buckets.length - 1
  );
}

function getTimeFilterWidth(readout: string, isExpanded: boolean): number {
  const maxWidth = Math.max(window.innerWidth - (window.innerWidth <= 760 ? 86 : 48), 126);

  if (isExpanded) {
    const preferredWidth = Math.min(460, Math.max(window.innerWidth - 48, 260));
    return Math.min(preferredWidth, maxWidth);
  }

  return Math.min(Math.max(readout.length * 7.8 + 54, 126), maxWidth);
}

function clampIndex(value: number, length: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(length - 1, Math.round(value)));
}

function clampPosition(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
}

function createSearchResultElement(result: NodeSearchResult, searchRank = 0): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "node-search__result";
  button.type = "button";
  button.dataset.nodeId = result.id;
  button.dataset.searchRank = String(searchRank);
  button.setAttribute("role", "option");
  button.setAttribute("aria-label", `Open ${result.title}`);

  const title = document.createElement("span");
  title.className = "node-search__result-title";
  title.textContent = result.title;

  const excerpt = document.createElement("span");
  excerpt.className = "node-search__result-excerpt";
  excerpt.textContent = result.excerpt;

  button.append(title, excerpt);
  return button;
}

function isTextSelectionContext(target: EventTarget | null, nodeContent: HTMLElement): boolean {
  const element = target instanceof HTMLElement ? target : null;

  if (element && (element.closest(".node-content") || element.isContentEditable)) {
    return true;
  }

  if (target instanceof HTMLTextAreaElement) {
    return true;
  }

  if (target instanceof HTMLInputElement) {
    return ["email", "number", "password", "search", "tel", "text", "url"].includes(target.type);
  }

  const selection = window.getSelection();
  const selectedNode = selection?.anchorNode ?? null;
  return selectedNode ? nodeContent.contains(selectedNode) : false;
}

function getUnlinkedBacklinks(node: GraphNode, nodes: GraphNode[]): GraphNode[] {
  const nodeTitle = normalizeTitle(node.label);
  const outboundTitles = new Set(node.outboundLinks.map(normalizeTitle));

  return nodes
    .filter((candidate) => candidate.id !== node.id)
    .filter((candidate) => candidate.outboundLinks.some((title) => normalizeTitle(title) === nodeTitle))
    .filter((candidate) => !outboundTitles.has(normalizeTitle(candidate.label)))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}
