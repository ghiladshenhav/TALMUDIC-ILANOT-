import React from 'react';
import { ReceptionTree, RootNode } from '../types';

interface DashboardProps {
    receptionForest: ReceptionTree[];
    onSelectTree: (treeId: string) => void;
    onAddPassage: () => void;
    onOpenMergeModal: () => void;
    onRepairAll: () => void;
    onStandardizeTitles: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ receptionForest, onSelectTree, onAddPassage, onOpenMergeModal, onRepairAll, onStandardizeTitles }) => {

    // Helper to generate a deterministic "tree" SVG based on string hash
    const renderTreeIcon = (seed: string) => {
        // Simple pseudo-random generator from seed
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = seed.charCodeAt(i) + ((hash << 5) - hash);
        }

        const branches = [];
        const angleSpread = 60;
        const levels = 3;

        // Generate some SVG paths for branches
        for (let i = 0; i < 12; i++) {
            const angle = ((hash * (i + 1)) % angleSpread) - (angleSpread / 2);
            const length = 40 + ((hash * (i + 2)) % 40);
            branches.push(
                <path
                    key={i}
                    d={`M50,100 Q${50 + angle / 2},${100 - length / 2} ${50 + angle},${100 - length}`}
                    stroke="currentColor"
                    strokeWidth="1"
                    fill="none"
                    className="opacity-60"
                />
            );
        }

        return (
            <svg viewBox="0 0 100 100" className="w-full h-full text-primary/40 group-hover:text-primary/80 transition-colors">
                <line x1="50" y1="100" x2="50" y2="60" stroke="currentColor" strokeWidth="2" />
                {branches}
                <circle cx="50" cy="100" r="2" fill="currentColor" />
            </svg>
        );
    };

    const [searchQuery, setSearchQuery] = React.useState('');

    const filteredForest = React.useMemo(() => {
        if (!searchQuery) return receptionForest;
        const lowerQuery = searchQuery.toLowerCase();
        return receptionForest.filter(tree => {
            const root = tree.nodes.find(n => n.type === 'root') as RootNode;
            return root && (
                root.title.toLowerCase().includes(lowerQuery) ||
                root.sourceText.toLowerCase().includes(lowerQuery)
            );
        });
    }, [receptionForest, searchQuery]);

    return (
        <div className="flex flex-col h-full p-8 overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Reception Forest Overview</h1>
                    <p className="text-text-muted">Explore your tracked Talmudic passages. Select a root passage to view its detailed reception history.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onStandardizeTitles}
                        className="bg-surface-dark border border-border-dark hover:bg-surface-dark/80 text-text-muted hover:text-blue-400 py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                        title="Rename all pages to match their source citation"
                    >
                        <span className="material-symbols-outlined">edit_document</span>
                        Standardize Titles
                    </button>
                    <button
                        onClick={onOpenMergeModal}
                        className="bg-surface-dark border border-border-dark hover:bg-surface-dark/80 text-text-muted hover:text-white py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                        title="Find and consolidate duplicate pages"
                    >
                        <span className="material-symbols-outlined">merge_type</span>
                        Consolidate Pages
                    </button>
                    <button
                        onClick={onRepairAll}
                        className="bg-surface-dark border border-border-dark hover:bg-surface-dark/80 text-text-muted hover:text-red-400 py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                        title="Fix corrupted data across the entire library"
                    >
                        <span className="material-symbols-outlined">build</span>
                        Repair Library
                    </button>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-text-muted">search</span>
                        <input
                            type="text"
                            placeholder="Search passages..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-surface-dark border border-border-dark rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-primary w-64"
                        />
                    </div>
                    <button
                        onClick={onAddPassage}
                        className="bg-primary hover:bg-primary-hover text-background-dark font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors"
                    >
                        <span className="material-symbols-outlined">add</span>
                        Add New Passage
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredForest.map((tree) => {
                    const root = tree.nodes.find(n => n.type === 'root') as RootNode;
                    if (!root) return null;

                    const branchCount = tree.nodes.length - 1;
                    const lastUpdated = "2 days ago"; // Placeholder

                    return (
                        <div
                            key={tree.id}
                            onClick={() => onSelectTree(tree.id)}
                            className="group bg-surface-dark border border-border-dark rounded-xl p-6 cursor-pointer hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 flex flex-col"
                        >
                            <div className="aspect-square bg-background-dark rounded-lg mb-4 p-4 flex items-center justify-center overflow-hidden relative">
                                <div className="absolute inset-0 bg-gradient-to-t from-background-dark to-transparent opacity-50"></div>
                                {renderTreeIcon(tree.id)}
                            </div>

                            <h3 className="text-xl font-bold text-white mb-1 group-hover:text-primary transition-colors">{root.title}</h3>
                            <p className="text-text-muted text-sm mb-4 line-clamp-1">{root.sourceText}</p>

                            <div className="mt-auto flex items-center justify-between text-xs text-text-muted border-t border-border-dark pt-4">
                                <span className="flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">account_tree</span>
                                    {branchCount} Branches
                                </span>
                                <span>Updated {lastUpdated}</span>
                            </div>
                        </div>
                    );
                })}

                {/* Empty State / Add New Card */}
                <div
                    onClick={onAddPassage}
                    className="border-2 border-dashed border-border-dark rounded-xl p-6 cursor-pointer hover:border-primary/50 hover:bg-surface-dark/50 transition-all duration-300 flex flex-col items-center justify-center text-text-muted hover:text-primary min-h-[300px]"
                >
                    <div className="w-16 h-16 rounded-full bg-surface-dark flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-3xl">add</span>
                    </div>
                    <span className="font-medium">Add New Passage</span>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;