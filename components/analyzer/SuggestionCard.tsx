
import React from 'react';
import { AIFinding, AIFindingStatus } from '../../types';

interface SuggestionCardProps {
    suggestion: AIFinding;
    onAction: (id: string, newStatus: AIFindingStatus) => void;
    onExpandContext?: (id: string) => void;
    onEdit?: (finding: AIFinding) => void;
    onJumpToPage?: (page: number) => void;
    onHighlight?: () => void;
    onStartResegmentSelection?: () => void;
    onSwapCandidate?: (id: string, candidateIndex: number) => void;
    onFeedback?: (finding: AIFinding, isPositive: boolean) => void;
    onMarkGroundTruth?: (finding: AIFinding, action: 'APPROVE' | 'REJECT', explanation?: string) => void;
    onSuggestAlternativeSource?: (findingId: string, newSource: string, reason: string) => void;
    onFixOCR?: (findingId: string, correctedText: string) => void;
    onEditJustification?: (findingId: string, newJustification: string) => void;
    onFixSegmentation?: (findingId: string, newSnippet: string, contextBefore?: string, contextAfter?: string) => void;
    onStructuredCorrect?: (finding: AIFinding, mode: 'correct' | 'reject') => void;
    isHighlighted?: boolean;
    isProcessed: boolean;
    isExisting: boolean;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ suggestion, onAction, onExpandContext, onEdit, onJumpToPage, onHighlight, onStartResegmentSelection, onSwapCandidate, onFeedback, onMarkGroundTruth, onSuggestAlternativeSource, onFixOCR, onEditJustification, onFixSegmentation, onStructuredCorrect, isHighlighted, isProcessed, isExisting }) => {
    const [showAlternatives, setShowAlternatives] = React.useState(false);
    const [feedbackGiven, setFeedbackGiven] = React.useState<'positive' | 'negative' | null>(null);
    const [showGTPanel, setShowGTPanel] = React.useState(false);
    const [gtExplanation, setGtExplanation] = React.useState('');

    // New inline editor states
    const [showAlternativeSourceEditor, setShowAlternativeSourceEditor] = React.useState(false);
    const [alternativeSource, setAlternativeSource] = React.useState('');
    const [alternativeReason, setAlternativeReason] = React.useState('');

    const [showOCREditor, setShowOCREditor] = React.useState(false);
    const [correctedOCRText, setCorrectedOCRText] = React.useState(suggestion.snippet || '');

    const [showJustificationEditor, setShowJustificationEditor] = React.useState(false);
    const [editedJustification, setEditedJustification] = React.useState(suggestion.justification || '');

    // Segmentation editor states
    const [showSegmentationEditor, setShowSegmentationEditor] = React.useState(false);
    const [segmentedSnippet, setSegmentedSnippet] = React.useState(suggestion.snippet || '');
    const [segmentContextBefore, setSegmentContextBefore] = React.useState(suggestion.contextBefore || '');
    const [segmentContextAfter, setSegmentContextAfter] = React.useState(suggestion.contextAfter || '');

    const isPending = suggestion.status === AIFindingStatus.Pending;
    const isDismissed = suggestion.status === AIFindingStatus.Dismissed;
    const isAdded = suggestion.status === AIFindingStatus.Added || suggestion.status === AIFindingStatus.AddedAsNewRoot || suggestion.status === AIFindingStatus.AddedToExistingRoot;

    let containerClasses = 'p-6 rounded-xl border transition-all shadow-sm ';
    if (suggestion.isHallucination) {
        containerClasses += 'bg-red-50 border-red-400 ring-2 ring-red-300';
    } else if (isDismissed) {
        containerClasses += 'bg-gray-100 border-gray-200 opacity-60';
    } else if (isAdded && isProcessed) {
        containerClasses += 'bg-green-50 border-green-200';
    } else if (isAdded && !isProcessed) {
        containerClasses += 'bg-blue-50 border-blue-200';
    } else {
        containerClasses += 'bg-white border-gray-200 hover:shadow-md';
    }

    // Add clickable style if onHighlight provided
    if (onHighlight) {
        containerClasses += ' cursor-pointer hover:ring-2 hover:ring-primary/50';
    }

    // Add highlight style when this card's snippet is highlighted in source
    if (isHighlighted) {
        containerClasses += ' ring-2 ring-yellow-400 bg-yellow-50';
    }

    return (
        <div className={containerClasses} onClick={() => onHighlight && onHighlight()}>
            <div className="space-y-4">
                {/* Hallucination Warning Banner */}
                {suggestion.isHallucination && (
                    <div className="p-3 bg-red-100 rounded-lg border border-red-300 flex items-start gap-2">
                        <span className="material-symbols-outlined text-red-600 !text-xl">warning</span>
                        <div>
                            <p className="text-red-800 font-bold text-sm">Potential Hallucination Detected</p>
                            <p className="text-red-700 text-xs mt-1">{suggestion.hallucinationWarning}</p>
                        </div>
                    </div>
                )}

                {/* Source Correction Banner - when Sefaria search found the correct source */}
                {suggestion.correctedBySefariaSearch && (
                    <div className="p-3 bg-blue-100 rounded-lg border border-blue-300 flex items-start gap-2">
                        <span className="material-symbols-outlined text-blue-600 !text-xl">auto_fix_high</span>
                        <div>
                            <p className="text-blue-800 font-bold text-sm">Source Auto-Corrected</p>
                            <p className="text-blue-700 text-xs mt-1">{suggestion.correctionNote}</p>
                        </div>
                    </div>
                )}

                {/* Needs Verification Banner - AI detected reference but couldn't find exact page */}
                {suggestion.needsVerification && (
                    <div className="p-3 bg-amber-100 rounded-lg border border-amber-300 flex items-start gap-2">
                        <span className="material-symbols-outlined text-amber-600 !text-xl">search</span>
                        <div>
                            <p className="text-amber-800 font-bold text-sm">🔍 Needs Manual Verification</p>
                            <p className="text-amber-700 text-xs mt-1">
                                AI detected a likely reference but couldn't determine the exact page.
                                Please use "Suggest Alternative Source" to add the correct citation.
                            </p>
                        </div>
                    </div>
                )}

                {suggestion.contextBefore && (
                    <p className="text-sm text-gray-500 italic">{suggestion.contextBefore}</p>
                )}
                <blockquote className={`border-l-4 border-primary/50 pl-4 py-2 ${isDismissed ? 'line-through opacity-60' : ''}`}>
                    <p className="italic text-gray-900 font-serif text-lg">"{suggestion.snippet}"</p>
                    {/* Fix OCR Button */}
                    {onFixOCR && !showOCREditor && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowOCREditor(true); setCorrectedOCRText(suggestion.snippet); }}
                            className="mt-2 text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1"
                        >
                            <span className="material-symbols-outlined text-[14px]">spellcheck</span>
                            Fix OCR
                        </button>
                    )}
                </blockquote>

                {/* OCR Editor Expanded */}
                {showOCREditor && (
                    <div className="mt-2 p-3 bg-orange-50 rounded-lg border border-orange-200" onClick={(e) => e.stopPropagation()}>
                        <p className="text-xs font-bold text-orange-700 mb-2">Correct OCR Text</p>
                        <textarea
                            value={correctedOCRText}
                            onChange={(e) => setCorrectedOCRText(e.target.value)}
                            className="w-full px-3 py-2 border border-orange-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-300 outline-none resize-none font-serif text-right"
                            dir="rtl"
                            rows={2}
                        />
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={() => { onFixOCR!(suggestion.id, correctedOCRText); setShowOCREditor(false); }}
                                className="px-3 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600"
                            >
                                Reanalyze with Corrected Text
                            </button>
                            <button
                                onClick={() => setShowOCREditor(false)}
                                className="px-3 py-1.5 text-gray-600 text-xs font-medium hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Fix Segmentation Button (teal) */}
                {onFixSegmentation && !showSegmentationEditor && !showOCREditor && (
                    <div className="mt-2 flex items-center gap-2">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowSegmentationEditor(true);
                                // Combine context + snippet for editing
                                const fullText = [suggestion.contextBefore, suggestion.snippet, suggestion.contextAfter].filter(Boolean).join(' ');
                                setSegmentedSnippet(suggestion.snippet || '');
                                setSegmentContextBefore(suggestion.contextBefore || '');
                                setSegmentContextAfter(suggestion.contextAfter || '');
                            }}
                            className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-1"
                            title="Edit boundaries manually"
                        >
                            <span className="material-symbols-outlined text-[14px]">horizontal_rule</span>
                            Fix Segmentation
                        </button>
                        {onStartResegmentSelection && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onStartResegmentSelection();
                                }}
                                className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 px-2 py-1 border border-primary/30 rounded hover:bg-primary/5"
                                title="Select new boundaries from source text"
                            >
                                <span className="material-symbols-outlined text-[14px]">touch_app</span>
                                Select from Source
                            </button>
                        )}
                    </div>
                )}

                {/* Segmentation Editor Expanded */}
                {showSegmentationEditor && (
                    <div className="mt-2 p-3 bg-teal-50 rounded-lg border border-teal-200" onClick={(e) => e.stopPropagation()}>
                        <p className="text-xs font-bold text-teal-700 mb-2">Adjust Selection Boundaries</p>
                        <p className="text-xs text-teal-600 mb-3">Move text between sections to expand/contract the reference selection.</p>

                        {/* Context Before */}
                        <label className="block mb-2">
                            <span className="text-xs text-teal-600">Context Before (not part of reference):</span>
                            <textarea
                                value={segmentContextBefore}
                                onChange={(e) => setSegmentContextBefore(e.target.value)}
                                className="w-full px-3 py-2 border border-teal-200 rounded-lg text-xs bg-gray-50 focus:ring-2 focus:ring-teal-300 outline-none resize-none text-gray-500 italic"
                                dir="rtl"
                                rows={1}
                                placeholder="Text before the reference..."
                            />
                        </label>

                        {/* Main Snippet (the actual reference) */}
                        <label className="block mb-2">
                            <span className="text-xs text-teal-700 font-bold">📖 Selected Reference:</span>
                            <textarea
                                value={segmentedSnippet}
                                onChange={(e) => setSegmentedSnippet(e.target.value)}
                                className="w-full px-3 py-2 border-2 border-teal-400 rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-400 outline-none resize-none font-serif text-right"
                                dir="rtl"
                                rows={3}
                            />
                        </label>

                        {/* Context After */}
                        <label className="block mb-3">
                            <span className="text-xs text-teal-600">Context After (not part of reference):</span>
                            <textarea
                                value={segmentContextAfter}
                                onChange={(e) => setSegmentContextAfter(e.target.value)}
                                className="w-full px-3 py-2 border border-teal-200 rounded-lg text-xs bg-gray-50 focus:ring-2 focus:ring-teal-300 outline-none resize-none text-gray-500 italic"
                                dir="rtl"
                                rows={1}
                                placeholder="Text after the reference..."
                            />
                        </label>

                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    onFixSegmentation!(suggestion.id, segmentedSnippet, segmentContextBefore || undefined, segmentContextAfter || undefined);
                                    setShowSegmentationEditor(false);
                                }}
                                className="px-3 py-1.5 bg-teal-500 text-white text-xs font-bold rounded-lg hover:bg-teal-600"
                            >
                                Save Segmentation
                            </button>
                            <button
                                onClick={() => setShowSegmentationEditor(false)}
                                className="px-3 py-1.5 text-gray-600 text-xs font-medium hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {suggestion.contextAfter && !showSegmentationEditor && (
                    <p className="text-sm text-gray-500 italic">{suggestion.contextAfter}</p>
                )}

                {/* Expanded Context Explanation */}
                {suggestion.expandedContextExplanation && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="material-symbols-outlined text-blue-600 text-sm">info</span>
                            <p className="text-xs font-bold text-blue-600 uppercase tracking-wide">Context Explanation</p>
                        </div>
                        <p className="text-gray-800 text-sm leading-relaxed">{suggestion.expandedContextExplanation}</p>
                    </div>
                )}

                {suggestion.originalText && (
                    <div className={`mt-4 p-4 bg-gray-50 rounded-lg border border-gray-100 text-right ${isDismissed ? 'opacity-50' : ''}`}>
                        <p className="text-xl font-serif text-gray-900 leading-relaxed" dir="rtl">{suggestion.originalText}</p>
                    </div>
                )}

                {suggestion.justification && (
                    <div className={isDismissed ? 'opacity-50' : ''}>
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Analysis</p>
                            {onEditJustification && !showJustificationEditor && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowJustificationEditor(true); setEditedJustification(suggestion.justification || ''); }}
                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-[14px]">edit_note</span>
                                    Edit
                                </button>
                            )}
                        </div>
                        {showJustificationEditor ? (
                            <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200" onClick={(e) => e.stopPropagation()}>
                                <textarea
                                    value={editedJustification}
                                    onChange={(e) => setEditedJustification(e.target.value)}
                                    className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-300 outline-none resize-none"
                                    rows={3}
                                />
                                <div className="flex gap-2 mt-2">
                                    <button
                                        onClick={() => { onEditJustification(suggestion.id, editedJustification); setShowJustificationEditor(false); }}
                                        className="px-3 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-lg hover:bg-blue-600"
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => setShowJustificationEditor(false)}
                                        className="px-3 py-1.5 text-gray-600 text-xs font-medium hover:bg-gray-100 rounded-lg"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-700 mt-1 text-sm leading-relaxed">{suggestion.justification}</p>
                        )}
                    </div>
                )}

                {/* Matching Phrase - shows the exact phrase from source that proves the connection */}
                {suggestion.matchingPhrase && (
                    <div className={`mt-3 p-2 bg-green-50 rounded border border-green-200 ${isDismissed ? 'opacity-50' : ''}`}>
                        <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-1">Verified Match</p>
                        <p className="text-green-900 font-serif text-sm" dir="rtl">"{suggestion.matchingPhrase}"</p>
                    </div>
                )}

                {/* Keywords Tags */}
                {suggestion.keywords && suggestion.keywords.length > 0 && (
                    <div className={`mt-3 ${isDismissed ? 'opacity-50' : ''}`}>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Keywords</p>
                        <div className="flex flex-wrap gap-1.5">
                            {suggestion.keywords.map((keyword, idx) => (
                                <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200"
                                >
                                    {keyword}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className={`flex flex-col sm:flex-row justify-between sm:items-center gap-4 pt-4 mt-6 border-t ${isDismissed ? 'border-gray-200' : 'border-gray-100'}`}>
                <div className={isDismissed ? 'opacity-50' : ''}>
                    <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Reference</p>
                        {suggestion.isImplicit && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-600 border border-purple-200">
                                Implicit
                            </span>
                        )}
                        {suggestion.isGroundTruth && (
                            <span className="px-2 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-widest bg-amber-500 text-white border border-amber-600 shadow-sm flex items-center gap-1 animate-in fade-in zoom-in duration-300">
                                <span className="material-symbols-outlined text-[14px]">star</span>
                                Ground Truth
                            </span>
                        )}
                        {(suggestion.alternativeCandidates && suggestion.alternativeCandidates.length > 0) && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setShowAlternatives(!showAlternatives); }}
                                className="text-xs text-primary hover:underline flex items-center gap-1 ml-2 bg-primary/5 px-2 py-0.5 rounded-full border border-primary/20"
                            >
                                <span className="material-symbols-outlined text-[14px]">call_split</span>
                                {suggestion.alternativeCandidates.length} Alternatives
                            </button>
                        )}
                    </div>
                    <p className="text-primary font-bold text-lg">{suggestion.source}</p>
                    <div className="flex items-center gap-2">
                        <p className="text-gray-600 text-sm">{suggestion.title}</p>
                        {suggestion.pageNumber && onJumpToPage && (
                            <button
                                onClick={() => onJumpToPage(suggestion.pageNumber!)}
                                className="ml-2 px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors flex items-center gap-1"
                                title="Jump to page in PDF"
                            >
                                <span className="material-symbols-outlined text-sm">find_in_page</span>
                                Page {suggestion.pageNumber}
                            </button>
                        )}
                    </div>

                    {/* Suggest Alternative Source Button & Editor */}
                    {onSuggestAlternativeSource && !showAlternativeSourceEditor && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowAlternativeSourceEditor(true); setAlternativeSource(suggestion.source); }}
                            className="mt-2 text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
                        >
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                            Suggest Alternative Source
                        </button>
                    )}
                    {showAlternativeSourceEditor && (
                        <div className="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-200" onClick={(e) => e.stopPropagation()}>
                            <p className="text-xs font-bold text-purple-700 mb-2">Correct Source</p>
                            <input
                                type="text"
                                value={alternativeSource}
                                onChange={(e) => setAlternativeSource(e.target.value)}
                                placeholder="e.g., Bavli Bava Metzia 8a"
                                className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-300 outline-none mb-2"
                            />
                            <input
                                type="text"
                                value={alternativeReason}
                                onChange={(e) => setAlternativeReason(e.target.value)}
                                placeholder="Reason for correction"
                                className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-300 outline-none"
                            />
                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={() => { onSuggestAlternativeSource!(suggestion.id, alternativeSource, alternativeReason); setShowAlternativeSourceEditor(false); }}
                                    className="px-3 py-1.5 bg-purple-500 text-white text-xs font-bold rounded-lg hover:bg-purple-600"
                                >
                                    Save Correction
                                </button>
                                <button
                                    onClick={() => setShowAlternativeSourceEditor(false)}
                                    className="px-3 py-1.5 text-gray-600 text-xs font-medium hover:bg-gray-100 rounded-lg"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 mt-2 w-full">
                    {/* Add Context Button */}
                    {!isProcessed && !isDismissed && !suggestion.expandedContextExplanation && onExpandContext && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onExpandContext(suggestion.id); }}
                            disabled={suggestion.isExpandingContext}
                            className="h-8 px-2 rounded text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100 flex items-center gap-1 disabled:opacity-50 disabled:cursor-wait"
                        >
                            {suggestion.isExpandingContext ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin !text-base">progress_activity</span>
                                    Context...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined !text-base">manage_search</span>
                                    Add Context
                                </>
                            )}
                        </button>
                    )}

                    {isProcessed ? (
                        <>
                            <div className="flex items-center gap-1.5 text-green-600 text-xs font-bold bg-green-50 border border-green-100 px-2 py-1 rounded-md">
                                <span className="material-symbols-outlined !text-base">check_circle</span>
                                <span>Added</span>
                            </div>
                            {/* Undo button - reset to pending */}
                            <button
                                onClick={(e) => { e.stopPropagation(); onAction(suggestion.id, AIFindingStatus.Pending); }}
                                className="h-8 px-3 rounded bg-orange-50 border border-orange-200 text-orange-600 hover:bg-orange-100 hover:border-orange-300 transition-colors flex items-center justify-center font-bold text-xs shadow-sm"
                                title="Reset to pending - won't remove from graph"
                            >
                                <span className="material-symbols-outlined !text-sm mr-1.5">undo</span>
                                UNDO
                            </button>
                            {/* Dismiss button */}
                            <button
                                onClick={(e) => { e.stopPropagation(); onAction(suggestion.id, AIFindingStatus.Dismissed); }}
                                className="h-8 px-3 rounded bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 hover:border-red-300 transition-colors flex items-center justify-center font-bold text-xs shadow-sm"
                                title="Dismiss as wrongly identified"
                            >
                                <span className="material-symbols-outlined !text-sm mr-1.5">close</span>
                                DISMISS
                            </button>
                            {onEdit && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEdit(suggestion);
                                    }}
                                    className="h-8 px-3 rounded bg-white border border-gray-200 text-gray-500 hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center font-bold text-xs shadow-sm"
                                    title="Edit Reference"
                                >
                                    <span className="material-symbols-outlined !text-sm mr-1.5">edit</span>
                                    EDIT
                                </button>
                            )}
                            {/* GT button for processed findings */}
                            {onMarkGroundTruth && !suggestion.isGroundTruth && !showGTPanel && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowGTPanel(true);
                                    }}
                                    className="h-8 px-3 rounded text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-all flex items-center gap-1.5"
                                    title="Mark as Ground Truth - teaches AI this is correct"
                                >
                                    <span className="material-symbols-outlined !text-base">workspace_premium</span>
                                    GT
                                </button>
                            )}
                        </>
                    ) : isPending ? (
                        <>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onAction(suggestion.id, AIFindingStatus.Dismissed); }}
                                    className="h-8 px-3 rounded text-xs font-medium text-red-600 hover:bg-red-50 transition-colors border border-transparent hover:border-red-100 flex items-center">
                                    Deny
                                </button>
                                {onStructuredCorrect && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onStructuredCorrect(suggestion, 'reject'); }}
                                        className="h-8 px-2 rounded text-xs font-medium text-red-500 hover:bg-red-50 transition-colors flex items-center gap-1 border border-red-200"
                                        title="Explain why this is wrong - trains the AI"
                                    >
                                        <span className="material-symbols-outlined !text-sm">help</span>
                                        Why?
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onAction(suggestion.id, AIFindingStatus.AddedToExistingRoot); }}
                                    disabled={!isExisting}
                                    title={isExisting ? "Page found in library" : "Page not found in library"}
                                    className={`h-8 px-3 rounded text-xs font-bold border transition-all flex items-center gap-1.5 ${isExisting
                                        ? 'text-primary bg-primary/5 hover:bg-primary/10 border-primary/20'
                                        : 'text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed opacity-50'
                                        }`}>
                                    <span className="material-symbols-outlined !text-base">library_add</span>
                                    Add Existing
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onAction(suggestion.id, AIFindingStatus.AddedAsNewRoot); }}
                                    className="h-8 px-3 rounded text-xs font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-all flex items-center gap-1.5">
                                    <span className="material-symbols-outlined !text-base">add_circle</span>
                                    Add New
                                </button>
                                {onMarkGroundTruth && !suggestion.isGroundTruth && !showGTPanel && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowGTPanel(true);
                                        }}
                                        className="h-8 px-3 rounded text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-all flex items-center gap-1.5"
                                        title="Mark as Ground Truth - teaches AI this is correct"
                                    >
                                        <span className="material-symbols-outlined !text-base">workspace_premium</span>
                                        GT
                                    </button>
                                )}
                            </div>

                            {onEdit && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEdit(suggestion);
                                    }}
                                    className="h-8 w-8 rounded bg-gray-50 border border-gray-200 text-gray-400 hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center"
                                    title="Edit Reference"
                                >
                                    <span className="material-symbols-outlined !text-lg">edit</span>
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); onAction(suggestion.id, AIFindingStatus.Pending); }}
                                className="h-8 px-3 rounded text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-1.5 border border-gray-200 bg-white">
                                <span className="material-symbols-outlined !text-base">undo</span>
                                Undo
                            </button>
                            {/* GT button for Added findings loaded from library (not yet in processedSuggestionIds) */}
                            {onMarkGroundTruth && !suggestion.isGroundTruth && !showGTPanel && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowGTPanel(true);
                                    }}
                                    className="h-8 px-3 rounded text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-all flex items-center gap-1.5"
                                    title="Mark as Ground Truth - teaches AI this is correct"
                                >
                                    <span className="material-symbols-outlined !text-base">workspace_premium</span>
                                    GT
                                </button>
                            )}
                        </>
                    )}
                </div>

                <div className="flex gap-2">
                    {onAction && (
                        <div className="flex gap-2">
                            {isPending && (
                                <>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onAction(suggestion.id, AIFindingStatus.Dismissed); }}
                                        className="p-2 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                        title="Dismiss"
                                    >
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onAction(suggestion.id, AIFindingStatus.Added); }}
                                        className="p-2 rounded-full hover:bg-green-50 text-gray-400 hover:text-green-500 transition-colors"
                                        title="Add to Graph"
                                    >
                                        <span className="material-symbols-outlined">add</span>
                                    </button>
                                </>
                            )}
                            {(isDismissed || isAdded) && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onAction(suggestion.id, AIFindingStatus.Pending); }}
                                    className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                    title="Undo"
                                >
                                    <span className="material-symbols-outlined">undo</span>
                                </button>
                            )}
                        </div>
                    )}
                    {/* Edit Button */}
                    {onEdit && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(suggestion); }}
                            className="p-2 rounded-full hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors"
                            title="Edit Finding"
                        >
                            <span className="material-symbols-outlined">edit</span>
                        </button>
                    )}
                    {/* Analyze Context Button */}
                    {onExpandContext && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onExpandContext(suggestion.id); }}
                            className="p-2 rounded-full hover:bg-purple-50 text-gray-400 hover:text-purple-500 transition-colors"
                            title="Explain Context"
                        >
                            <span className="material-symbols-outlined">psychology</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Existing Branches / Cross Reference Indicator - Validated in Analysis Flow */}
            {/* Talmudic Source Comparison */}
            {(suggestion.hebrewText || suggestion.translation) && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Source Comparison</p>
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-100 space-y-2">
                        {suggestion.hebrewText && (
                            <p className="text-right font-serif text-lg leading-relaxed text-gray-800" dir="rtl">{suggestion.hebrewText}</p>
                        )}
                        {suggestion.translation && (
                            <p className="text-sm text-gray-600 leading-relaxed">{suggestion.translation}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Alternative Candidates View */}
            {showAlternatives && suggestion.alternativeCandidates && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Alternative Source Candidates</p>
                        <button onClick={() => setShowAlternatives(false)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
                    </div>
                    <div className="space-y-3">
                        {suggestion.alternativeCandidates.map((candidate, idx) => (
                            <div key={idx} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-sm transition-all">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <span className="font-bold text-primary text-sm block">{candidate.source}</span>
                                        {candidate.score && <span className="text-xs text-gray-500">Match Score: {candidate.score.toFixed(2)}</span>}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onSwapCandidate) {
                                                onSwapCandidate(suggestion.id, idx);
                                                setShowAlternatives(false);
                                            }
                                        }}
                                        className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors font-medium flex items-center gap-1"
                                    >
                                        <span className="material-symbols-outlined text-xs">swap_horiz</span>
                                        Swap
                                    </button>
                                </div>
                                <p className="text-sm text-gray-800 dark:text-gray-200 font-serif dir-rtl mb-2 leading-relaxed bg-white dark:bg-gray-900 p-2 rounded border border-gray-100 dark:border-gray-700">"{candidate.hebrewText}"</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 italic bg-gray-100/50 dark:bg-gray-800/50 p-2 rounded">{candidate.reasoning}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Feedback Buttons - Learning Mode */}
            {onFeedback && !feedbackGiven && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-gray-500">Was this reference helpful?</p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onFeedback(suggestion, true);
                                    setFeedbackGiven('positive');
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium text-green-600 bg-green-50 hover:bg-green-100 border border-green-200 transition-all"
                                title="Good match - helps AI learn"
                            >
                                <span>👍</span>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onFeedback(suggestion, false);
                                    setFeedbackGiven('negative');
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-all"
                                title="Poor match - helps AI avoid"
                            >
                                <span>👎</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Feedback Confirmation */}
            {feedbackGiven && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className={`flex items-center gap-2 text-sm font-medium ${feedbackGiven === 'positive' ? 'text-green-600' : 'text-red-600'}`}>
                        <span>{feedbackGiven === 'positive' ? '👍' : '👎'}</span>
                        <span>Feedback recorded - AI is learning!</span>
                    </div>
                </div>
            )}

            {/* Ground Truth Feedback Panel */}
            {showGTPanel && onMarkGroundTruth && (
                <div className="mt-4 pt-4 border-t border-amber-200 bg-gradient-to-r from-amber-50/50 to-transparent rounded-b-xl -mx-6 -mb-6 px-6 pb-6" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-amber-600">workspace_premium</span>
                        <h4 className="font-bold text-amber-800 text-sm">Mark as Ground Truth</h4>
                        <span className="text-xs text-amber-600">This helps teach the AI</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 mb-3">
                        <button
                            onClick={() => {
                                onMarkGroundTruth(suggestion, 'APPROVE', gtExplanation || undefined);
                                setShowGTPanel(false);
                                setGtExplanation('');
                            }}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold text-sm transition-all shadow-sm"
                        >
                            <span className="material-symbols-outlined !text-lg">check_circle</span>
                            Approve as Correct
                        </button>
                        <button
                            onClick={() => {
                                onMarkGroundTruth(suggestion, 'REJECT', gtExplanation || undefined);
                                setShowGTPanel(false);
                                setGtExplanation('');
                            }}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold text-sm transition-all shadow-sm"
                        >
                            <span className="material-symbols-outlined !text-lg">cancel</span>
                            Reject as Wrong
                        </button>
                    </div>

                    {/* Optional Explanation */}
                    <div className="mb-3 relative">
                        <label className="block text-xs font-medium text-amber-700 mb-1 flex justify-between">
                            <span>Explanation (optional) - Why is this correct/incorrect?</span>
                            <span className={`${gtExplanation.length > 500 ? 'text-red-500' : 'text-amber-500'}`}>
                                {gtExplanation.length}/500
                            </span>
                        </label>
                        <textarea
                            value={gtExplanation}
                            onChange={(e) => setGtExplanation(e.target.value.substring(0, 500))}
                            placeholder="e.g., This reference is a clear allusion to the Talmudic concept of..."
                            className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white/80 placeholder:text-amber-300 focus:ring-2 focus:ring-amber-300 focus:border-amber-300 focus:bg-white outline-none resize-none transition-all"
                            rows={3}
                        />
                    </div>

                    {/* Cancel */}
                    <button
                        onClick={() => {
                            setShowGTPanel(false);
                            setGtExplanation('');
                        }}
                        className="text-xs text-amber-600 hover:text-amber-800 hover:underline"
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>

    );
};

export default SuggestionCard;
