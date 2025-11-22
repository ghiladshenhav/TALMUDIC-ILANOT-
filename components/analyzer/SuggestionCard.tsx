
import React from 'react';
import { AIFinding, AIFindingStatus } from '../../types';

interface SuggestionCardProps {
    suggestion: AIFinding;
    onAction: (id: string, newStatus: AIFindingStatus) => void;
    isProcessed: boolean;
    isExisting: boolean;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ suggestion, onAction, isProcessed, isExisting }) => {
    const isPending = suggestion.status === AIFindingStatus.Pending;
    const isDismissed = suggestion.status === AIFindingStatus.Dismissed;
    const isAdded = suggestion.status === AIFindingStatus.Added || suggestion.status === AIFindingStatus.AddedAsNewRoot || suggestion.status === AIFindingStatus.AddedToExistingRoot;

    let containerClasses = 'p-6 rounded-xl border transition-all shadow-sm ';
    if (isDismissed) {
        containerClasses += 'bg-gray-100 border-gray-200 opacity-60';
    } else if (isAdded && isProcessed) {
        containerClasses += 'bg-green-50 border-green-200';
    } else if (isAdded && !isProcessed) {
        containerClasses += 'bg-blue-50 border-blue-200';
    } else {
        containerClasses += 'bg-white border-gray-200 hover:shadow-md';
    }


    return (
        <div className={containerClasses}>
            <div className="space-y-4">
                {suggestion.contextBefore && (
                    <p className="text-sm text-gray-500 italic">{suggestion.contextBefore}</p>
                )}
                <blockquote className={`border-l-4 border-primary/50 pl-4 py-2 ${isDismissed ? 'line-through opacity-60' : ''}`}>
                    <p className="italic text-gray-900 font-serif text-lg">"{suggestion.snippet}"</p>
                </blockquote>
                {suggestion.contextAfter && (
                    <p className="text-sm text-gray-500 italic">{suggestion.contextAfter}</p>
                )}

                {suggestion.originalText && (
                    <div className={`mt-4 p-4 bg-gray-50 rounded-lg border border-gray-100 text-right ${isDismissed ? 'opacity-50' : ''}`}>
                        <p className="text-xl font-serif text-gray-900 leading-relaxed" dir="rtl">{suggestion.originalText}</p>
                    </div>
                )}

                {suggestion.justification && (
                    <div className={isDismissed ? 'opacity-50' : ''}>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Analysis</p>
                        <p className="text-gray-700 mt-1 text-sm leading-relaxed">{suggestion.justification}</p>
                    </div>
                )}
            </div>

            <div className={`flex flex-col sm:flex-row justify-between sm:items-center gap-4 pt-4 mt-6 border-t ${isDismissed ? 'border-gray-200' : 'border-gray-100'}`}>
                <div className={isDismissed ? 'opacity-50' : ''}>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Reference</p>
                    <p className="text-primary font-bold text-lg">{suggestion.source}</p>
                    <p className="text-gray-600 text-sm">{suggestion.title}</p>
                </div>

                <div className="flex items-center gap-3 self-end">
                    {isProcessed ? (
                        <div className="flex items-center gap-2 text-green-600 text-sm font-bold bg-green-100 px-3 py-1 rounded-full">
                            <span className="material-symbols-outlined !text-lg">check_circle</span>
                            <span>Added</span>
                        </div>
                    ) : isPending ? (
                        <>
                            <button
                                onClick={() => onAction(suggestion.id, AIFindingStatus.Dismissed)}
                                className="h-9 px-3 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition-colors border border-transparent hover:border-red-100">
                                Deny
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => onAction(suggestion.id, AIFindingStatus.AddedToExistingRoot)}
                                    disabled={!isExisting}
                                    title={isExisting ? "Page found in library - Click to add" : "Page not found in library - Cannot add to existing"}
                                    className={`h-9 px-3 rounded-md text-sm font-bold border transition-all flex items-center gap-2 ${isExisting
                                            ? 'text-primary bg-primary/10 hover:bg-primary/20 border-primary/20'
                                            : 'text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed opacity-50'
                                        }`}>
                                    <span className="material-symbols-outlined !text-lg">library_add</span>
                                    Add to Existing
                                </button>
                                <button
                                    onClick={() => onAction(suggestion.id, AIFindingStatus.AddedAsNewRoot)}
                                    className="h-9 px-3 rounded-md text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-all flex items-center gap-2">
                                    <span className="material-symbols-outlined !text-lg">add_circle</span>
                                    Add as New Page
                                </button>
                            </div>
                        </>
                    ) : (
                        <button
                            onClick={() => onAction(suggestion.id, AIFindingStatus.Pending)}
                            className="h-9 px-4 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-2">
                            <span className="material-symbols-outlined !text-lg">undo</span>
                            Undo
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SuggestionCard;
