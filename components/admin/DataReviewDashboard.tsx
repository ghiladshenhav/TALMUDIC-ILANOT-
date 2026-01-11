import React, { useState, useEffect, useCallback } from 'react';
import {
    ChevronRight,
    ChevronDown,
    BookOpen,
    User,
    Edit3,
    Library,
    Trash2,
    RefreshCw,
    Search,
    Loader2,
    CheckCircle
} from 'lucide-react';
import { ReceptionTree, BranchNode } from '../../types';
import { db } from '../../firebase';
import {
    collection,
    query,
    getDocs,
    doc,
    getDoc,
    Timestamp,
    QueryDocumentSnapshot,
    DocumentData
} from 'firebase/firestore';
import { syncManager } from '../../utils/sync-manager';
import { fetchTalmudText, SefariaText } from '../../utils/sefaria';
import EditBranchModal from './EditBranchModal';
import HarvestModal, { HarvestMetadata } from './HarvestModal';
import { saveGroundTruthExample } from '../../utils/ground-truth-helpers';
import { GroundTruthAction } from '../../types';

interface DataReviewDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    isEmbedded?: boolean;
}

interface GroupedSource {
    source: string;
    treeId: string;
    branches: BranchNode[];
}

const DataReviewDashboard: React.FC<DataReviewDashboardProps> = ({
    isOpen,
    onClose,
    userId,
    isEmbedded = false
}) => {
    // Data state
    const [trees, setTrees] = useState<ReceptionTree[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    // Selected branch for work area
    const [selectedBranch, setSelectedBranch] = useState<{
        branch: BranchNode;
        treeId: string;
        rootSource: string;
        fullText?: string;
    } | null>(null);

    // Talmud text
    const [talmudText, setTalmudText] = useState<SefariaText | null>(null);
    const [isLoadingTalmud, setIsLoadingTalmud] = useState(false);

    // Modal state
    const [editingBranch, setEditingBranch] = useState<{ branch: BranchNode; treeId: string } | null>(null);
    const [harvestingBranch, setHarvestingBranch] = useState<{ branch: BranchNode; treeId: string; rootSource: string } | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState<{ branchId: string; treeId: string } | null>(null);

    // Toast
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Load data
    useEffect(() => {
        if (isOpen) loadTrees();
    }, [isOpen]);

    // Load Talmud when selection changes
    useEffect(() => {
        if (selectedBranch) {
            loadTalmudText(selectedBranch.rootSource);
        }
    }, [selectedBranch?.rootSource]);

    const loadTrees = async (afterDoc: QueryDocumentSnapshot<DocumentData> | null = null) => {
        setIsLoading(true);
        console.log('[DataJanitor] Loading ALL trees with un-harvested branches...');
        try {
            const treesRef = collection(db, 'receptionTrees');
            // Load ALL trees (no limit) - filter client-side for un-harvested branches
            const q = query(treesRef);

            const snap = await getDocs(q);
            console.log(`[DataJanitor] Fetched ${snap.docs.length} total trees from Firestore`);

            // Filter to only include trees with un-harvested branches
            const allTrees = snap.docs.map(d => ({ id: d.id, ...d.data() } as ReceptionTree));
            const treesWithUnharvested = allTrees
                .map(tree => ({
                    ...tree,
                    // Filter branches to only un-harvested ones
                    branches: (tree.branches || []).filter(b => !b.isHarvested)
                }))
                .filter(tree => tree.branches.length > 0); // Only keep trees with at least 1 un-harvested branch

            console.log(`[DataJanitor] ${treesWithUnharvested.length} trees with ${treesWithUnharvested.reduce((sum, t) => sum + t.branches.length, 0)} un-harvested branches`);
            setTrees(treesWithUnharvested);
            setHasMore(false); // No pagination needed
        } catch (error) {
            console.error('[Dashboard] Load error:', error);
            showToast('Failed to load trees', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const loadTalmudText = async (source: string) => {
        setIsLoadingTalmud(true);
        setTalmudText(null);
        try {
            const result = await fetchTalmudText(source);
            setTalmudText(result);
        } catch (error) {
            console.error('[Dashboard] Talmud load error:', error);
        } finally {
            setIsLoadingTalmud(false);
        }
    };

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const toggleSource = (treeId: string) => {
        setExpandedSources(prev => {
            const next = new Set(prev);
            if (next.has(treeId)) {
                next.delete(treeId);
            } else {
                next.add(treeId);
            }
            return next;
        });
    };

    const selectBranch = (branch: BranchNode, treeId: string, rootSource: string, fullText?: string) => {
        setSelectedBranch({ branch, treeId, rootSource, fullText });
    };

    // ========================================
    // ACTIONS
    // ========================================

    const handleDelete = async (branchId: string, treeId: string) => {
        console.log('[DataJanitor] Delete requested:', { branchId, treeId });
        // Just set confirmingDelete state - actual delete in executeDelete
        setConfirmingDelete({ branchId, treeId });
    };

    const executeDelete = async () => {
        if (!confirmingDelete) return;
        const { branchId, treeId } = confirmingDelete;
        setConfirmingDelete(null);
        console.log('[DataJanitor] Executing delete:', { branchId, treeId });

        try {
            // Fetch the ACTUAL tree from Firestore (not the filtered local state)
            console.log('[DataJanitor] Fetching tree from Firestore...');
            const treeRef = doc(db, 'receptionTrees', treeId);
            const treeSnap = await getDoc(treeRef);

            if (!treeSnap.exists()) {
                console.error('[DataJanitor] Tree not found:', treeId);
                showToast('Tree not found', 'error');
                return;
            }

            const treeData = treeSnap.data() as ReceptionTree;
            const allBranches = treeData.branches || [];
            console.log(`[DataJanitor] Tree has ${allBranches.length} branches, removing ${branchId}`);

            const updatedBranches = allBranches.filter(b => b.id !== branchId);
            console.log(`[DataJanitor] After filter: ${updatedBranches.length} branches remain`);

            if (updatedBranches.length === 0) {
                console.log('[DataJanitor] No branches left, deleting tree');
                syncManager.deleteDocument('receptionTrees', treeId, 'Delete empty tree');
            } else {
                console.log('[DataJanitor] Updating tree with reduced branches');
                syncManager.updateDocument('receptionTrees', treeId, {
                    branches: updatedBranches
                }, `Delete branch ${branchId.slice(0, 8)}`);
            }

            // Update local state - remove the branch from the filtered view
            setTrees(prev => {
                const updated = prev.map(t => {
                    if (t.id !== treeId) return t;
                    return {
                        ...t,
                        branches: t.branches.filter(b => b.id !== branchId)
                    };
                });
                // Remove trees with no visible branches
                return updated.filter(t => t.branches.length > 0);
            });

            if (selectedBranch?.branch.id === branchId) {
                setSelectedBranch(null);
            }

            showToast('Branch deleted', 'success');
            console.log('[DataJanitor] Delete completed successfully');
        } catch (error: any) {
            console.error('[DataJanitor] Delete error:', error);
            showToast('Failed to delete branch', 'error');
        }
    };

    const handleHarvest = async (metadata: HarvestMetadata) => {
        if (!harvestingBranch) return;

        const { branch, rootSource } = harvestingBranch;
        const phrase = (branch.referenceText || '').substring(0, 200).trim();

        try {
            const enrichedJustification = `${metadata.justification}\n[Connection: ${metadata.connectionType}] [Author: ${branch.author}]`;

            await saveGroundTruthExample(
                userId,
                phrase,
                branch.referenceText || '',
                metadata.action,
                rootSource,
                {
                    confidenceLevel: metadata.confidenceLevel,
                    justification: enrichedJustification,
                    isGroundTruth: true
                }
            );

            // Mark as harvested
            const tree = trees.find(t => t.id === harvestingBranch.treeId);
            if (tree) {
                const updatedBranches = tree.branches.map(b =>
                    b.id === branch.id ? { ...b, isHarvested: true, harvestedAt: Timestamp.now() } : b
                );
                syncManager.updateDocument('receptionTrees', harvestingBranch.treeId, {
                    branches: updatedBranches
                }, 'Mark harvested');
                setTrees(prev => prev.map(t =>
                    t.id === harvestingBranch.treeId ? { ...t, branches: updatedBranches } : t
                ));
            }

            showToast('Harvested as Ground Truth!', 'success');
        } catch (error: any) {
            showToast(error.message || 'Harvest failed', 'error');
        }
    };

    // ========================================
    // GROUPED DATA
    // ========================================

    const groupedData: GroupedSource[] = trees.map(tree => ({
        source: tree.root?.sourceText || tree.id,
        treeId: tree.id,
        branches: tree.branches || []
    }));

    const filteredData = searchQuery.trim()
        ? groupedData.filter(g =>
            g.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
            g.branches.some(b =>
                b.author?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                b.referenceText?.toLowerCase().includes(searchQuery.toLowerCase())
            )
        )
        : groupedData;

    // Stats
    const totalBranches = trees.reduce((sum, t) => sum + (t.branches?.length || 0), 0);
    const harvestedCount = trees.reduce((sum, t) =>
        sum + (t.branches?.filter(b => b.isHarvested).length || 0), 0);

    if (!isOpen) return null;

    // ========================================
    // RENDER
    // ========================================

    const content = (
        <div className="h-full flex flex-col bg-gray-900">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between shrink-0">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Library className="w-5 h-5 text-emerald-500" />
                        Data Review Dashboard
                    </h2>
                    <p className="text-sm text-gray-400">
                        {trees.length} trees • {totalBranches} branches • {harvestedCount} harvested
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => loadTrees()}
                        disabled={isLoading}
                        className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    {!isEmbedded && (
                        <button onClick={onClose} className="text-gray-400 hover:text-white">
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Split Pane Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* LEFT: Branch List */}
                <div className="w-1/3 border-r border-gray-700 flex flex-col">
                    {/* Search */}
                    <div className="p-3 border-b border-gray-700">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search..."
                                className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none text-sm"
                            />
                        </div>
                    </div>

                    {/* Tree List */}
                    <div className="flex-1 overflow-y-auto">
                        {isLoading && trees.length === 0 ? (
                            <div className="flex items-center justify-center h-32">
                                <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                            </div>
                        ) : filteredData.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">No trees found</p>
                        ) : (
                            filteredData.map(group => (
                                <div key={group.treeId} className="border-b border-gray-800">
                                    {/* Source Header */}
                                    <button
                                        onClick={() => toggleSource(group.treeId)}
                                        className="w-full p-3 flex items-center gap-2 hover:bg-gray-800 text-left"
                                    >
                                        {expandedSources.has(group.treeId)
                                            ? <ChevronDown className="w-4 h-4 text-gray-400" />
                                            : <ChevronRight className="w-4 h-4 text-gray-400" />
                                        }
                                        <BookOpen className="w-4 h-4 text-emerald-500" />
                                        <span className="text-sm font-medium text-white truncate flex-1">
                                            {group.source}
                                        </span>
                                        <span className="text-xs text-gray-500">{group.branches.length}</span>
                                    </button>

                                    {/* Branches */}
                                    {expandedSources.has(group.treeId) && (
                                        <div className="bg-gray-800/50">
                                            {group.branches.map(branch => (
                                                <button
                                                    key={branch.id}
                                                    onClick={() => selectBranch(branch, group.treeId, group.source)}
                                                    className={`w-full p-3 pl-10 flex items-center gap-2 text-left hover:bg-gray-800 ${selectedBranch?.branch.id === branch.id ? 'bg-emerald-500/10 border-l-2 border-emerald-500' : ''
                                                        }`}
                                                >
                                                    <User className="w-3 h-3 text-gray-400" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-white truncate">{branch.author}</p>
                                                        <p className="text-xs text-gray-500 truncate">{branch.workTitle}</p>
                                                    </div>
                                                    {branch.isHarvested && (
                                                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}

                        {/* Load More */}
                        {hasMore && !isLoading && (
                            <button
                                onClick={() => loadTrees(lastDoc)}
                                className="w-full p-3 text-center text-sm text-emerald-500 hover:bg-gray-800"
                            >
                                Load More
                            </button>
                        )}
                    </div>
                </div>

                {/* RIGHT: Work Area */}
                <div className="flex-1 flex flex-col">
                    {selectedBranch ? (
                        <>
                            {/* Action Bar */}
                            <div className="p-3 border-b border-gray-700 flex items-center justify-between shrink-0">
                                <div>
                                    <p className="text-sm font-medium text-white">{selectedBranch.branch.author}</p>
                                    <p className="text-xs text-gray-400">{selectedBranch.rootSource}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setEditingBranch({
                                            branch: selectedBranch.branch,
                                            treeId: selectedBranch.treeId
                                        })}
                                        className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm flex items-center gap-1"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => setHarvestingBranch({
                                            branch: selectedBranch.branch,
                                            treeId: selectedBranch.treeId,
                                            rootSource: selectedBranch.rootSource
                                        })}
                                        disabled={selectedBranch.branch.isHarvested}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm flex items-center gap-1 disabled:opacity-50"
                                    >
                                        <Library className="w-4 h-4" />
                                        Harvest
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleDelete(selectedBranch.branch.id, selectedBranch.treeId);
                                        }}
                                        className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm flex items-center gap-1"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Split View: Author Text + Talmud Text */}
                            <div className="flex-1 flex flex-col overflow-hidden">
                                {/* TOP: Author's Text */}
                                <div className="h-1/2 border-b border-gray-700 overflow-y-auto p-4">
                                    <h3 className="text-xs font-medium text-gray-400 uppercase mb-2">Author's Text</h3>
                                    <div className="p-3 bg-gray-800 rounded-lg">
                                        <p className="text-white font-serif leading-relaxed" dir="auto">
                                            {selectedBranch.branch.referenceText || '(No text)'}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-3">
                                            — {selectedBranch.branch.author}
                                            {selectedBranch.branch.workTitle && `, ${selectedBranch.branch.workTitle}`}
                                            {selectedBranch.branch.year && ` (${selectedBranch.branch.year})`}
                                        </p>
                                    </div>
                                </div>

                                {/* BOTTOM: Talmudic Source */}
                                <div className="h-1/2 overflow-y-auto p-4">
                                    <h3 className="text-xs font-medium text-gray-400 uppercase mb-2">
                                        Talmudic Source: {selectedBranch.rootSource}
                                    </h3>
                                    {isLoadingTalmud ? (
                                        <div className="flex items-center justify-center h-32">
                                            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                                        </div>
                                    ) : talmudText ? (
                                        <div className="space-y-4">
                                            <div className="p-3 bg-gray-800 rounded-lg">
                                                <p className="text-white font-serif leading-relaxed" dir="rtl">
                                                    {talmudText.hebrewText}
                                                </p>
                                            </div>
                                            {talmudText.translation && (
                                                <div className="p-3 bg-gray-800/50 rounded-lg">
                                                    <p className="text-sm text-gray-400">
                                                        {talmudText.translation}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-gray-500 italic">Could not load Talmudic text</p>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center text-gray-500">
                                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p>Select a branch to view details</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            {editingBranch && (
                <EditBranchModal
                    isOpen={true}
                    onClose={() => setEditingBranch(null)}
                    branch={editingBranch.branch}
                    treeId={editingBranch.treeId}
                    onSaved={() => {
                        loadTrees();
                        showToast('Branch updated', 'success');
                    }}
                />
            )}

            {harvestingBranch && (
                <HarvestModal
                    isOpen={true}
                    onClose={() => setHarvestingBranch(null)}
                    branch={harvestingBranch.branch}
                    rootSource={harvestingBranch.rootSource}
                    onHarvest={handleHarvest}
                />
            )}

            {/* Delete Confirmation Modal */}
            {confirmingDelete && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4">
                        <h3 className="text-lg font-bold text-white mb-2">Delete Branch?</h3>
                        <p className="text-gray-400 text-sm mb-6">
                            This action cannot be undone. The branch will be permanently removed.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setConfirmingDelete(null)}
                                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeDelete}
                                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50 ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
                    } text-white`}>
                    {toast.message}
                </div>
            )}
        </div>
    );

    if (isEmbedded) {
        return <div className="h-[70vh]">{content}</div>;
    }

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-6xl h-[85vh] overflow-hidden">
                {content}
            </div>
        </div>
    );
};

export default DataReviewDashboard;
