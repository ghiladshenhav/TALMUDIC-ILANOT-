import React, { useState, useMemo } from 'react';
import { ReceptionTree, GraphNode, RootNode, BranchNode, GraphEdge } from '../types';
import RootTextPanel from '../components/split-pane/RootTextPanel';
import BranchListPanel from '../components/split-pane/BranchListPanel';
import GraphNodeEditor from '../components/graph/GraphNodeEditor';

interface SplitPaneViewProps {
    forest: ReceptionTree[];
    selectedNode: GraphNode | null;
    onSelectNode: (node: GraphNode | null) => void;
    onSaveNode: (node: GraphNode) => void;
    onDeleteNode: (nodeId: string) => void;
    onAddBranch: (parentNode: GraphNode | null) => void;
    // Edge props are less relevant here but needed for RightSidebar compatibility if we were to show edges, 
    // though this view is node-centric.
    allEdges: GraphEdge[];
    onUpdateEdge: (edge: GraphEdge) => void;
    onDeleteEdge: (edgeId: string) => void;
    onRegenerateRoot: (node: RootNode) => void;
    onCleanup: (treeId: string) => void;
    onRepair: (treeId: string) => void;
    onRepairAll: () => void;
    onStandardizeTitles: () => void;
    onForceRegenerateBranchIds: (treeId: string) => void;
}

