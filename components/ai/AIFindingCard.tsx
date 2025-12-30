
import React from 'react';
import { AIFinding, AIFindingStatus, AIFindingType } from '../../types';

interface AIFindingCardProps {
    finding: AIFinding;
    onUpdateStatus: (id: string, status: AIFindingStatus) => void;
    onSwapCandidate?: (id: string, candidateIndex: number) => void;
}

const AIFindingCard: React.FC<AIFindingCardProps> = ({ finding, onUpdateStatus, onSwapCandidate }) => {
    const [showAlternatives, setShowAlternatives] = React.useState(false);

    const confidenceColor = finding.confidence > 85 ? 'text-confidence-high' : finding.confidence > 60 ? 'text-confidence-medium' : 'text-subtext-dark';
    const confidenceText = finding.confidence > 85 ? 'High' : finding.confidence > 60 ? 'Medium' : 'Low';

    const handleDismiss = () => onUpdateStatus(finding.id, AIFindingStatus.Dismissed);
    const handleAdd = () => onUpdateStatus(finding.id, AIFindingStatus.Added);
    const handleUndo = () => onUpdateStatus(finding.id, AIFindingStatus.Pending);

    const renderSource = () => {
        if (finding.type === AIFindingType.Connection) {
            return (
                <div className="text-subtext-light dark:text-subtext-dark text-sm font-normal leading-normal flex items-center gap-2">
                    <span>{finding.source}</span>
                    <span className="material-symbols-outlined text-xs">arrow_forward</span>
                    <span>{finding.target}</span>
                </div>
            )
        }
        return <p className="text-subtext-light dark:text-subtext-dark text-sm font-normal leading-normal">{finding.source}</p>
    }

    if (finding.status === AIFindingStatus.Dismissed) {
        return (
            <div className="flex gap-4 bg-card-light dark:bg-card-dark p-3 rounded-lg border border-border-light dark:border-border-dark opacity-50">
                <div className="flex flex-1 flex-col justify-center gap-1.5">
                    <p className="text-text-light dark:text-text-dark text-sm font-medium leading-normal italic line-through">"{finding.snippet}"</p>
                    {renderSource()}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                    <button onClick={handleUndo} className="text-subtext-light dark:text-subtext-dark flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 size-8 transition-colors" title="Undo Dismiss">
                        <span className="material-symbols-outlined text-xl">undo</span>
                    </button>
                </div>
            </div>
        );
    }

    if (finding.status === AIFindingStatus.Added) {
        return (
            <div className="flex gap-4 bg-ai-primary/10 dark:bg-ai-primary/20 p-3 rounded-lg border border-ai-primary/30">
                <div className="flex flex-1 flex-col justify-center gap-1.5">
                    <p className="text-text-light dark:text-text-dark text-sm font-medium leading-normal">"{finding.snippet}"</p>
                    {renderSource()}
                </div>
                <div className="flex flex-col justify-center items-center shrink-0">
                    <div className="text-green-600 flex items-center justify-center rounded-full bg-green-200 dark:bg-green-800 dark:text-green-300 size-8" title="Added to Graph">
                        <span className="material-symbols-outlined text-xl">check</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 bg-card-light dark:bg-card-dark p-3 rounded-lg border border-border-light dark:border-border-dark">
            <div className="flex gap-4">
                <div className="flex flex-1 flex-col justify-center gap-1.5">
                    <p className="text-text-light dark:text-text-dark text-sm font-medium leading-normal">"{finding.snippet}"</p>
                    <div className="flex items-center gap-2">
                        <p className={`text-sm font-normal leading-normal ${confidenceColor}`}>{confidenceText} Confidence: {finding.confidence}%</p>
                        {(finding.alternativeCandidates && finding.alternativeCandidates.length > 0) && (
                            <button
                                onClick={() => setShowAlternatives(!showAlternatives)}
                                className="text-xs text-ai-primary hover:underline flex items-center gap-1 ml-2"
                            >
                                <span className="material-symbols-outlined text-sm">lists</span>
                                {finding.alternativeCandidates.length} Alternatives
                            </button>
                        )}
                    </div>
                    {renderSource()}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                    <button onClick={handleAdd} className="text-ai-primary flex items-center justify-center rounded-md bg-ai-primary/10 hover:bg-ai-primary/20 size-8 transition-colors" title="Add to Graph">
                        <span className="material-symbols-outlined text-xl">add</span>
                    </button>
                    <button onClick={handleDismiss} className="text-subtext-light dark:text-subtext-dark flex items-center justify-center rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 size-8 transition-colors" title="Dismiss">
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>
            </div>

            {/* Alternative Candidates View */}
            {showAlternatives && finding.alternativeCandidates && (
                <div className="mt-2 pl-4 border-l-2 border-ai-primary/20 space-y-3">
                    <p className="text-xs font-semibold text-subtext-light dark:text-subtext-dark uppercase">Alternative Candidates:</p>
                    {finding.alternativeCandidates.map((candidate, idx) => (
                        <div key={idx} className="bg-background-light dark:bg-background-dark p-2 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <div className="flex justify-between items-start mb-1">
                                <span className="font-medium text-text-light dark:text-text-dark">{candidate.source}</span>
                                {candidate.score && <span className="text-xs text-subtext-light dark:text-subtext-dark">Score: {candidate.score.toFixed(2)}</span>}
                            </div>
                            <p className="text-xs text-text-light dark:text-text-dark font-serif dir-rtl mb-1 opacity-80 line-clamp-2">"{candidate.hebrewText}"</p>
                            <p className="text-xs text-subtext-light dark:text-subtext-dark mb-2">{candidate.reasoning}</p>
                            <div className="flex justify-end">
                                <button
                                    onClick={() => {
                                        if (onSwapCandidate) {
                                            onSwapCandidate(finding.id, idx);
                                            setShowAlternatives(false);
                                        }
                                    }}
                                    className="text-xs bg-ai-primary/10 text-ai-primary px-2 py-1 rounded hover:bg-ai-primary/20 transition-colors flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-xs">swap_horiz</span>
                                    Swap
                                </button>
                            </div>
                        </div>
                    ))}
                    <button onClick={() => setShowAlternatives(false)} className="text-xs text-subtext-light dark:text-subtext-dark hover:underline w-full text-center mt-1">Close Alternatives</button>
                </div>
            )}
        </div>
    );
};

export default AIFindingCard;
