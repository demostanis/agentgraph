import { loadNodeGraph, watchNodeGraph } from "./data/nodeGraph";
import { SmoothForceRenderer } from "./rendering/SmoothForceRenderer";
import { createForceSimulation } from "./simulation/forceSimulation";
import type { Graph, GraphNode } from "./types";
import { NodePanel } from "./ui/nodePanel";
import { mountShell } from "./ui/shell";

export type AppController = {
  destroy: () => void;
};

export async function mountApp(app: HTMLDivElement): Promise<AppController> {
  const elements = mountShell(app);
  let renderer: SmoothForceRenderer | null = null;
  let currentGraph: Graph = { nodes: [], links: [] };
  let refreshTimeout = 0;
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
    elements.nodeContent,
    elements.backButton,
    {
      onNodeDelete: (node) => {
        renderer?.clearSelection();
        void deleteNode(node.id).catch((error) => {
          window.alert(error instanceof Error ? error.message : String(error));
        });
      },
      onNodeLinkClick: (title) => renderer?.selectNodeByTitle(title),
    },
  );
  const backClickHandler = (): void => renderer?.clearSelection();

  const createRenderer = async (): Promise<void> => {
    const graph = await loadNodeGraph();
    currentGraph = graph;
    const simulation = createForceSimulation(graph.nodes, graph.links);

    renderer = new SmoothForceRenderer({
      container: elements.stage,
      panelElement: elements.nodePanel,
      nodes: graph.nodes,
      links: graph.links,
      simulation,
      callbacks: {
        onNodeSelect: (node, linkCount) => nodePanel.show(node, linkCount, getUnlinkedBacklinks(node, currentGraph.nodes)),
        onSelectionClear: () => nodePanel.hide(),
      },
    });
  };

  const syncGraph = async (): Promise<void> => {
    const graph = await loadNodeGraph();
    currentGraph = graph;
    const simulation = createForceSimulation(graph.nodes, graph.links);

    renderer?.syncGraph(graph.nodes, graph.links, simulation);
  };

  const scheduleGraphRefresh = (): void => {
    window.clearTimeout(refreshTimeout);
    refreshTimeout = window.setTimeout(() => {
      void syncGraph();
    }, 120);
  };

  await createRenderer();
  const unlistenNodeChanges = await watchNodeGraph(scheduleGraphRefresh);

  elements.backButton.addEventListener("click", backClickHandler);

  return {
    destroy: () => {
      window.clearTimeout(refreshTimeout);
      unlistenNodeChanges();
      elements.backButton.removeEventListener("click", backClickHandler);
      nodePanel.dispose();
      renderer?.dispose();
      app.replaceChildren();
    },
  };
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