const SplitPaneView: React.FC<SplitPaneViewProps> = ({
    forest,
    selectedNode,
    onSelectNode,
    onSaveNode,
    onDeleteNode,
    onAddBranch,
    allEdges,
    onUpdateEdge,
    onDeleteEdge,
    onRegenerateRoot,
    onCleanup,
    onRepair,
    onRepairAll,
    onStandardizeTitles,
    onForceRegenerateBranchIds
}) => {
    // Identify the active root. 
    // If a root is selected, use it. 
    // If a branch is selected, find its root.
    // Default to the first root in the forest if nothing is selected.

    const allRoots = useMemo(() =>
        forest.map(t => t.nodes.find(n => n.type === 'root') as RootNode).filter(Boolean),
        [forest]);

    // State to track the currently viewed root, independent of selection
    const [viewedRootId, setViewedRootId] = useState<string | null>(null);
    const isInitialMount = React.useRef(true);

    // Effect to sync selection with view, but NOT reset view on deselect
    React.useEffect(() => {
        // Initial load: set to first root if nothing selected
        if (isInitialMount.current && !viewedRootId && allRoots.length > 0) {
            setViewedRootId(allRoots[0].id);
            isInitialMount.current = false;
            return;
        }

        if (selectedNode) {
            if (selectedNode.type === 'root') {
                setViewedRootId(selectedNode.id);
            } else if (selectedNode.type === 'branch') {
                const tree = forest.find(t => t.nodes.some(n => n.id === selectedNode.id));
                const root = tree?.nodes.find(n => n.type === 'root');
                if (root) setViewedRootId(root.id);
            }
        }
    }, [selectedNode, forest, allRoots]);

    const activeRoot = useMemo(() => {
        if (viewedRootId) {
            return allRoots.find(r => r.id === viewedRootId);
        }
        return allRoots.length > 0 ? allRoots[0] : undefined;
    }, [viewedRootId, allRoots]);

    const activeBranches = useMemo(() => {
        if (!activeRoot) return [];
        const tree = forest.find(t => t.nodes.some(n => n.id === activeRoot.id));
        return tree ? tree.nodes.filter(n => n.type === 'branch') as BranchNode[] : [];
    }, [activeRoot, forest]);

    return (
        <div className="flex h-full w-full relative overflow-hidden">
            {/* Main Split Pane Area */}
            <div className="flex-1 flex w-full">
                {/* Left Pane: Root Text (40%) */}
                <div className="w-[40%] h-full flex flex-col border-r border-border-dark relative">
                    {/* Root Switcher (Temporary UI for navigation) */}
                    <div className="bg-surface-dark border-b border-border-dark p-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-subtext-dark uppercase font-bold tracking-wider">Current Text:</span>
                        <select
                            className="bg-background-dark text-text-dark text-sm border border-border-dark rounded px-2 py-1 flex-1 truncate focus:outline-none focus:border-primary"
                            value={activeRoot?.id || ''}
                            onChange={(e) => {
                                const root = allRoots.find(r => r.id === e.target.value);
                                if (root) {
                                    setViewedRootId(root.id);
                                    // Optional: Select the root node too? 
                                    // Maybe not, just switch view.
                                    // onSelectNode(root); 
                                }
                            }}
                        >
                            {allRoots.map(r => (
                                <option key={r.id} value={r.id}>{r.title} ({r.sourceText})</option>
                            ))}
                        </select>
                        {activeRoot && (
                            <button
                                onClick={() => {
                                    const tree = forest.find(t => t.nodes.some(n => n.id === activeRoot.id));
                                    if (tree) onCleanup(tree.id);
                                }}
                                className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors ml-2"
                                title="Cleanup Duplicates & Fix Structure"
                            >
                                <span className="material-symbols-outlined text-lg">build</span>
                                <span className="text-xs font-bold uppercase">Fix Data</span>
                            </button>
                        )}
                        <button
                            onClick={onRepairAll}
                            className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200 transition-colors ml-2"
                            title="Scan entire library for ID collisions and fix them"
                        >
                            <span className="material-symbols-outlined text-lg">healing</span>
                            <span className="text-xs font-bold uppercase">Global Repair</span>
                        </button>
                        <button
                            onClick={onStandardizeTitles}
                            className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors ml-2"
                            title="Rename all pages to match their source citation"
                        >
                            <span className="material-symbols-outlined text-lg">edit_document</span>
                            <span className="text-xs font-bold uppercase">Standardize Titles</span>
                        </button>
                        {activeRoot && (
                            <button
                                onClick={() => {
                                    console.log('[Force Regenerate] Button clicked!');
                                    const tree = forest.find(t => t.nodes.some(n => n.id === activeRoot.id));
                                    console.log('[Force Regenerate] Found tree:', tree?.id);
                                    if (tree) {
                                        console.log('[Force Regenerate] Calling onForceRegenerateBranchIds with treeId:', tree.id);
                                        onForceRegenerateBranchIds(tree.id);
                                    } else {
                                        console.error('[Force Regenerate] Tree not found for activeRoot:', activeRoot.id);
                                    }
                                }}
                                className="flex items-center gap-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200 transition-colors ml-2"
                                title="Force regenerate all branch IDs (use if branches are missing/hidden)"
                            >
                                <span className="material-symbols-outlined text-lg">refresh</span>
                                <span className="text-xs font-bold uppercase">Force Regenerate IDs</span>
                            </button>
                        )}
                        {activeRoot && (
                            <button
                                onClick={() => onAddBranch(activeRoot)}
                                className="flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors ml-2"
                                title="Add a new branch to this text"
                            >
                                <span className="material-symbols-outlined text-lg">add_circle</span>
                                <span className="text-xs font-bold uppercase">Add Branch</span>
                            </button>
                        )}
                    </div>

                    {activeRoot ? (
                        <RootTextPanel
                            node={activeRoot}
                            onEdit={() => onSelectNode(activeRoot)}
                            onRegenerate={() => onRegenerateRoot(activeRoot)}
                        />
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-subtext-dark">
                            No text selected
                        </div>
                    )}
                </div>

                {/* Right Pane: Branches (60%) */}
                <div className="w-[60%] h-full bg-background-dark">
                    {activeRoot ? (
                        <BranchListPanel
                            branches={activeBranches}
                            onSelectBranch={onSelectNode}
                        />
                    ) : null}
                </div>
            </div>

            {/* Right Sidebar for Editing */}
            {/* Right Sidebar for Editing - Overlay */}
            <div className={`absolute top-0 right-0 h-full z-20 transition-transform duration-300 ease-in-out ${selectedNode ? 'translate-x-0' : 'translate-x-full'} w-[400px] shadow-2xl`}>
                {selectedNode && (
                    <GraphNodeEditor
                        node={selectedNode}
                        onSave={(node) => {
                            onSaveNode(node);
                            onSelectNode(null);
                        }}
                        onDelete={onDeleteNode}
                        onClose={() => onSelectNode(null)}
                        onAddBranch={onAddBranch}
                    />
                )}
            </div>
        </div>
    );
};

export default SplitPaneView;
