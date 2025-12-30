import React, { useState } from 'react';
import { RootNode, BranchNode } from '../../types';
import { ChatMessage } from '../../App';
import EmbeddedChatPanel from '../ai/EmbeddedChatPanel';

interface RootTextPanelProps {
    node: RootNode;
    branches?: BranchNode[];
    onEdit: () => void;
    onRegenerate?: () => void;
    chatHistory?: ChatMessage[];
    onSendMessage?: (message: string, context?: string) => void;
    isAiLoading?: boolean;
    highlightPhrase?: string | null;
}

const RootTextPanel: React.FC<RootTextPanelProps> = ({
    node,
    branches = [],
    onEdit,
    onRegenerate,
    chatHistory = [],
    onSendMessage = (_msg: string, _ctx?: string) => { },
    isAiLoading = false,
    highlightPhrase = null
}) => {
    const [activeTab, setActiveTab] = useState<'text' | 'chat'>('text');

    // Function to highlight matching phrase in text
    const highlightTextWithPhrase = (text: string, phrase: string | null): React.ReactNode => {
        if (!phrase || !text) return text;

        // Normalize whitespace for better matching
        const normalizedPhrase = phrase.trim();
        if (!normalizedPhrase) return text;

        console.log('[Highlight] Searching for:', normalizedPhrase.substring(0, 50) + '...');
        console.log('[Highlight] In text:', text.substring(0, 100) + '...');

        // Try exact match first
        let index = text.indexOf(normalizedPhrase);

        // If no exact match, try normalized search (remove extra whitespace)
        if (index === -1) {
            const normalizedText = text.replace(/\s+/g, ' ');
            const normalizedSearch = normalizedPhrase.replace(/\s+/g, ' ');
            index = normalizedText.indexOf(normalizedSearch);

            // If still no match, try finding a significant substring (first 20 chars)
            if (index === -1 && normalizedSearch.length > 20) {
                const shortPhrase = normalizedSearch.substring(0, 20);
                index = normalizedText.indexOf(shortPhrase);
                if (index !== -1) {
                    console.log('[Highlight] Found partial match at index:', index);
                    // For partial match, highlight the found portion
                    return (
                        <>
                            {text.substring(0, index)}
                            <mark
                                className="bg-yellow-400/80 text-[#0a140a] px-1 rounded"
                                style={{
                                    boxShadow: '0 0 10px rgba(250, 204, 21, 0.5)',
                                    animation: 'pulse 2s infinite'
                                }}
                            >
                                {text.substring(index, index + Math.min(normalizedSearch.length, 50))}
                            </mark>
                            {text.substring(index + Math.min(normalizedSearch.length, 50))}
                        </>
                    );
                }
            }
        }

        if (index !== -1) {
            console.log('[Highlight] Found exact match at index:', index);
            return (
                <>
                    {text.substring(0, index)}
                    <mark
                        className="bg-yellow-400/80 text-[#0a140a] px-1 rounded"
                        style={{
                            boxShadow: '0 0 10px rgba(250, 204, 21, 0.5)',
                            animation: 'pulse 2s infinite'
                        }}
                    >
                        {text.substring(index, index + normalizedPhrase.length)}
                    </mark>
                    {text.substring(index + normalizedPhrase.length)}
                </>
            );
        }

        console.log('[Highlight] No match found');
        // If no exact match, return original text
        return text;
    };

    return (
        <div className="h-full flex flex-col overflow-hidden relative"
            style={{
                background: 'linear-gradient(180deg, #050a05 0%, #0a140a 30%, #0f1a0f 100%)',
            }}
        >
            {/* Glowing accent at top */}
            <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
                style={{
                    background: 'radial-gradient(ellipse at center top, rgba(16, 185, 129, 0.15) 0%, transparent 70%)'
                }}
            />

            {/* Header - Root Node (The "Trunk" of the tree) */}
            <div className="p-6 relative z-10">
                {/* Top accent line */}
                <div className="absolute top-0 left-6 right-6 h-1 bg-gradient-to-r from-transparent via-[#10B981]/50 to-transparent rounded-full" />

                {/* Tree/Root Icon and Title */}
                <div className="flex items-start gap-5 mb-5">
                    {/* Root Icon - More dramatic */}
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shadow-[#10B981]/20 flex-shrink-0 relative overflow-hidden"
                        style={{
                            background: 'linear-gradient(135deg, #1a4d2e 0%, #0a1f0a 100%)',
                            border: '2px solid rgba(16, 185, 129, 0.4)'
                        }}
                    >
                        <svg viewBox="0 0 48 48" className="w-10 h-10">
                            <path d="M22,42 Q17,30 22,16 L24,4 L26,16 Q31,30 26,42" fill="#8B6914" opacity="0.9" />
                            <ellipse cx="24" cy="8" rx="12" ry="7" fill="#10B981" opacity="0.8" />
                            <ellipse cx="24" cy="6" rx="8" ry="5" fill="#22c55e" opacity="0.6" />
                            <ellipse cx="24" cy="5" rx="5" ry="3" fill="#34d399" opacity="0.4" />
                            <path d="M22,42 Q14,46 8,44" stroke="#5c3d1a" strokeWidth="2.5" fill="none" opacity="0.6" />
                            <path d="M26,42 Q34,46 40,44" stroke="#5c3d1a" strokeWidth="2.5" fill="none" opacity="0.6" />
                        </svg>
                        {/* Glow effect */}
                        <div className="absolute inset-0 bg-[#10B981]/10 animate-pulse" style={{ animationDuration: '3s' }} />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-[10px] font-black text-[#10B981] uppercase tracking-[0.2em] bg-[#10B981]/10 px-2 py-1 rounded-md border border-[#10B981]/20">Root Source</span>
                            <div className="flex-1 h-px bg-gradient-to-r from-[#10B981]/40 to-transparent"></div>
                        </div>
                        <h2 className="text-2xl font-bold text-[#f5f0e1] font-serif leading-tight mb-2">{node.title}</h2>
                        <div className="text-sm text-[#10B981]/70 font-mono bg-[#0a140a] px-3 py-1 rounded-lg border border-[#1a4d2e]/40 inline-block">{node.sourceText}</div>
                    </div>

                    <div className="flex gap-1">
                        <button
                            onClick={onRegenerate}
                            className="p-2 text-[#f5f0e1]/40 hover:text-[#10B981] hover:bg-[#10B981]/10 rounded-xl transition-all"
                            title="Regenerate Data from AI"
                        >
                            <span className="material-symbols-outlined text-xl">sync</span>
                        </button>
                        <button
                            onClick={onEdit}
                            className="p-2 text-[#f5f0e1]/40 hover:text-[#10B981] hover:bg-[#10B981]/10 rounded-xl transition-all"
                            title="Edit Text"
                        >
                            <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
                    </div>
                </div>

                {/* Tabs - styled as tree branches */}
                <div className="flex gap-6 border-t border-[#1a4d2e]/30 pt-3">
                    <button
                        onClick={() => setActiveTab('text')}
                        className={`flex items-center gap-2 pb-1 text-sm font-bold transition-all relative ${activeTab === 'text' ? 'text-[#10B981]' : 'text-[#f5f0e1]/50 hover:text-[#f5f0e1]'
                            }`}
                    >
                        <span className="material-symbols-outlined text-lg">article</span>
                        Sacred Text
                        {activeTab === 'text' && (
                            <div className="absolute -bottom-1 left-0 w-full h-0.5 bg-gradient-to-r from-[#10B981] to-[#10B981]/50 rounded-full" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`flex items-center gap-2 pb-1 text-sm font-bold transition-all relative ${activeTab === 'chat' ? 'text-[#10B981]' : 'text-[#f5f0e1]/50 hover:text-[#f5f0e1]'
                            }`}
                    >
                        <span className="material-symbols-outlined text-lg">psychology</span>
                        Ask AI
                        {activeTab === 'chat' && (
                            <div className="absolute -bottom-1 left-0 w-full h-0.5 bg-gradient-to-r from-[#10B981] to-[#10B981]/50 rounded-full" />
                        )}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'text' ? (
                    <div className="h-full overflow-y-auto p-6 space-y-8">
                        {/* Hebrew Original - The Root - DRAMATIC STYLING */}
                        <div className="group relative">
                            {/* Section header */}
                            <div className="flex items-center gap-3 mb-4">
                                <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                                    style={{
                                        background: 'linear-gradient(135deg, #10B981 0%, #0a4d2e 100%)',
                                        boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
                                    }}
                                >
                                    <span className="material-symbols-outlined text-white text-2xl">auto_stories</span>
                                </div>
                                <div>
                                    <span className="text-xs font-black text-[#10B981] uppercase tracking-[0.2em]">Original Hebrew</span>
                                    <div className="text-[10px] text-[#f5f0e1]/40">Primary Talmudic Source</div>
                                </div>
                                <div className="flex-1 h-px bg-gradient-to-r from-[#10B981]/40 to-transparent"></div>
                            </div>

                            {/* Content card with glassmorphism */}
                            <div
                                className="relative rounded-2xl overflow-hidden transition-all duration-300 group-hover:shadow-2xl group-hover:shadow-[#10B981]/10"
                                style={{
                                    background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.08) 0%, rgba(10, 20, 10, 0.95) 100%)',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    backdropFilter: 'blur(10px)',
                                }}
                            >
                                {/* Top gradient bar */}
                                <div className="h-1 w-full bg-gradient-to-r from-[#10B981] via-[#22c55e] to-[#10B981]" />

                                <div className="p-6">
                                    <div className="text-xl font-serif leading-loose text-right text-[#f5f0e1]" dir="rtl" style={{ fontFamily: '"David Libre", "Frank Ruhl Libre", serif' }}>
                                        {node.hebrewText
                                            ? highlightTextWithPhrase(node.hebrewText, highlightPhrase)
                                            : <span className="text-[#f5f0e1]/40 italic text-base">No Hebrew text available.</span>
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>

                        {node.hebrewTranslation && (
                            <div className="group relative">
                                {/* Section header */}
                                <div className="flex items-center gap-3 mb-4">
                                    <div
                                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                                        style={{
                                            background: 'linear-gradient(135deg, #8B6914 0%, #5c3d1a 100%)',
                                            boxShadow: '0 4px 15px rgba(139, 105, 20, 0.3)',
                                        }}
                                    >
                                        <span className="material-symbols-outlined text-white text-2xl">format_quote</span>
                                    </div>
                                    <div>
                                        <span className="text-xs font-black text-[#d4a912] uppercase tracking-[0.2em]">Steinsaltz Commentary</span>
                                        <div className="text-[10px] text-[#f5f0e1]/40">Elucidation & Context</div>
                                    </div>
                                    <div className="flex-1 h-px bg-gradient-to-r from-[#8B6914]/40 to-transparent"></div>
                                </div>

                                {/* Content card */}
                                <div
                                    className="relative rounded-2xl overflow-hidden transition-all duration-300 group-hover:shadow-2xl group-hover:shadow-[#8B6914]/10"
                                    style={{
                                        background: 'linear-gradient(145deg, rgba(139, 105, 20, 0.08) 0%, rgba(10, 20, 10, 0.95) 100%)',
                                        border: '1px solid rgba(139, 105, 20, 0.3)',
                                        backdropFilter: 'blur(10px)',
                                    }}
                                >
                                    <div className="h-1 w-full bg-gradient-to-r from-[#8B6914] via-[#d4a912] to-[#8B6914]" />
                                    <div className="p-6">
                                        <div className="text-lg font-serif leading-relaxed text-right text-[#f5f0e1]/85" dir="rtl" style={{ fontFamily: '"David Libre", "Frank Ruhl Libre", serif' }}>
                                            {node.hebrewTranslation}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Decorative divider */}
                        <div className="flex items-center gap-4 py-4">
                            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#1a4d2e]/60 to-transparent"></div>
                            <div className="relative">
                                <svg viewBox="0 0 40 40" className="w-10 h-10 animate-sway" style={{ animationDuration: '6s' }}>
                                    <path d="M19,38 Q17,28 19,18 L20,8 L21,18 Q23,28 21,38" fill="#8B6914" opacity="0.7" />
                                    <ellipse cx="20" cy="10" rx="10" ry="7" fill="#10B981" opacity="0.6" />
                                    <ellipse cx="20" cy="8" rx="6" ry="4" fill="#22c55e" opacity="0.5" />
                                    <ellipse cx="20" cy="7" rx="3" ry="2" fill="#34d399" opacity="0.4" />
                                </svg>
                            </div>
                            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#1a4d2e]/60 to-transparent"></div>
                        </div>

                        {/* English Translation */}
                        <div className="group relative">
                            {/* Section header */}
                            <div className="flex items-center gap-3 mb-4">
                                <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                                    style={{
                                        background: 'linear-gradient(135deg, #64748b 0%, #334155 100%)',
                                        boxShadow: '0 4px 15px rgba(100, 116, 139, 0.3)',
                                    }}
                                >
                                    <span className="material-symbols-outlined text-white text-2xl">translate</span>
                                </div>
                                <div>
                                    <span className="text-xs font-black text-[#94a3b8] uppercase tracking-[0.2em]">English Translation</span>
                                    <div className="text-[10px] text-[#f5f0e1]/40">For Study & Reference</div>
                                </div>
                                <div className="flex-1 h-px bg-gradient-to-r from-[#64748b]/40 to-transparent"></div>
                            </div>

                            {/* Content card */}
                            <div
                                className="relative rounded-2xl overflow-hidden transition-all duration-300 group-hover:shadow-2xl group-hover:shadow-[#64748b]/10"
                                style={{
                                    background: 'linear-gradient(145deg, rgba(100, 116, 139, 0.05) 0%, rgba(10, 20, 10, 0.95) 100%)',
                                    border: '1px solid rgba(100, 116, 139, 0.2)',
                                    backdropFilter: 'blur(10px)',
                                }}
                            >
                                <div className="h-1 w-full bg-gradient-to-r from-[#64748b] via-[#94a3b8] to-[#64748b]" />
                                <div className="p-6">
                                    <div className="text-lg font-serif leading-relaxed text-[#f5f0e1]/75">
                                        {node.translation || <span className="text-[#f5f0e1]/40 italic">No translation available.</span>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {node.userNotesKeywords && (
                            <div className="mt-6 p-5 bg-gradient-to-br from-[#1a4d2e]/20 to-[#0a140a] rounded-xl border border-[#10B981]/20 shadow-lg">
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#10B981]/20">
                                    <span className="material-symbols-outlined text-[#10B981] text-lg">note</span>
                                    <h3 className="text-[10px] font-bold text-[#10B981] uppercase tracking-widest">Research Notes & Keywords</h3>
                                </div>
                                <div
                                    className="text-sm text-[#f5f0e1]/70 leading-relaxed [&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-5"
                                    dangerouslySetInnerHTML={{ __html: node.userNotesKeywords }}
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <EmbeddedChatPanel
                        history={chatHistory}
                        onSendMessage={(msg) => {
                            // Construct Rich Context
                            const branchesContext = branches.length > 0
                                ? branches.map(b => `- ${b.author} (${b.workTitle}): "${b.referenceText}". Notes: ${b.userNotes}`).join('\n')
                                : "No branches/commentaries found in graph.";

                            const contextMsg = `
=== CURRENT VIEW CONTEXT ===
ROOT NODE: "${node.title}" (${node.sourceText})

HEBREW TEXT:
${node.hebrewText || 'N/A'}

TRANSLATION:
${node.translation || 'N/A'}

RELATED BRANCHES (Interpretations in Graph):
${branchesContext}
============================
`;
                            onSendMessage(msg, contextMsg);
                        }}
                        isLoading={isAiLoading}
                    />
                )}
            </div>
        </div>
    );
};

export default RootTextPanel;
