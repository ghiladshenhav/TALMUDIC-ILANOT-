
import React from 'react';
import { AIFinding, AIFindingStatus, AIFindingType } from '../../types';

interface AIFindingCardProps {
    finding: AIFinding;
    onUpdateStatus: (id: string, status: AIFindingStatus) => void;
}

const AIFindingCard: React.FC<AIFindingCardProps> = ({ finding, onUpdateStatus }) => {
    
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
        <div className="flex gap-4 bg-card-light dark:bg-card-dark p-3 rounded-lg border border-border-light dark:border-border-dark">
            <div className="flex flex-1 flex-col justify-center gap-1.5">
                <p className="text-text-light dark:text-text-dark text-sm font-medium leading-normal">"{finding.snippet}"</p>
                <p className={`text-sm font-normal leading-normal ${confidenceColor}`}>{confidenceText} Confidence: {finding.confidence}%</p>
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
    );
};

export default AIFindingCard;
