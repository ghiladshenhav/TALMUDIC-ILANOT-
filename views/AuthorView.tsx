import React, { useMemo, useState } from 'react';
import { ReceptionTree } from '../types';
import { aggregateByAuthor, AuthorEntry } from '../utils/author-aggregation';

interface AuthorViewProps {
    receptionForest: ReceptionTree[];
    onNavigate: (treeId: string, nodeId?: string) => void;
    onAuthorClick?: (author: AuthorEntry) => void;
}

const AuthorView: React.FC<AuthorViewProps> = ({ receptionForest, onNavigate, onAuthorClick }) => {
    const authors = useMemo(() => aggregateByAuthor(receptionForest), [receptionForest]);
    const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set());

    const toggleAuthor = (authorName: string) => {
        const newExpanded = new Set(expandedAuthors);
        if (newExpanded.has(authorName)) {
            newExpanded.delete(authorName);
        } else {
            newExpanded.add(authorName);
        }
        setExpandedAuthors(newExpanded);
    };

    const toggleAll = () => {
        if (expandedAuthors.size === authors.length) {
            setExpandedAuthors(new Set());
        } else {
            setExpandedAuthors(new Set(authors.map(a => a.name)));
        }
    };

    if (authors.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-[#f5f0e1]/40">
                <div className="w-20 h-20 rounded-full bg-[#0f1a0f] border border-[#1a4d2e]/30 flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-4xl text-[#10B981]/30">person_off</span>
                </div>
                <p className="text-lg font-serif">No authors found</p>
                <p className="text-sm opacity-60 mt-1">Add interpretations to see authors here</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Stats */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-[#0f1a0f] to-[#0a140a] rounded-xl border border-[#1a4d2e]/30">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1a4d2e]/40 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#10B981]">groups</span>
                    </div>
                    <div>
                        <p className="text-[#f5f0e1]/60 text-sm">
                            <span className="text-[#10B981] font-bold">{authors.length}</span> scholars across{' '}
                            <span className="text-[#10B981] font-bold">{receptionForest.length}</span> pages
                        </p>
                    </div>
                </div>
                <button
                    onClick={toggleAll}
                    className="text-sm font-medium text-[#10B981] hover:text-[#10B981]/80 transition-colors px-3 py-1.5 rounded-lg hover:bg-[#10B981]/10"
                >
                    {expandedAuthors.size === authors.length ? 'Collapse All' : 'Expand All'}
                </button>
            </div>

            {/* Author Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {authors.map((author, index) => {
                    const isExpanded = expandedAuthors.has(author.name);
                    const uniqueWorks = Array.from(author.workTitles).filter(Boolean);

                    return (
                        <div
                            key={author.name}
                            className={`bg-gradient-to-br from-[#0f1a0f] to-[#0a140a] border border-[#1a4d2e]/40 rounded-2xl overflow-hidden transition-all duration-300 hover:border-[#10B981]/40 ${isExpanded ? 'row-span-2' : ''}`}
                            style={{ animationDelay: `${index * 30}ms` }}
                        >
                            {/* Author Header */}
                            <div
                                className="p-4 cursor-pointer hover:bg-[#10B981]/5 transition-colors flex items-start justify-between gap-3"
                            >
                                <div className="flex items-center gap-3" onClick={() => toggleAuthor(author.name)}>
                                    {/* Author Avatar */}
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1a4d2e]/60 to-[#0a140a] border border-[#10B981]/30 flex items-center justify-center text-[#10B981] font-bold text-lg font-serif">
                                        {author.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-[#f5f0e1] leading-tight font-serif">{author.name}</h3>
                                        <p className="text-xs text-[#10B981] mt-0.5">
                                            {author.branches.length} interpretation{author.branches.length !== 1 ? 's' : ''}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {onAuthorClick && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onAuthorClick(author);
                                            }}
                                            className="px-3 py-1.5 rounded-lg bg-[#10B981]/10 text-[#10B981] text-xs font-bold hover:bg-[#10B981]/20 transition-colors flex items-center gap-1"
                                        >
                                            <span className="material-symbols-outlined text-sm">person</span>
                                            View Profile
                                        </button>
                                    )}
                                    <span
                                        onClick={() => toggleAuthor(author.name)}
                                        className={`material-symbols-outlined text-[#10B981] transition-transform duration-300 cursor-pointer hover:bg-[#10B981]/10 rounded-lg p-1 ${isExpanded ? 'rotate-180' : ''}`}
                                    >
                                        expand_more
                                    </span>
                                </div>
                            </div>

                            {/* Expanded Content */}
                            {isExpanded && (
                                <div className="border-t border-[#1a4d2e]/30 bg-[#0a140a]/50 p-4 space-y-4 animate-fade-in">
                                    {/* Works */}
                                    {uniqueWorks.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] font-bold text-[#10B981] uppercase tracking-widest mb-2 flex items-center gap-2">
                                                <span className="w-1 h-3 bg-gradient-to-b from-[#10B981]/60 to-transparent rounded-full"></span>
                                                Works
                                            </h4>
                                            <div className="flex flex-wrap gap-2">
                                                {uniqueWorks.map((work, i) => (
                                                    <span key={i} className="px-2.5 py-1 rounded-lg bg-[#1a4d2e]/20 text-xs text-[#f5f0e1]/70 border border-[#1a4d2e]/30">
                                                        {work}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Citations */}
                                    <div>
                                        <h4 className="text-[10px] font-bold text-[#8B6914] uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <span className="w-1 h-3 bg-gradient-to-b from-[#8B6914]/60 to-transparent rounded-full"></span>
                                            Talmudic References
                                        </h4>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {author.branches.map((item, i) => (
                                                <button
                                                    key={i}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onNavigate(item.treeId, item.branch.id);
                                                    }}
                                                    className="w-full text-left group flex items-start gap-3 p-2.5 rounded-xl hover:bg-[#10B981]/10 transition-colors border border-transparent hover:border-[#10B981]/20"
                                                >
                                                    <span className="material-symbols-outlined text-[#10B981] text-sm mt-0.5">auto_stories</span>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-[#f5f0e1] group-hover:text-[#10B981] transition-colors">
                                                            {item.rootSource}
                                                        </p>
                                                        <p className="text-xs text-[#f5f0e1]/40 line-clamp-1">
                                                            {item.rootTitle}
                                                        </p>
                                                        {item.branch.referenceText && (
                                                            <p className="text-xs text-[#f5f0e1]/30 mt-1 line-clamp-2 italic">
                                                                "{item.branch.referenceText}"
                                                            </p>
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AuthorView;
