
import React, { useState } from 'react';
import { ReceptionTree, RootNode, TractateProfile } from '../types';
import AuthorView from '../views/AuthorView';
import TractateView from '../views/TractateView';
import { AuthorEntry } from '../utils/author-aggregation';
import GroundTruthViewer from './GroundTruthViewer';

interface DashboardProps {
    receptionForest: ReceptionTree[];
    onNavigate: (treeId: string, nodeId?: string) => void;
    onAddPassage: () => void;
    onOpenMergeModal: () => void;
    onStandardizeTitles: () => void;
    onDiagnoseOrphans?: () => void;
    onDeleteTree: (treeId: string) => void;
    onImportFromBenYehuda: () => void;
    onScanPdf?: () => void;
    onAuthorClick?: (author: AuthorEntry) => void;
    onTractateClick?: (tractate: string) => void;
    tractateProfiles?: Record<string, TractateProfile>;
}

const Dashboard: React.FC<DashboardProps> = ({ receptionForest, onNavigate, onAddPassage, onOpenMergeModal, onStandardizeTitles, onDiagnoseOrphans, onDeleteTree, onImportFromBenYehuda, onScanPdf, onAuthorClick, onTractateClick, tractateProfiles }) => {
    const [viewMode, setViewMode] = useState<'page' | 'author' | 'tractate'>('page');
    const [sortBy, setSortBy] = useState<'recent' | 'branches' | 'alphabetical'>('recent');
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
    const [isGroundTruthOpen, setIsGroundTruthOpen] = useState(false);

    // Helper to format relative time
    const formatRelativeTime = (date: Date | { seconds: number; nanoseconds: number } | undefined): string => {
        if (!date) return '';

        const timestamp = 'seconds' in date ? date.seconds * 1000 : date.getTime();
        const now = Date.now();
        const diffMs = now - timestamp;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
        return '';
    };

    // Check if updated within last 24 hours
    const isRecentlyUpdated = (date: Date | { seconds: number; nanoseconds: number } | undefined): boolean => {
        if (!date) return false;
        const timestamp = 'seconds' in date ? date.seconds * 1000 : date.getTime();
        const now = Date.now();
        const diffMs = now - timestamp;
        return diffMs < 24 * 60 * 60 * 1000; // 24 hours
    };

    // List of all available tree images - 16 unique trees
    const allTreeImages = [
        '/trees/berakhot.png',   // 0 - Olive
        '/trees/shabbat.png',    // 1 - Cedar
        '/trees/eruvin.png',     // 2 - Almond
        '/trees/pesachim.png',   // 3 - Fig
        '/trees/yoma.png',       // 4 - Acacia
        '/trees/sukkah.png',     // 5 - Palm
        '/trees/taanit.png',     // 6 - Carob
        '/trees/megillah.png',   // 7 - Myrtle
        '/trees/gittin.png',     // 8 - Split
        '/trees/kiddushin.png',  // 9 - Vine
        '/trees/ketubot.png',    // 10 - Willow
        '/trees/bava.png',       // 11 - Oak
        '/trees/sanhedrin.png',  // 12 - Cypress
        '/trees/menachot.png',   // 13 - Pomegranate
        '/trees/avot.png',       // 14 - Ancient
        '/trees/default.png',    // 15 - Classic
    ];

    // DIRECT mapping: Every tractate gets a specific tree index (0-15)
    // This ensures NO collisions - each tractate has a guaranteed unique tree
    const tractateToImageIndex: Record<string, number> = {
        // Seder Zeraim
        'berakhot': 0, 'berachot': 0, 'brachot': 0,
        'peah': 1,
        'demai': 2,
        'kilayim': 3,
        'sheviit': 4,
        'terumot': 5,
        'maasrot': 6,
        'maaser sheni': 7,
        'challah': 8,
        'orlah': 9,
        'bikkurim': 10,

        // Seder Moed
        'shabbat': 1, 'shabbos': 1,
        'eruvin': 2,
        'pesachim': 3, 'pesahim': 3,
        'shekalim': 4,
        'yoma': 5,
        'sukkah': 6, 'sukka': 6,
        'beitzah': 7, 'beitza': 7,
        'rosh hashanah': 8, 'rosh hashana': 8,
        'taanit': 9, 'ta\'anit': 9,
        'megillah': 10, 'megilla': 10,
        'moed katan': 11,
        'chagigah': 12, 'chagiga': 12,

        // Seder Nashim
        'yevamot': 13,
        'ketubot': 14, 'ketuboth': 14,
        'nedarim': 15,
        'nazir': 0,
        'sotah': 1, 'sota': 1,
        'gittin': 2,
        'kiddushin': 3,

        // Seder Nezikin
        'bava kamma': 4, 'bava kama': 4, 'baba kamma': 4,
        'bava metzia': 5, 'bava metsia': 5, 'baba metzia': 5,
        'bava batra': 6, 'baba batra': 6,
        'sanhedrin': 7,
        'makkot': 8, 'makot': 8,
        'shevuot': 9,
        'eduyot': 10,
        'avodah zarah': 11, 'avoda zara': 11, 'avodah zara': 11,
        'avot': 12, 'pirkei avot': 12,
        'horayot': 13,

        // Seder Kodashim
        'zevachim': 14,
        'menachot': 15,
        'chullin': 0, 'hullin': 0,
        'bekhorot': 1, 'bechorot': 1,
        'arakhin': 2,
        'temurah': 3,
        'keritot': 4,
        'meilah': 5,
        'tamid': 6,
        'middot': 7,
        'kinnim': 8,

        // Seder Tahorot
        'kelim': 9,
        'oholot': 10,
        'negaim': 11,
        'parah': 12,
        'tahorot': 13,
        'mikvaot': 14,
        'niddah': 15, 'nidda': 15,
        'makhshirin': 0,
        'zavim': 1,
        'tevul yom': 2,
        'yadayim': 3,
        'uktzin': 4,

        // Non-Talmudic but common
        'aruch hashulchan': 5,
        'shulchan aruch': 6,
        'mishneh torah': 7,
        'rambam': 8,
        'tur': 9,
    };

    // Extract tractate name from sourceText (removes page numbers)
    const extractTractate = (sourceText: string): string => {
        if (!sourceText) return '';

        // Remove common prefixes
        let cleaned = sourceText
            .replace(/^(Bavli|Yerushalmi|Mishnah|Tosefta)\s+/i, '')
            .trim();

        // Remove page/chapter references at the end
        cleaned = cleaned
            .replace(/\s+\d+[ab]?\s*$/i, '')
            .replace(/\s+\d+:\d+(-\d+)?\s*$/i, '')
            .replace(/\s+\d+\s*$/i, '')
            .trim();

        return cleaned.toLowerCase();
    };

    // Get tree image for a tree - uses DIRECT MAPPING for tractates
    const getTreeImage = (tree: { root?: { title?: string; sourceText?: string }; id?: string }): string => {
        const sourceText = tree?.root?.sourceText || '';
        const title = tree?.root?.title || '';

        // Extract tractate name
        const tractate = extractTractate(sourceText) || extractTractate(title);

        // Check direct mapping first
        if (tractate && tractateToImageIndex[tractate] !== undefined) {
            return allTreeImages[tractateToImageIndex[tractate]];
        }

        // Try partial match (for "Aruch HaShulchan Even HaEzer" -> "aruch hashulchan")
        for (const [key, index] of Object.entries(tractateToImageIndex)) {
            if (tractate.includes(key) || key.includes(tractate)) {
                return allTreeImages[index];
            }
        }

        // Fallback: use hash of tractate name for unknown tractates
        if (tractate) {
            let hash = 0;
            for (let i = 0; i < tractate.length; i++) {
                hash = ((hash << 5) - hash) + tractate.charCodeAt(i);
            }
            return allTreeImages[Math.abs(hash) % allTreeImages.length];
        }

        return allTreeImages[15]; // default.png
    };

    const [searchQuery, setSearchQuery] = React.useState('');

    const filteredForest = React.useMemo(() => {
        let result = receptionForest;

        // Filter by search query
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            result = result.filter(tree => {
                const root = tree.root;
                return root && (
                    root.title.toLowerCase().includes(lowerQuery) ||
                    root.sourceText.toLowerCase().includes(lowerQuery)
                );
            });
        }

        // Sort based on sortBy
        result = [...result].sort((a, b) => {
            if (sortBy === 'recent') {
                const getTimestamp = (tree: typeof a) => {
                    if (!tree.updatedAt) return 0;
                    return 'seconds' in tree.updatedAt ? tree.updatedAt.seconds * 1000 : tree.updatedAt.getTime();
                };
                return getTimestamp(b) - getTimestamp(a); // Most recent first
            }
            if (sortBy === 'branches') {
                return (b.branches?.length || 0) - (a.branches?.length || 0);
            }
            if (sortBy === 'alphabetical') {
                return (a.root?.title || '').localeCompare(b.root?.title || '');
            }
            return 0;
        });

        return result;
    }, [receptionForest, searchQuery, sortBy]);

    const [isManageMenuOpen, setIsManageMenuOpen] = useState(false);

    // Close menus when clicking outside
    React.useEffect(() => {
        const handleClickOutside = () => {
            setIsManageMenuOpen(false);
            setIsSortMenuOpen(false);
        };
        if (isManageMenuOpen || isSortMenuOpen) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isManageMenuOpen, isSortMenuOpen]);

    return (
        <div
            className="flex flex-col h-full overflow-hidden transition-colors duration-200 relative"
            style={{
                background: 'linear-gradient(135deg, #0a1f0a 0%, #0f1a0f 50%, #0a140a 100%)',
            }}
        >
            {/* Subtle forest background overlay */}
            <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                    backgroundImage: 'url(/trees/dashboard-bg.png)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    mixBlendMode: 'overlay',
                }}
            />

            {/* Header Section */}
            <div className="px-8 pt-8 pb-6 relative overflow-hidden">
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-[#10B981]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-1/4 w-48 h-48 bg-[#8B6914]/10 rounded-full blur-2xl translate-y-1/2"></div>
                <div className="absolute top-1/2 left-0 w-32 h-64 bg-[#10B981]/5 rounded-full blur-3xl -translate-x-1/2"></div>

                <div className="relative flex items-start gap-6">
                    {/* Decorative tree icon */}
                    <div className="hidden lg:flex w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1a4d2e]/40 to-[#0a140a] border border-[#10B981]/20 items-center justify-center shadow-lg">
                        <svg viewBox="0 0 48 48" className="w-12 h-12">
                            <path d="M22,44 Q18,32 22,18 L24,6 L26,18 Q30,32 26,44" fill="#8B6914" opacity="0.8" />
                            <ellipse cx="24" cy="10" rx="12" ry="7" fill="#10B981" opacity="0.6" />
                            <ellipse cx="24" cy="8" rx="8" ry="5" fill="#10B981" opacity="0.4" />
                            <ellipse cx="24" cy="6" rx="5" ry="3" fill="#10B981" opacity="0.3" />
                            <path d="M22,44 Q16,47 10,46" stroke="#8B6914" strokeWidth="2" fill="none" opacity="0.5" />
                            <path d="M26,44 Q32,47 38,46" stroke="#8B6914" strokeWidth="2" fill="none" opacity="0.5" />
                        </svg>
                    </div>

                    <div>
                        <h1 className="text-4xl font-serif font-bold text-[#f5f0e1] mb-1 tracking-tight">
                            Talmudic Ilanot
                        </h1>
                        <p className="text-[#d4a912] font-serif text-lg mb-3 opacity-90">אילנות תלמודיים</p>
                        <p className="text-[#f5f0e1]/60 max-w-2xl text-base font-light">
                            Mapping the roots and branches of Talmudic thought across generations of interpretation.
                        </p>
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="px-8 py-4 border-y border-[#1a4d2e]/40 bg-[#0a140a]/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between gap-6 relative">
                {/* Left: View Toggle */}
                <div className="flex bg-[#0a140a]/50 rounded-xl p-1 border border-[#1a4d2e]/50 shadow-inner">
                    <button
                        onClick={() => setViewMode('page')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${viewMode === 'page' ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30' : 'text-[#f5f0e1]/50 hover:text-[#f5f0e1] hover:bg-[#1a4d2e]/30 border border-transparent'}`}
                    >
                        <span className="material-symbols-outlined text-[18px]">park</span>
                        <span className="hidden sm:inline">Trees</span>
                    </button>
                    <button
                        onClick={() => setViewMode('author')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${viewMode === 'author' ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30' : 'text-[#f5f0e1]/50 hover:text-[#f5f0e1] hover:bg-[#1a4d2e]/30 border border-transparent'}`}
                    >
                        <span className="material-symbols-outlined text-[18px]">groups</span>
                        <span className="hidden sm:inline">Scholars</span>
                    </button>
                    <button
                        onClick={() => setViewMode('tractate')}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${viewMode === 'tractate' ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30' : 'text-[#f5f0e1]/50 hover:text-[#f5f0e1] hover:bg-[#1a4d2e]/30 border border-transparent'}`}
                    >
                        <span className="material-symbols-outlined text-[18px]">menu_book</span>
                        <span className="hidden sm:inline">Tractates</span>
                    </button>
                </div>

                {/* Center: Search */}
                <div className="flex-1 max-w-2xl relative group">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#10B981]/50 group-focus-within:text-[#10B981] transition-colors">search</span>
                    <input
                        type="text"
                        placeholder="Search passages, authors, or keywords..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#0a140a]/50 border border-[#1a4d2e]/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#f5f0e1] focus:outline-none focus:border-[#10B981]/50 focus:bg-[#0a140a] transition-all placeholder:text-[#f5f0e1]/30"
                    />
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-3">
                    {/* Manage Menu */}
                    <div className="relative" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setIsManageMenuOpen(!isManageMenuOpen)}
                            className={`h-10 px-3 rounded-xl border border-[#1a4d2e]/50 hover:bg-[#1a4d2e]/30 text-[#f5f0e1]/60 hover:text-[#f5f0e1] transition-colors flex items-center gap-2 ${isManageMenuOpen ? 'bg-[#1a4d2e]/30 text-[#f5f0e1]' : ''}`}
                            title="Management Tools"
                        >
                            <span className="material-symbols-outlined">tune</span>
                            <span className="hidden xl:inline text-sm font-medium">Manage</span>
                        </button>

                        {isManageMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-56 bg-[#0f1a0f] border border-[#1a4d2e]/50 rounded-xl shadow-xl overflow-hidden z-30 animate-fade-in">
                                <div className="p-1">
                                    <button
                                        onClick={() => { setIsGroundTruthOpen(true); setIsManageMenuOpen(false); }}
                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#1a4d2e]/30 text-sm text-[#f5f0e1]/60 hover:text-[#f5f0e1] flex items-center gap-2 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">school</span>
                                        View Ground Truth
                                    </button>
                                    <button
                                        onClick={() => { onStandardizeTitles(); setIsManageMenuOpen(false); }}
                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#1a4d2e]/30 text-sm text-[#f5f0e1]/60 hover:text-[#f5f0e1] flex items-center gap-2 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">edit_document</span>
                                        Standardize Titles
                                    </button>
                                    <button
                                        onClick={() => { onOpenMergeModal(); setIsManageMenuOpen(false); }}
                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#1a4d2e]/30 text-sm text-[#f5f0e1]/60 hover:text-[#f5f0e1] flex items-center gap-2 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">merge_type</span>
                                        Consolidate Pages
                                    </button>
                                    {onDiagnoseOrphans && (
                                        <button
                                            onClick={() => { onDiagnoseOrphans(); setIsManageMenuOpen(false); }}
                                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#1a4d2e]/30 text-sm text-[#f5f0e1]/60 hover:text-[#f5f0e1] flex items-center gap-2 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">scan</span>
                                            Diagnose Orphan Branches
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sort Dropdown */}
                    <div className="relative" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                            className={`h-10 px-3 rounded-xl border border-[#1a4d2e]/50 hover:bg-[#1a4d2e]/30 text-[#f5f0e1]/60 hover:text-[#f5f0e1] transition-colors flex items-center gap-2 ${isSortMenuOpen ? 'bg-[#1a4d2e]/30 text-[#f5f0e1]' : ''}`}
                            title="Sort passages"
                        >
                            <span className="material-symbols-outlined text-[18px]">sort</span>
                            <span className="hidden lg:inline text-sm font-medium">
                                {sortBy === 'recent' ? 'Recent' : sortBy === 'branches' ? 'Branches' : 'A-Z'}
                            </span>
                            <span className="material-symbols-outlined text-[16px]">expand_more</span>
                        </button>

                        {isSortMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-48 bg-[#0f1a0f] border border-[#1a4d2e]/50 rounded-xl shadow-xl overflow-hidden z-30 animate-fade-in">
                                <div className="p-1">
                                    <button
                                        onClick={() => { setSortBy('recent'); setIsSortMenuOpen(false); }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${sortBy === 'recent' ? 'bg-[#10B981]/20 text-[#10B981]' : 'hover:bg-[#1a4d2e]/30 text-[#f5f0e1]/60 hover:text-[#f5f0e1]'}`}
                                    >
                                        <span className="material-symbols-outlined text-[18px]">schedule</span>
                                        Recently Updated
                                        {sortBy === 'recent' && <span className="material-symbols-outlined text-[16px] ml-auto">check</span>}
                                    </button>
                                    <button
                                        onClick={() => { setSortBy('branches'); setIsSortMenuOpen(false); }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${sortBy === 'branches' ? 'bg-[#10B981]/20 text-[#10B981]' : 'hover:bg-[#1a4d2e]/30 text-[#f5f0e1]/60 hover:text-[#f5f0e1]'}`}
                                    >
                                        <span className="material-symbols-outlined text-[18px]">park</span>
                                        Most Branches
                                        {sortBy === 'branches' && <span className="material-symbols-outlined text-[16px] ml-auto">check</span>}
                                    </button>
                                    <button
                                        onClick={() => { setSortBy('alphabetical'); setIsSortMenuOpen(false); }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${sortBy === 'alphabetical' ? 'bg-[#10B981]/20 text-[#10B981]' : 'hover:bg-[#1a4d2e]/30 text-[#f5f0e1]/60 hover:text-[#f5f0e1]'}`}
                                    >
                                        <span className="material-symbols-outlined text-[18px]">sort_by_alpha</span>
                                        Alphabetical
                                        {sortBy === 'alphabetical' && <span className="material-symbols-outlined text-[16px] ml-auto">check</span>}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="h-6 w-px bg-[#1a4d2e]/40 mx-1"></div>

                    <button
                        onClick={onImportFromBenYehuda}
                        className="h-10 px-4 rounded-xl border border-[#8B6914]/40 hover:border-[#8B6914]/60 hover:bg-[#8B6914]/10 text-[#d4a912] transition-all flex items-center gap-2 text-sm font-medium"
                    >
                        <span className="material-symbols-outlined text-[20px]">cloud_download</span>
                        <span className="hidden lg:inline">Import</span>
                    </button>

                    {onScanPdf && (
                        <button
                            onClick={onScanPdf}
                            className="h-10 px-4 rounded-xl border border-red-500/40 hover:border-red-500/60 hover:bg-red-500/10 text-red-400 transition-all flex items-center gap-2 text-sm font-medium"
                        >
                            <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                            <span className="hidden lg:inline">Scan PDF</span>
                        </button>
                    )}

                    <button
                        onClick={onAddPassage}
                        className="h-10 px-4 rounded-xl bg-[#10B981] hover:bg-[#0fa76f] text-[#0a140a] font-bold shadow-lg shadow-[#10B981]/20 transition-all flex items-center gap-2 text-sm"
                    >
                        <span className="material-symbols-outlined text-[20px]">park</span>
                        <span className="hidden sm:inline">Plant Tree</span>
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative z-10">
                {viewMode === 'author' ? (
                    <AuthorView receptionForest={filteredForest} onNavigate={onNavigate} onAuthorClick={onAuthorClick} />
                ) : viewMode === 'tractate' ? (
                    <TractateView receptionForest={filteredForest} onNavigate={(id) => onNavigate(id)} onTractateClick={onTractateClick} tractateProfiles={tractateProfiles} />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                        {filteredForest.map(tree => {
                            const relativeTime = formatRelativeTime(tree.updatedAt);
                            const isRecent = isRecentlyUpdated(tree.updatedAt);

                            return (
                                <div
                                    key={tree.id}
                                    onClick={() => onNavigate(tree.id)}
                                    className="group relative bg-gradient-to-b from-[#0f1a0f] to-[#0a140a] border border-[#1a4d2e]/50 hover:border-[#10B981]/60 rounded-2xl cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-[#10B981]/20 hover:-translate-y-1 overflow-hidden p-5"
                                    style={{ minHeight: '280px' }}
                                >
                                    {/* Title at top */}
                                    <h3 className="text-lg font-serif font-bold text-[#f5f0e1] group-hover:text-[#10B981] transition-colors line-clamp-2 leading-snug mb-1 relative z-10">
                                        {tree.root?.title || 'Untitled Tree'}
                                    </h3>
                                    <p className="text-xs text-[#f5f0e1]/50 mb-4 line-clamp-1 relative z-10">
                                        {tree.root?.sourceText || 'No source'}
                                    </p>

                                    {/* Centered Tree Illustration - Generated Image */}
                                    <div className="flex-1 flex items-center justify-center py-4 relative">
                                        <div className="w-36 h-36 relative group-hover:scale-105 transition-transform duration-500">
                                            <img
                                                src={getTreeImage(tree)}
                                                alt={`${tree.root?.sourceText || 'default'} tree`}
                                                className="w-full h-full object-contain drop-shadow-lg"
                                                onError={(e) => { e.currentTarget.src = '/trees/default.png'; }}
                                            />
                                        </div>
                                    </div>

                                    {/* Branch count with leaf icon at bottom */}
                                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-[#1a4d2e]/30 relative z-10">
                                        <div className="flex items-center gap-2">
                                            <svg viewBox="0 0 20 20" className="w-4 h-4 text-[#10B981]">
                                                <ellipse cx="10" cy="7" rx="6" ry="5" fill="currentColor" opacity="0.6" />
                                                <path d="M9,18 Q9,12 10,7 Q11,12 11,18" fill="#8B6914" opacity="0.8" />
                                            </svg>
                                            <span className="text-sm font-medium text-[#10B981]">{tree.branches?.length || 0} branches</span>
                                        </div>
                                        {relativeTime && (
                                            <div className="flex items-center gap-1 text-xs text-[#f5f0e1]/40">
                                                {isRecent && <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse"></span>}
                                                <span>{relativeTime}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Latest author */}
                                    {tree.branches && tree.branches.length > 0 && (
                                        <div className="text-xs text-[#f5f0e1]/30 mt-2 relative z-10">
                                            Latest: <span className="text-[#f5f0e1]/50">{tree.branches[tree.branches.length - 1].author}</span>
                                        </div>
                                    )}

                                    {/* Delete Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm('Delete this tree?')) onDeleteTree(tree.id);
                                        }}
                                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-[#f5f0e1]/30 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-400/10 transition-all z-20"
                                    >
                                        <span className="material-symbols-outlined text-lg">delete</span>
                                    </button>
                                </div>
                            );
                        })}

                        {/* Add New Passage Card */}
                        <div
                            onClick={onAddPassage}
                            className="group relative border-2 border-dashed border-forest-mid/40 hover:border-primary/60 rounded-3xl cursor-pointer hover:bg-forest-dark/30 transition-all duration-500 flex flex-col items-center justify-center text-cream/40 hover:text-primary min-h-[320px] overflow-hidden"
                        >
                            {/* Subtle tree silhouette in background */}
                            <svg viewBox="0 0 200 250" className="absolute inset-0 w-full h-full opacity-10 group-hover:opacity-20 transition-opacity">
                                <path d="M90,240 Q85,180 95,100 Q100,60 105,100 Q115,180 110,240 Z" fill="#10B981" />
                                <ellipse cx="100" cy="70" rx="50" ry="40" fill="#10B981" />
                                <ellipse cx="100" cy="55" rx="35" ry="28" fill="#10B981" opacity="0.5" />
                            </svg>

                            <div className="relative z-10 flex flex-col items-center">
                                <div className="w-20 h-20 rounded-full bg-forest-deep border-2 border-dashed border-forest-mid/60 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:border-primary/60 group-hover:shadow-xl group-hover:shadow-primary/20 transition-all duration-500">
                                    <span className="material-symbols-outlined text-4xl">add</span>
                                </div>
                                <span className="font-serif font-bold text-xl">Plant New Tree</span>
                                <span className="text-sm opacity-60 mt-2">Add a Talmudic passage</span>
                            </div>
                        </div>

                        {filteredForest.length === 0 && (
                            <div className="col-span-full flex flex-col items-center justify-center py-32 text-cream/60">
                                <div className="w-24 h-24 rounded-full bg-forest-dark border border-forest-mid/30 flex items-center justify-center mb-6">
                                    <span className="material-symbols-outlined text-5xl text-primary/30">park</span>
                                </div>
                                <p className="text-xl font-serif font-medium text-cream mb-2">Your forest awaits</p>
                                <p className="text-sm opacity-60 max-w-md text-center">
                                    Plant your first tree by adding a Talmudic passage or importing text from the Ben Yehuda Project.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Ground Truth Viewer Modal */}
            <GroundTruthViewer
                isOpen={isGroundTruthOpen}
                onClose={() => setIsGroundTruthOpen(false)}
            />
        </div >
    );
};

export default Dashboard;