import React from 'react';
import { AIFinding, AIFindingType } from '../types';

interface AIDiscoveryPanelProps {
    findings: AIFinding[];
    onApproveFinding: (finding: AIFinding) => void;
    onDismissFinding: (findingId: string) => void;
}

const AIDiscoveryPanel: React.FC<AIDiscoveryPanelProps> = ({ findings, onApproveFinding, onDismissFinding }) => {
    const pendingFindings = findings.filter(f => f.status === 'pending');

    return (
        <aside className="w-80 bg-background-dark border-l border-border-dark flex flex-col h-full shrink-0 overflow-hidden">
            <div className="p-6 border-b border-border-dark">
                <div className="flex items-center gap-2 text-white mb-1">
                    <span className="material-symbols-outlined text-ai-primary">auto_awesome</span>
                    <h2 className="font-bold text-lg">AI Discovery</h2>
                </div>
                <p className="text-text-muted text-xs">Analysis Results & Suggestions</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {pendingFindings.length === 0 ? (
                    <div className="text-center py-10 text-text-muted">
                        <span className="material-symbols-outlined text-4xl mb-2 opacity-50">content_paste_search</span>
                        <p className="text-sm">No new findings yet.</p>
                        <p className="text-xs mt-1">Run an analysis to see results here.</p>
                    </div>
                ) : (
                    pendingFindings.map((finding) => (
                        <div key={finding.id} className="bg-surface-dark rounded-xl p-4 border border-border-dark hover:border-primary/50 transition-colors group">
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${finding.type === AIFindingType.Connection ? 'bg-blue-500/20 text-blue-400' :
                                        finding.type === AIFindingType.NewForm ? 'bg-purple-500/20 text-purple-400' :
                                            'bg-amber-500/20 text-amber-400'
                                    }`}>
                                    {finding.type === AIFindingType.Connection ? 'Connection' :
                                        finding.type === AIFindingType.NewForm ? 'New Passage' : 'Thematic Fit'}
                                </span>
                                {finding.confidence && (
                                    <span className="text-xs text-primary ml-auto font-mono">{finding.confidence}%</span>
                                )}
                            </div>

                            <h3 className="text-white text-sm font-medium mb-2 line-clamp-2">
                                {finding.justification || finding.snippet}
                            </h3>

                            {finding.confidence && (
                                <div className="w-full bg-black/20 h-1.5 rounded-full mb-3 overflow-hidden">
                                    <div
                                        className="bg-primary h-full rounded-full"
                                        style={{ width: `${finding.confidence}%` }}
                                    ></div>
                                </div>
                            )}

                            <div className="flex items-center gap-2 mt-2">
                                <button
                                    onClick={() => onDismissFinding(finding.id)}
                                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:bg-white/5 transition-colors"
                                >
                                    Dismiss
                                </button>
                                <button
                                    onClick={() => onApproveFinding(finding)}
                                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-background-dark hover:bg-primary-hover transition-colors flex items-center justify-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-[14px]">add</span>
                                    Add
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </aside>
    );
};

export default AIDiscoveryPanel;
