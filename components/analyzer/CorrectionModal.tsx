import React, { useState } from 'react';

/**
 * Error types for structured correction feedback
 */
export enum CorrectionErrorType {
    WRONG_SOURCE = 'wrong_source',     // Right idea, wrong tractate/book
    WRONG_PAGE = 'wrong_page',         // Right tractate, wrong page/verse
    HALLUCINATION = 'hallucination',   // Not a real reference at all
    STRUCTURAL = 'structural',         // Discourse marker, not thematic
    NOT_RELEVANT = 'not_relevant',     // Real reference but not what author intended
    OTHER = 'other'
}

export const ERROR_TYPE_LABELS: Record<CorrectionErrorType, { label: string; description: string }> = {
    [CorrectionErrorType.WRONG_SOURCE]: {
        label: 'Wrong Source',
        description: 'Right idea, wrong tractate or book'
    },
    [CorrectionErrorType.WRONG_PAGE]: {
        label: 'Wrong Page',
        description: 'Right tractate, wrong page or verse'
    },
    [CorrectionErrorType.HALLUCINATION]: {
        label: 'Hallucination',
        description: 'Not a real Talmudic reference'
    },
    [CorrectionErrorType.STRUCTURAL]: {
        label: 'Structural Phrase',
        description: 'Just a discourse marker, not thematic'
    },
    [CorrectionErrorType.NOT_RELEVANT]: {
        label: 'Not Relevant',
        description: 'Real reference but not author\'s intent'
    },
    [CorrectionErrorType.OTHER]: {
        label: 'Other',
        description: 'Different reason'
    },
};

interface CorrectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (correction: CorrectionData) => void;
    originalSnippet: string;
    originalSource: string;
    mode: 'correct' | 'reject';
}

export interface CorrectionData {
    errorType: CorrectionErrorType;
    originalSource: string;
    correctedSource: string;
    explanation: string;
    snippet: string;
}

const CorrectionModal: React.FC<CorrectionModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    originalSnippet,
    originalSource,
    mode
}) => {
    const [errorType, setErrorType] = useState<CorrectionErrorType>(CorrectionErrorType.WRONG_SOURCE);
    const [correctedSource, setCorrectedSource] = useState('');
    const [explanation, setExplanation] = useState('');

    if (!isOpen) return null;

    const handleSubmit = () => {
        onSubmit({
            errorType,
            originalSource,
            correctedSource: mode === 'correct' ? correctedSource : '',
            explanation,
            snippet: originalSnippet
        });
        // Reset form
        setErrorType(CorrectionErrorType.WRONG_SOURCE);
        setCorrectedSource('');
        setExplanation('');
        onClose();
    };

    const showCorrectedSource = mode === 'correct' &&
        (errorType === CorrectionErrorType.WRONG_SOURCE || errorType === CorrectionErrorType.WRONG_PAGE);

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-card-dark border border-border-dark rounded-xl shadow-2xl w-full max-w-lg">
                {/* Header */}
                <div className="p-4 border-b border-border-dark">
                    <div className="flex items-center gap-3">
                        <span className={`text-2xl ${mode === 'correct' ? 'text-yellow-400' : 'text-red-400'}`}>
                            {mode === 'correct' ? '🟡' : '🔴'}
                        </span>
                        <div>
                            <h2 className="text-lg font-bold text-white">
                                {mode === 'correct' ? 'Correct This Reference' : 'Why Is This Wrong?'}
                            </h2>
                            <p className="text-xs text-subtext-dark">
                                Your feedback trains the AI to avoid this mistake
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Snippet Preview */}
                    <div className="p-3 bg-background-dark/50 rounded-lg border border-border-dark">
                        <p className="text-xs text-subtext-dark mb-1">The phrase:</p>
                        <p className="text-sm text-white font-serif" dir="rtl">"{originalSnippet}"</p>
                        {originalSource && (
                            <p className="text-xs text-yellow-400 mt-2">
                                AI suggested: {originalSource}
                            </p>
                        )}
                    </div>

                    {/* Error Type Selection */}
                    <div>
                        <label className="block text-sm font-medium text-white mb-2">
                            What's wrong?
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(ERROR_TYPE_LABELS).map(([type, { label, description }]) => (
                                <button
                                    key={type}
                                    onClick={() => setErrorType(type as CorrectionErrorType)}
                                    className={`p-2 rounded-lg border text-left transition-all ${errorType === type
                                            ? 'border-primary bg-primary/20 text-white'
                                            : 'border-border-dark text-subtext-dark hover:border-gray-500'
                                        }`}
                                >
                                    <p className="text-sm font-medium">{label}</p>
                                    <p className="text-xs opacity-70">{description}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Corrected Source (only for correction mode) */}
                    {showCorrectedSource && (
                        <div>
                            <label className="block text-sm font-medium text-white mb-1">
                                Correct Source
                            </label>
                            <input
                                type="text"
                                value={correctedSource}
                                onChange={(e) => setCorrectedSource(e.target.value)}
                                placeholder="e.g., Bavli Gittin 56a"
                                className="w-full bg-background-dark/50 border border-border-dark rounded-lg py-2 px-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    )}

                    {/* Explanation */}
                    <div>
                        <label className="block text-sm font-medium text-white mb-1">
                            Brief Explanation (optional but helpful)
                        </label>
                        <textarea
                            value={explanation}
                            onChange={(e) => setExplanation(e.target.value)}
                            placeholder={
                                mode === 'correct'
                                    ? "e.g., The story is in 56a, not 55b"
                                    : "e.g., This is just a common phrase, not a reference"
                            }
                            rows={2}
                            className="w-full bg-background-dark/50 border border-border-dark rounded-lg py-2 px-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border-dark flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-subtext-dark hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${mode === 'correct'
                                ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                                : 'bg-red-600 hover:bg-red-500 text-white'
                            }`}
                    >
                        {mode === 'correct' ? 'Save Correction' : 'Confirm Rejection'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CorrectionModal;
