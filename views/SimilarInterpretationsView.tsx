import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { ReceptionTree, BranchNode, RootNode } from '../types';
import { searchSimilarBranches, BranchCandidate, isRagAvailable } from '../utils/rag-search';

interface SimilarInterpretationsViewProps {
    onNavigateToTree?: (treeId: string) => void;
}

// Extended result type to include keyword matches
interface SearchResult extends BranchCandidate {
    matchType: 'keyword' | 'semantic' | 'both';
    keywordMatches?: string[];
}

const SimilarInterpretationsView: React.FC<SimilarInterpretationsViewProps> = ({ onNavigateToTree }) => {
    const [trees, setTrees] = useState<ReceptionTree[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<{ branch: BranchNode; tree: ReceptionTree } | null>(null);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingTrees, setIsLoadingTrees] = useState(true);
    const [searchMode, setSearchMode] = useState<'branch' | 'text' | 'keyword'>('keyword');
    const [customText, setCustomText] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Load all trees on mount
    useEffect(() => {
        const fetchTrees = async () => {
            try {
                const treesCollection = collection(db, 'receptionTrees');
                const snapshot = await getDocs(treesCollection);
                const loadedTrees = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ReceptionTree[];
                setTrees(loadedTrees);
            } catch (err) {
                console.error('Error fetching trees:', err);
                setError('Failed to load library');
            } finally {
                setIsLoadingTrees(false);
            }
        };
        fetchTrees();
    }, []);

    // Keyword search through all branches in memory
    const searchByKeyword = (searchTerms: string[]): SearchResult[] => {
        const results: SearchResult[] = [];
        const normalizedTerms = searchTerms.map(t => t.toLowerCase().trim());

        for (const tree of trees) {
            for (const branch of tree.branches) {
                // Build searchable text from branch content
                const searchableText = [
                    branch.author,
                    branch.workTitle,
                    branch.referenceText,
                    branch.userNotes,
                    tree.root.sourceText,
                    ...(branch.keywords || [])
                ].filter(Boolean).join(' ').toLowerCase();

                // Check for keyword matches
                const matchedTerms = normalizedTerms.filter(term => searchableText.includes(term));

                if (matchedTerms.length > 0) {
                    results.push({
                        branchId: branch.id,
                        treeId: tree.id,
                        author: branch.author || 'Unknown',
                        workTitle: branch.workTitle || '',
                        year: branch.year || '',
                        referenceText: branch.referenceText || '',
                        rootSourceText: tree.root.sourceText || '',
                        category: branch.category || '',
                        textPreview: branch.referenceText?.substring(0, 300) || '',
                        score: matchedTerms.length / normalizedTerms.length, // Score based on match ratio
                        matchType: 'keyword',
                        keywordMatches: matchedTerms
                    });
                }
            }
        }

        // Sort by score (match ratio) descending
        return results.sort((a, b) => b.score - a.score);
    };

    // Search for similar branches
    const handleSearch = async () => {
        let searchText = '';
        if (searchMode === 'branch' && selectedBranch) {
            searchText = [
                selectedBranch.branch.author,
                selectedBranch.branch.workTitle,
                selectedBranch.branch.referenceText,
                selectedBranch.branch.userNotes,
                selectedBranch.tree.root.sourceText,
                ...(selectedBranch.branch.keywords || [])
            ].filter(Boolean).join('\n\n');
        } else if ((searchMode === 'text' || searchMode === 'keyword') && customText.trim()) {
            searchText = customText.trim();
        }

        if (!searchText) {
            setError('Please select a branch or enter search text');
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            let results: SearchResult[] = [];

            if (searchMode === 'keyword') {
                // Direct keyword search (no Pinecone needed)
                const terms = searchText.split(/[,\s]+/).filter(t => t.length > 1);
                results = searchByKeyword(terms);
                console.log(`[Keyword Search] Found ${results.length} matches for terms:`, terms);
            } else {
                // Semantic search via Pinecone
                if (!isRagAvailable()) {
                    setError('Semantic search requires Pinecone API key');
                    setIsLoading(false);
                    return;
                }
                const semanticResults = await searchSimilarBranches(searchText, 15);
                results = semanticResults.map(r => ({ ...r, matchType: 'semantic' as const }));
            }

            // Filter out the selected branch itself if in branch mode
            const filtered = searchMode === 'branch' && selectedBranch
                ? results.filter(r => r.branchId !== selectedBranch.branch.id)
                : results;

            setSearchResults(filtered);
        } catch (err) {
            console.error('Search error:', err);
            setError('Search failed');
        } finally {
            setIsLoading(false);
        }
    };

    // Format score as percentage
    const formatScore = (score: number) => `${Math.round(score * 100)}%`;

    // Get category color
    const getCategoryColor = (category: string) => {
        const colors: Record<string, string> = {
            'Academic': 'bg-blue-500/20 text-blue-400',
            'Philosophical': 'bg-purple-500/20 text-purple-400',
            'Literary': 'bg-pink-500/20 text-pink-400',
            'Historical': 'bg-amber-500/20 text-amber-400',
            'Critique': 'bg-red-500/20 text-red-400',
        };
        return colors[category] || 'bg-gray-500/20 text-gray-400';
    };

    // Flatten all branches for dropdown
    const allBranches = trees.flatMap(tree =>
        tree.branches.map(branch => ({ branch, tree }))
    );

    return (
        <div className="flex-1 flex flex-col bg-background-dark text-text-dark overflow-hidden h-full">
            <div className="w-full max-w-5xl mx-auto flex-1 flex flex-col p-4 sm:p-8 space-y-6 min-h-0">

                {/* Header */}
                <div className="pb-4 border-b border-border-dark">
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary text-3xl">hub</span>
                        Similar Interpretations
                    </h2>
                    <p className="text-subtext-dark mt-2">
                        Discover thematic and linguistic connections between modern interpretations in your library.
                    </p>
                </div>

                {/* Search Controls */}
                <div className="bg-card-dark rounded-xl p-6 space-y-4">

                    {/* Mode Toggle */}
                    <div className="flex gap-2 flex-wrap">
                        <button
                            onClick={() => setSearchMode('keyword')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${searchMode === 'keyword'
                                ? 'bg-primary text-background-dark'
                                : 'bg-surface-paper/10 text-subtext-dark hover:text-text-dark'
                                }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[18px]">search</span>
                                Keyword Search
                            </span>
                        </button>
                        <button
                            onClick={() => setSearchMode('branch')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${searchMode === 'branch'
                                ? 'bg-primary text-background-dark'
                                : 'bg-surface-paper/10 text-subtext-dark hover:text-text-dark'
                                }`}
                        >
                            Select a Branch
                        </button>
                        <button
                            onClick={() => setSearchMode('text')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${searchMode === 'text'
                                ? 'bg-primary text-background-dark'
                                : 'bg-surface-paper/10 text-subtext-dark hover:text-text-dark'
                                }`}
                        >
                            Semantic Search
                        </button>
                    </div>

                    {/* Branch Selector */}
                    {searchMode === 'branch' && (
                        <div>
                            <label className="block text-sm font-medium text-subtext-dark mb-2">
                                Choose an interpretation to find similar ones:
                            </label>
                            {isLoadingTrees ? (
                                <div className="animate-pulse h-12 bg-surface-paper/20 rounded-lg" />
                            ) : (
                                <select
                                    value={selectedBranch ? selectedBranch.branch.id : ''}
                                    onChange={(e) => {
                                        const found = allBranches.find(b => b.branch.id === e.target.value);
                                        setSelectedBranch(found || null);
                                        setSearchResults([]);
                                    }}
                                    className="w-full p-3 rounded-lg bg-background-dark border border-border-dark text-text-dark focus:ring-2 focus:ring-primary focus:outline-none"
                                >
                                    <option value="">Select an interpretation...</option>
                                    {allBranches.map(({ branch, tree }) => (
                                        <option key={branch.id} value={branch.id}>
                                            {branch.author || 'Unknown'} - {branch.workTitle || 'Untitled'} ({tree.root.sourceText})
                                        </option>
                                    ))}
                                </select>
                            )}

                            {/* Selected Branch Preview */}
                            {selectedBranch && (
                                <div className="mt-4 p-4 bg-primary/10 border border-primary/30 rounded-lg">
                                    <div className="flex items-start gap-3">
                                        <span className="material-symbols-outlined text-primary">description</span>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold text-primary">
                                                {selectedBranch.branch.author}
                                            </h4>
                                            <p className="text-sm text-subtext-dark">
                                                {selectedBranch.branch.workTitle} • {selectedBranch.tree.root.sourceText}
                                            </p>
                                            <p className="text-sm text-text-dark/80 mt-2 line-clamp-2">
                                                {selectedBranch.branch.referenceText}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Custom Text Search */}
                    {searchMode === 'text' && (
                        <div>
                            <label className="block text-sm font-medium text-subtext-dark mb-2">
                                Enter themes, concepts, or text to find related interpretations:
                            </label>
                            <textarea
                                value={customText}
                                onChange={(e) => setCustomText(e.target.value)}
                                placeholder="e.g., Moses, leadership, burning bush, revelation..."
                                className="w-full p-3 rounded-lg bg-background-dark border border-border-dark text-text-dark focus:ring-2 focus:ring-primary focus:outline-none resize-none"
                                rows={3}
                            />
                        </div>
                    )}

                    {/* Search Button */}
                    <button
                        onClick={handleSearch}
                        disabled={isLoading || (searchMode === 'branch' && !selectedBranch) || (searchMode === 'text' && !customText.trim())}
                        className="w-full py-3 rounded-lg bg-primary text-background-dark font-medium flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-background-dark/30 border-t-background-dark rounded-full animate-spin" />
                                Searching...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined">search</span>
                                Find Similar Interpretations
                            </>
                        )}
                    </button>

                    {/* Error Display */}
                    {error && (
                        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg">error</span>
                            {error}
                        </div>
                    )}
                </div>

                {/* Results */}
                {searchResults.length > 0 && (
                    <div className="flex-1 overflow-y-auto space-y-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">insights</span>
                            Found {searchResults.length} Similar Interpretations
                        </h3>

                        <div className="grid gap-4">
                            {searchResults.map((candidate, index) => (
                                <div
                                    key={candidate.branchId}
                                    className="bg-card-dark border border-border-dark rounded-xl p-5 hover:border-primary/50 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            {/* Author & Work */}
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-lg font-semibold text-text-dark">
                                                    {candidate.author}
                                                </span>
                                                {candidate.category && (
                                                    <span className={`px-2 py-0.5 rounded-full text-xs ${getCategoryColor(candidate.category)}`}>
                                                        {candidate.category}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-subtext-dark mb-2">
                                                {candidate.workTitle} {candidate.year && `(${candidate.year})`}
                                            </p>

                                            {/* Source Text */}
                                            <div className="flex items-center gap-1.5 text-xs text-primary/80 bg-primary/10 px-2 py-1 rounded-full w-fit mb-3">
                                                <span className="material-symbols-outlined text-[14px]">menu_book</span>
                                                {candidate.rootSourceText || 'Unknown source'}
                                            </div>

                                            {/* Preview */}
                                            <p className="text-sm text-text-dark/70 line-clamp-3">
                                                {candidate.textPreview || candidate.referenceText}
                                            </p>
                                        </div>

                                        {/* Similarity Score */}
                                        <div className="flex flex-col items-center shrink-0">
                                            <div className={`text-2xl font-bold ${candidate.score >= 0.8 ? 'text-green-400' :
                                                candidate.score >= 0.6 ? 'text-yellow-400' :
                                                    'text-subtext-dark'
                                                }`}>
                                                {formatScore(candidate.score)}
                                            </div>
                                            <span className="text-xs text-subtext-dark">match</span>
                                        </div>
                                    </div>

                                    {/* Action */}
                                    {onNavigateToTree && candidate.treeId && (
                                        <button
                                            onClick={() => onNavigateToTree(candidate.treeId)}
                                            className="mt-4 w-full py-2 rounded-lg bg-surface-paper/10 hover:bg-surface-paper/20 text-sm text-subtext-dark hover:text-text-dark transition-colors flex items-center justify-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                                            View in Library
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && searchResults.length === 0 && !error && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                        <span className="material-symbols-outlined text-6xl text-subtext-dark/50 mb-4">hub</span>
                        <h3 className="text-xl font-medium text-subtext-dark mb-2">
                            Discover Connections
                        </h3>
                        <p className="text-subtext-dark/70 max-w-md">
                            Select an interpretation or enter themes to find similar scholarly works across your library.
                        </p>
                        {!isRagAvailable() && (
                            <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
                                <span className="material-symbols-outlined align-middle mr-1">warning</span>
                                Pinecone API key not configured. Please add VITE_PINECONE_API_KEY to .env.local
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SimilarInterpretationsView;
