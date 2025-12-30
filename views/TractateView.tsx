import React, { useMemo, useState } from 'react';
import { ReceptionTree, TractateProfile } from '../types';
import { extractTractate } from '../utils/tractate-mappings';

interface TractateViewProps {
    receptionForest: ReceptionTree[];
    onNavigate: (treeId: string) => void;
    onTractateClick?: (tractate: string) => void;
    tractateProfiles?: Record<string, TractateProfile>;
}

// Map tractates to tree images
const tractateTreeImages: Record<string, string> = {
    berakhot: '/trees/berakhot.png',
    shabbat: '/trees/shabbat.png',
    eruvin: '/trees/eruvin.png',
    pesachim: '/trees/pesachim.png',
    yoma: '/trees/yoma.png',
    sukkah: '/trees/sukkah.png',
    taanit: '/trees/taanit.png',
    megillah: '/trees/megillah.png',
    gittin: '/trees/gittin.png',
    kiddushin: '/trees/kiddushin.png',
    ketubot: '/trees/ketubot.png',
    bava: '/trees/bava.png',
    sanhedrin: '/trees/sanhedrin.png',
    menachot: '/trees/menachot.png',
    avot: '/trees/avot.png',
    default: '/trees/default.png',
};

const getTreeImage = (tractate: string, tractateProfiles?: Record<string, TractateProfile>): string => {
    // Check for custom profile image first
    const normalizedKey = tractate.toLowerCase().replace(/\s+/g, '_');
    const profile = tractateProfiles?.[normalizedKey];
    if (profile?.imageUrl) {
        return profile.imageUrl;
    }
    // Fall back to static images
    const key = tractate.toLowerCase().split(' ')[0];
    return tractateTreeImages[key] || tractateTreeImages.default;
};

const TractateView: React.FC<TractateViewProps> = ({ receptionForest, onNavigate, onTractateClick, tractateProfiles }) => {
    const treesByTractate = useMemo(() => {
        const groups: Record<string, ReceptionTree[]> = {};
        receptionForest.forEach(tree => {
            const tractate = extractTractate(tree.root.sourceText);
            if (!groups[tractate]) {
                groups[tractate] = [];
            }
            groups[tractate].push(tree);
        });
        return groups;
    }, [receptionForest]);

    const sortedTractates = useMemo(() => {
        return Object.keys(treesByTractate).sort();
    }, [treesByTractate]);

    const [expandedTractate, setExpandedTractate] = useState<string | null>(null);

    return (
        <div className="space-y-4 pb-20">
            {sortedTractates.map((tractate, index) => (
                <div
                    key={tractate}
                    className="bg-gradient-to-br from-[#0f1a0f] to-[#0a140a] border border-[#1a4d2e]/40 rounded-2xl overflow-hidden transition-all duration-300 hover:border-[#10B981]/40"
                    style={{ animationDelay: `${index * 50}ms` }}
                >
                    <button
                        onClick={() => setExpandedTractate(expandedTractate === tractate ? null : tractate)}
                        className="w-full flex items-center justify-between p-5 hover:bg-[#10B981]/5 transition-colors"
                    >
                        <div className="flex items-center gap-4">
                            {/* Tractate Tree Image */}
                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#1a4d2e]/40 to-[#0a140a] border border-[#10B981]/20 flex items-center justify-center overflow-hidden p-1">
                                <img
                                    src={getTreeImage(tractate, tractateProfiles)}
                                    alt={tractate}
                                    className="w-full h-full object-contain opacity-80"
                                    onError={(e) => { e.currentTarget.src = '/trees/default.png'; }}
                                />
                            </div>
                            <div className="text-left">
                                <h3 className="text-xl font-bold text-[#f5f0e1] font-serif">{tractate}</h3>
                                <p className="text-sm text-[#10B981]">{treesByTractate[tractate].length} passages</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {onTractateClick && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onTractateClick(tractate);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-[#10B981]/10 text-[#10B981] text-sm border border-[#10B981]/20 hover:bg-[#10B981]/20 transition-colors flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-sm">info</span>
                                    View Details
                                </button>
                            )}
                            <span className={`material-symbols-outlined text-[#10B981] transition-transform duration-300 ${expandedTractate === tractate ? 'rotate-180' : ''}`}>
                                expand_more
                            </span>
                        </div>
                    </button>

                    {expandedTractate === tractate && (
                        <div className="p-5 border-t border-[#1a4d2e]/30 bg-[#0a140a]/50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
                            {treesByTractate[tractate].map((tree, treeIndex) => (
                                <div
                                    key={tree.id}
                                    onClick={() => onNavigate(tree.id)}
                                    className="group p-4 rounded-xl bg-gradient-to-br from-[#0f1a0f] to-[#0a140a] border border-[#1a4d2e]/30 hover:border-[#10B981]/50 cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-[#10B981]/10 hover:-translate-y-1"
                                    style={{ animationDelay: `${treeIndex * 30}ms` }}
                                >
                                    <h4 className="font-serif font-bold text-[#f5f0e1] mb-1 group-hover:text-[#10B981] transition-colors line-clamp-2">
                                        {tree.root.title}
                                    </h4>
                                    <p className="text-xs text-[#f5f0e1]/40 font-mono mb-3">{tree.root.sourceText}</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs bg-[#10B981]/10 text-[#10B981] px-2.5 py-1 rounded-lg border border-[#10B981]/20">
                                            {tree.branches.length} branches
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}

            {sortedTractates.length === 0 && (
                <div className="text-center py-20 text-[#f5f0e1]/40">
                    <div className="w-20 h-20 mx-auto rounded-full bg-[#0f1a0f] border border-[#1a4d2e]/30 flex items-center justify-center mb-4">
                        <svg viewBox="0 0 40 40" className="w-10 h-10 opacity-40">
                            <path d="M18,35 Q15,25 18,15 L20,8 L22,15 Q25,25 22,35" fill="#8B6914" />
                            <ellipse cx="20" cy="10" rx="8" ry="5" fill="#10B981" opacity="0.5" />
                        </svg>
                    </div>
                    <p className="text-lg font-serif">No tractates found</p>
                    <p className="text-sm opacity-60 mt-1">Plant your first tree to get started</p>
                </div>
            )}
        </div>
    );
};

export default TractateView;
