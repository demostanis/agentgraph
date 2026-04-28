import { createDemoGraph } from "./data/demoGraph";
import { SmoothForceRenderer } from "./rendering/SmoothForceRenderer";
import { createForceSimulation } from "./simulation/forceSimulation";
import { NodePanel } from "./ui/nodePanel";
import { mountShell } from "./ui/shell";

export type AppController = {
  destroy: () => void;
};

export function mountApp(app: HTMLDivElement): AppController {
  const elements = mountShell(app);
  const graph = createDemoGraph();
  const simulation = createForceSimulation(graph.nodes, graph.links);
  const nodePanel = new NodePanel(elements.nodePanel, elements.nodeContent, elements.backButton);
  const renderer = new SmoothForceRenderer({
    container: elements.stage,
    panelElement: elements.nodePanel,
    nodes: graph.nodes,
    links: graph.links,
    simulation,
    callbacks: {
      onNodeSelect: (node, linkCount) => nodePanel.show(node, linkCount),
      onSelectionClear: () => nodePanel.hide(),
    },
  });

  elements.backButton.addEventListener("click", renderer.clearSelection);

  return {
    destroy: () => {
      elements.backButton.removeEventListener("click", renderer.clearSelection);
      renderer.dispose();
      app.replaceChildren();
    },
  };
}
