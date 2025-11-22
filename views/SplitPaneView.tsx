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
    onRegenerateRoot: (node: RootNode) => void;
}

const SplitPaneView: React.FC<SplitPaneViewProps> = ({
    forest,
    selectedNode,
    onSelectNode,
    onSaveNode,
    onDeleteNode,
    onAddBranch,
    onRegenerateRoot
}) => {
    // Identify the active root. 
    // With the new structure, each tree has exactly one root.

    const allRoots = useMemo(() =>
        forest.map(t => t.root),
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
                // Find the tree containing this branch
                const tree = forest.find(t => t.branches.some(b => b.id === selectedNode.id));
                if (tree) setViewedRootId(tree.root.id);
            }
        }
    }, [selectedNode, forest, allRoots]);

    const activeRoot = useMemo(() => {
        if (viewedRootId) {
            return allRoots.find(r => r.id === viewedRootId);
        }
        return allRoots.length > 0 ? allRoots[0] : undefined;
    }, [viewedRootId, allRoots]);

    // Get branches for the active root
    const activeBranches = useMemo(() => {
        if (!activeRoot) return [];
        const tree = forest.find(t => t.root.id === activeRoot.id);
        return tree ? tree.branches : [];
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
