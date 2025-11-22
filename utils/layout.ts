import dagre from 'dagre';
import { Node, Edge, Position } from 'reactflow';

// Helper to find connected components (trees)
const getConnectedComponents = (nodes: Node[], edges: Edge[]) => {
    const adjList = new Map<string, string[]>();
    nodes.forEach(node => adjList.set(node.id, []));
    edges.forEach(edge => {
        if (adjList.has(edge.source)) adjList.get(edge.source)?.push(edge.target);
        if (adjList.has(edge.target)) adjList.get(edge.target)?.push(edge.source);
    });

    const visited = new Set<string>();
    const components: Node[][] = [];

    nodes.forEach(node => {
        if (!visited.has(node.id)) {
            const component: Node[] = [];
            const queue = [node.id];
            visited.add(node.id);
            while (queue.length > 0) {
                const currentId = queue.shift()!;
                const currentNode = nodes.find(n => n.id === currentId);
                if (currentNode) component.push(currentNode);

                const neighbors = adjList.get(currentId) || [];
                neighbors.forEach(neighborId => {
                    if (!visited.has(neighborId)) {
                        visited.add(neighborId);
                        queue.push(neighborId);
                    }
                });
            }
            components.push(component);
        }
    });

    return components;
};

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
    const isHorizontal = direction === 'LR';

    // 1. Identify Connected Components (Trees)
    // We only consider "structural" edges for layout grouping if we want strict trees, 
    // but for now, let's treat all connected nodes as a group.
    // Ideally, we should only use parent-child edges for the tree structure and ignore cross-links for layout.
    // Let's assume all edges are structural for the basic layout, or filter if needed.

    const components = getConnectedComponents(nodes, edges);

    let currentXOffset = 0;
    const spacingBetweenTrees = 300;
    const layoutedNodes: Node[] = [];

    components.forEach(componentNodes => {
        const componentNodeIds = new Set(componentNodes.map(n => n.id));
        const componentEdges = edges.filter(e => componentNodeIds.has(e.source) && componentNodeIds.has(e.target));

        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));
        dagreGraph.setGraph({ rankdir: direction });

        componentNodes.forEach((node) => {
            dagreGraph.setNode(node.id, { width: node.width || 300, height: node.height || 150 });
        });

        componentEdges.forEach((edge) => {
            dagreGraph.setEdge(edge.source, edge.target);
        });

        dagre.layout(dagreGraph);

        let minX = Infinity;
        let maxX = -Infinity;

        componentNodes.forEach((node) => {
            const nodeWithPosition = dagreGraph.node(node.id);

            // Apply position relative to the component's origin
            const x = nodeWithPosition.x - (node.width || 300) / 2;
            const y = nodeWithPosition.y - (node.height || 150) / 2;

            node.targetPosition = isHorizontal ? Position.Left : Position.Top;
            node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;
            node.position = { x, y };

            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x + (node.width || 300));
        });

        // Shift this component to the right of the previous one
        const componentWidth = maxX - minX;

        componentNodes.forEach(node => {
            node.position.x += currentXOffset - minX; // Align left of component to currentXOffset
            layoutedNodes.push(node);
        });

        currentXOffset += componentWidth + spacingBetweenTrees;
    });

    return { nodes: layoutedNodes, edges };
};
