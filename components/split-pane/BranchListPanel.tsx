import React, { useState, useMemo } from 'react';
import { BranchNode, BranchCategory, IDHelpers } from '../../types';
import BranchCard from './BranchCard';

interface BranchListPanelProps {
    branches: BranchNode[];
    onSelectBranch: (node: BranchNode) => void;
}

type SortOption = 'year' | 'author' | 'title' | 'category';
type ViewMode = 'list' | 'grouped' | 'timeline';
type GroupBy = 'category' | 'author' | 'decade' | 'none';

const BranchListPanel: React.FC<BranchListPanelProps> = ({ branches, onSelectBranch }) => {
    const [sortOrder, setSortOrder] = useState<SortOption>('year');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [groupBy, setGroupBy] = useState<GroupBy>('none');
    const [selectedCategory, setSelectedCategory] = useState<BranchCategory | 'all'>('all');

    // Get unique categories from branches
    const categories = useMemo(() => {
        const cats = new Set(branches.map(b => b.category).filter(Boolean) as BranchCategory[]);
        return Array.from(cats);
    }, [branches]);

    // Get unique authors
    const authors = useMemo(() => {
        const auths = new Set(branches.map(b => b.author));
        return Array.from(auths).sort();
    }, [branches]);

    const sortedAndFilteredBranches = useMemo(() => {
        branches.forEach(branch => {
            IDHelpers.validateAndWarn(branch.id, 'BranchListPanel');
        });

        let filtered = branches;

        // Filter by search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(b =>
                b.workTitle.toLowerCase().includes(query) ||
                b.author.toLowerCase().includes(query) ||
                b.referenceText.toLowerCase().includes(query)
            );
        }

        // Filter by category
        if (selectedCategory !== 'all') {
            filtered = filtered.filter(b => b.category === selectedCategory);
        }

        // Sort
        return filtered.sort((a, b) => {
            switch (sortOrder) {
                case 'year':
                    const yearA = parseInt(a.year || '0') || 0;
                    const yearB = parseInt(b.year || '0') || 0;
                    return yearA - yearB;
                case 'author':
                    return a.author.localeCompare(b.author);
                case 'title':
                    return a.workTitle.localeCompare(b.workTitle);
                case 'category':
                    return (a.category || '').localeCompare(b.category || '');
                default:
                    return 0;
            }
        });
    }, [branches, sortOrder, searchQuery, selectedCategory]);

    // Group branches based on groupBy setting
    const groupedBranches = useMemo(() => {
        if (groupBy === 'none') return { 'All Branches': sortedAndFilteredBranches };

        const groups: { [key: string]: BranchNode[] } = {};

        sortedAndFilteredBranches.forEach(branch => {
            let key = 'Other';

            if (groupBy === 'category') {
                key = branch.category || 'Uncategorized';
            } else if (groupBy === 'author') {
                key = branch.author;
            } else if (groupBy === 'decade') {
                const year = parseInt(branch.year || '0');
                if (year > 0) {
                    const decade = Math.floor(year / 10) * 10;
                    key = `${decade}s`;
                } else {
                    key = 'Unknown Date';
                }
            }

            if (!groups[key]) groups[key] = [];
            groups[key].push(branch);
        });

        // Sort group keys
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (groupBy === 'decade') {
                const numA = parseInt(a) || 9999;
                const numB = parseInt(b) || 9999;
                return numA - numB;
            }
            return a.localeCompare(b);
        });

        const sortedGroups: { [key: string]: BranchNode[] } = {};
        sortedKeys.forEach(k => sortedGroups[k] = groups[k]);
        return sortedGroups;
    }, [sortedAndFilteredBranches, groupBy]);

    // Category colors
    const getCategoryColor = (cat?: string) => {
        switch (cat) {
            case 'Academic': return '#10B981';
            case 'Philosophical': return '#8B5CF6';
            case 'Literary': return '#EC4899';
            case 'Historical': return '#F59E0B';
            case 'Critique': return '#EF4444';
            default: return '#6B7280';
        }
    };

    return (
        <div className="h-full flex flex-col relative"
            style={{
                background: 'linear-gradient(180deg, #050a05 0%, #0a140a 30%, #0f1a0f 100%)',
            }}
        >
            {/* Glowing accent at top */}
            <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse at center top, rgba(139, 105, 20, 0.15) 0%, transparent 70%)'
                }}
            />

            {/* Header */}
            <div className="p-5 relative z-10 border-b border-[#1a4d2e]/30">
                {/* Top accent line */}
                <div className="absolute top-0 left-5 right-5 h-1 bg-gradient-to-r from-transparent via-[#8B6914]/50 to-transparent rounded-full" />

                {/* Title row */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, #3d2914 0%, #0a1f0a 100%)',
                                border: '2px solid rgba(139, 105, 20, 0.4)',
                                boxShadow: '0 4px 15px rgba(139, 105, 20, 0.2)'
                            }}
                        >
                            <svg viewBox="0 0 32 32" className="w-7 h-7">
                                <path d="M16,28 Q16,18 16,10" stroke="#8B6914" strokeWidth="3" fill="none" strokeLinecap="round" />
                                <path d="M16,18 Q10,15 6,17" stroke="#10B981" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                                <path d="M16,14 Q22,11 26,13" stroke="#22c55e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                                <path d="M16,22 Q8,20 4,22" stroke="#14b8a6" strokeWidth="2" fill="none" strokeLinecap="round" />
                                <circle cx="6" cy="17" r="2.5" fill="#10B981" opacity="0.8" />
                                <circle cx="26" cy="13" r="2.5" fill="#22c55e" opacity="0.8" />
                                <circle cx="4" cy="22" r="2" fill="#14b8a6" opacity="0.7" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-[#f5f0e1] font-serif">Branches</h2>
                            <div className="flex items-center gap-2 text-xs text-[#f5f0e1]/50">
                                <span className="text-[#10B981] font-bold">{sortedAndFilteredBranches.length}</span>
                                <span>modern interpretations</span>
                            </div>
                        </div>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="flex bg-[#0a140a]/80 rounded-xl p-1 border border-[#1a4d2e]/40">
                        <button
                            onClick={() => { setViewMode('list'); setGroupBy('none'); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'list' && groupBy === 'none' ? 'bg-[#10B981]/20 text-[#10B981]' : 'text-[#f5f0e1]/50 hover:text-[#f5f0e1]'}`}
                            title="List View"
                        >
                            <span className="material-symbols-outlined text-lg">view_list</span>
                        </button>
                        <button
                            onClick={() => { setViewMode('grouped'); setGroupBy('category'); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${groupBy === 'category' ? 'bg-[#10B981]/20 text-[#10B981]' : 'text-[#f5f0e1]/50 hover:text-[#f5f0e1]'}`}
                            title="Group by Category"
                        >
                            <span className="material-symbols-outlined text-lg">category</span>
                        </button>
                        <button
                            onClick={() => { setViewMode('grouped'); setGroupBy('author'); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${groupBy === 'author' ? 'bg-[#10B981]/20 text-[#10B981]' : 'text-[#f5f0e1]/50 hover:text-[#f5f0e1]'}`}
                            title="Group by Author"
                        >
                            <span className="material-symbols-outlined text-lg">person</span>
                        </button>
                        <button
                            onClick={() => { setViewMode('timeline'); setGroupBy('decade'); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${groupBy === 'decade' ? 'bg-[#10B981]/20 text-[#10B981]' : 'text-[#f5f0e1]/50 hover:text-[#f5f0e1]'}`}
                            title="Timeline View"
                        >
                            <span className="material-symbols-outlined text-lg">timeline</span>
                        </button>
                    </div>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {/* Category Pills */}
                    <button
                        onClick={() => setSelectedCategory('all')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${selectedCategory === 'all'
                            ? 'bg-[#f5f0e1]/20 text-[#f5f0e1] border border-[#f5f0e1]/30'
                            : 'bg-[#0a140a] text-[#f5f0e1]/50 border border-[#1a4d2e]/30 hover:border-[#f5f0e1]/30'
                            }`}
                    >
                        All ({branches.length})
                    </button>
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${selectedCategory === cat
                                ? 'border text-white'
                                : 'bg-[#0a140a] border border-[#1a4d2e]/30 hover:border-[#1a4d2e]/60'
                                }`}
                            style={{
                                backgroundColor: selectedCategory === cat ? getCategoryColor(cat) + '30' : undefined,
                                borderColor: selectedCategory === cat ? getCategoryColor(cat) : undefined,
                                color: selectedCategory === cat ? getCategoryColor(cat) : undefined,
                            }}
                        >
                            <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: getCategoryColor(cat) }}
                            />
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Search and Sort Row */}
                <div className="flex gap-3">
                    {/* Search */}
                    <div className="flex-1 relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#10B981]/50 text-lg">search</span>
                        <input
                            type="text"
                            placeholder="Search by author, work, or text..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#0a1f0a] text-[#f5f0e1] pl-10 pr-4 py-2.5 rounded-xl border border-[#1a4d2e]/50 focus:outline-none focus:border-[#10B981]/50 placeholder-[#f5f0e1]/25 text-sm"
                        />
                    </div>

                    {/* Sort */}
                    <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as SortOption)}
                        className="bg-[#0a1f0a] text-[#f5f0e1] text-sm border border-[#1a4d2e]/50 rounded-xl px-3 py-2 focus:outline-none focus:border-[#10B981]/50 cursor-pointer"
                    >
                        <option value="year">By Year</option>
                        <option value="author">By Author</option>
                        <option value="title">By Work</option>
                        <option value="category">By Category</option>
                    </select>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
                {Object.keys(groupedBranches).length > 0 ? (
                    <div className="space-y-6">
                        {Object.entries(groupedBranches).map(([groupName, groupBranchesArr]) => {
                            const branchList = groupBranchesArr as BranchNode[];
                            return (
                                <div key={groupName}>
                                    {/* Group Header (if grouped) */}
                                    {groupBy !== 'none' && (
                                        <div className="flex items-center gap-3 mb-4 sticky top-0 z-10 py-2"
                                            style={{ background: 'linear-gradient(180deg, #0a140a 0%, transparent 100%)' }}
                                        >
                                            {/* Category indicator */}
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: groupBy === 'category' ? getCategoryColor(groupName) : '#8B6914' }}
                                            />
                                            <span className="text-sm font-bold text-[#f5f0e1]">{groupName}</span>
                                            <span className="text-xs text-[#f5f0e1]/40">({branchList.length})</span>
                                            <div className="flex-1 h-px bg-gradient-to-r from-[#1a4d2e]/40 to-transparent" />
                                        </div>
                                    )}

                                    {/* Timeline connector for decade view */}
                                    {groupBy === 'decade' && (
                                        <div className="relative">
                                            {/* Vertical timeline line */}
                                            <div className="absolute left-1.5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#8B6914] to-[#8B6914]/20" />
                                        </div>
                                    )}

                                    {/* Branch Cards */}
                                    <div className={`grid gap-4 ${groupBy === 'decade' ? 'pl-6' : ''} ${viewMode === 'list' ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
                                        {branchList.map((branch, index) => (
                                            <div
                                                key={branch.id}
                                                style={{ animationDelay: `${index * 50}ms` }}
                                                className="animate-fade-in relative"
                                            >
                                                {/* Timeline dot for decade view */}
                                                {groupBy === 'decade' && (
                                                    <div className="absolute -left-6 top-6 w-3 h-3 rounded-full bg-[#8B6914] border-2 border-[#0a140a]" />
                                                )}
                                                <BranchCard
                                                    node={branch}
                                                    onClick={() => onSelectBranch(branch)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[#f5f0e1]/40">
                        <div className="w-20 h-20 rounded-full bg-[#0f1a0f] border border-[#1a4d2e]/30 flex items-center justify-center mb-4">
                            <svg viewBox="0 0 40 40" className="w-10 h-10 opacity-40">
                                <path d="M18,35 Q15,25 18,15 L20,8 L22,15 Q25,25 22,35" fill="#8B6914" />
                                <ellipse cx="20" cy="10" rx="8" ry="5" fill="#10B981" opacity="0.5" />
                            </svg>
                        </div>
                        <p className="text-lg font-serif mb-1">No branches found</p>
                        <p className="text-sm opacity-60">
                            {searchQuery || selectedCategory !== 'all' ? 'Try a different filter' : 'This tree has no interpretations yet'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BranchListPanel;
