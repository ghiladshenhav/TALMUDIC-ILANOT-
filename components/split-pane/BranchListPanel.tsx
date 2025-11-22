import React, { useState, useMemo } from 'react';
import { BranchNode } from '../../types';
import BranchCard from './BranchCard';

interface BranchListPanelProps {
    branches: BranchNode[];
    onSelectBranch: (node: BranchNode) => void;
}

type SortOption = 'year' | 'author' | 'title';

const BranchListPanel: React.FC<BranchListPanelProps> = ({ branches, onSelectBranch }) => {
    const [sortOrder, setSortOrder] = useState<SortOption>('year');
    const [searchQuery, setSearchQuery] = useState('');

    const sortedAndFilteredBranches = useMemo(() => {

        // DEDUPLICATION: Ensure unique branch IDs
        const seenIds = new Set<string>();
        const uniqueBranches: BranchNode[] = [];

        branches.forEach(branch => {
            if (seenIds.has(branch.id)) {
                console.warn(`[BranchListPanel] Duplicate branch ID detected: "${branch.id}". Skipping duplicate.`);
            } else {
                seenIds.add(branch.id);
                uniqueBranches.push(branch);
            }
        });

        let filtered = uniqueBranches;

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = branches.filter(b =>
                b.workTitle.toLowerCase().includes(query) ||
                b.author.toLowerCase().includes(query) ||
                b.referenceText.toLowerCase().includes(query)
            );
        }

        return filtered.sort((a, b) => {
            switch (sortOrder) {
                case 'year':
                    // Attempt to parse year, fallback to 0 if missing
                    const yearA = parseInt(a.year || '0') || 0;
                    const yearB = parseInt(b.year || '0') || 0;
                    return yearA - yearB;
                case 'author':
                    return a.author.localeCompare(b.author);
                case 'title':
                    return a.workTitle.localeCompare(b.workTitle);
                default:
                    return 0;
            }
        });
    }, [branches, sortOrder, searchQuery]);

    return (
        <div className="h-full flex flex-col bg-background-dark">
            <div className="p-6 border-b border-border-dark bg-surface-dark sticky top-0 z-10 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-text-dark">
                        Commentaries <span className="text-subtext-dark text-sm font-normal ml-2">({branches.length})</span>
                    </h2>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-subtext-dark">Sort by:</span>
                        <select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value as SortOption)}
                            className="bg-background-dark text-text-dark text-sm border border-border-dark rounded px-2 py-1 focus:outline-none focus:border-primary"
                        >
                            <option value="year">Year</option>
                            <option value="author">Author</option>
                            <option value="title">Work Title</option>
                        </select>
                    </div>
                </div>

                <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-subtext-dark text-lg">search</span>
                    <input
                        type="text"
                        placeholder="Search commentaries..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-background-dark text-text-dark pl-10 pr-4 py-2 rounded border border-border-dark focus:outline-none focus:border-primary placeholder-subtext-dark"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {sortedAndFilteredBranches.length > 0 ? (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {sortedAndFilteredBranches.map(branch => (
                            <BranchCard
                                key={branch.id}
                                node={branch}
                                onClick={() => onSelectBranch(branch)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-subtext-dark opacity-50">
                        <span className="material-symbols-outlined text-4xl mb-2">library_books</span>
                        <p>No commentaries found matching your criteria</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BranchListPanel;
