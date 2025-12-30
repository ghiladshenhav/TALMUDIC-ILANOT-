import React, { useState, useEffect } from 'react';
import { AIFinding, AIFindingType, AIFindingStatus } from '../types';
import { generateUUID } from '../utils/id-helpers';

interface AddReferenceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (finding: AIFinding) => void;
    initialSnippet?: string;
    sourceDocumentId?: string;
    existingFindings?: AIFinding[];
}

// Common Talmudic source suggestions
const COMMON_SOURCES = [
    'Bavli Berakhot',
    'Bavli Shabbat',
    'Bavli Eruvin',
    'Bavli Pesachim',
    'Bavli Yoma',
    'Bavli Sukkah',
    'Bavli Beitzah',
    'Bavli Rosh Hashanah',
    'Bavli Taanit',
    'Bavli Megillah',
    'Bavli Moed Katan',
    'Bavli Chagigah',
    'Bavli Yevamot',
    'Bavli Ketubot',
    'Bavli Nedarim',
    'Bavli Nazir',
    'Bavli Sotah',
    'Bavli Gittin',
    'Bavli Kiddushin',
    'Bavli Bava Kamma',
    'Bavli Bava Metzia',
    'Bavli Bava Batra',
    'Bavli Sanhedrin',
    'Bavli Makkot',
    'Bavli Shevuot',
    'Bavli Avodah Zarah',
    'Bavli Horayot',
    'Mishnah',
    'Tosefta',
    'Yerushalmi',
];

const AddReferenceModal: React.FC<AddReferenceModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialSnippet = '',
    sourceDocumentId,
    existingFindings = [],
}) => {
    const [snippet, setSnippet] = useState(initialSnippet);
    const [source, setSource] = useState('');
    const [sourceSuggestions, setSourceSuggestions] = useState<string[]>([]);
    const [explanation, setExplanation] = useState('');
    const [isGroundTruth, setIsGroundTruth] = useState(true);
    const [matchingPhrase, setMatchingPhrase] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSnippet(initialSnippet);
            setSource('');
            setExplanation('');
            setIsGroundTruth(true);
            setMatchingPhrase('');
        }
    }, [isOpen, initialSnippet]);

    const handleSourceChange = (value: string) => {
        setSource(value);
        if (value.length > 1) {
            const filtered = COMMON_SOURCES.filter(s =>
                s.toLowerCase().includes(value.toLowerCase())
            );
            setSourceSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
        } else {
            setShowSuggestions(false);
        }
    };

    const handleSelectSource = (selectedSource: string) => {
        setSource(selectedSource);
        setShowSuggestions(false);
    };

    const handleSubmit = () => {
        if (!snippet.trim() || !source.trim()) {
            alert('Please fill in both the text snippet and the source reference.');
            return;
        }

        const newFinding: AIFinding = {
            id: generateUUID(),
            type: AIFindingType.Reference,
            snippet: snippet.trim(),
            source: source.trim(),
            confidence: 1.0, // User-added = 100% confidence
            status: AIFindingStatus.Pending,
            isGroundTruth,
            userExplanation: explanation.trim() || undefined,
            addedManually: true,
            sourceDocumentId,
            matchingPhrase: matchingPhrase.trim() || undefined,
            justification: `Manually added by user${explanation ? ': ' + explanation : ''}`,
        };

        onSave(newFinding);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-gradient-to-br from-[#0f1a0f] to-[#0a140a] border border-[#1a4d2e]/50 rounded-2xl w-full max-w-xl mx-4 shadow-2xl animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-[#1a4d2e]/30">
                    <div>
                        <h2 className="text-xl font-serif font-bold text-[#f5f0e1]">
                            Add Reference Manually
                        </h2>
                        <p className="text-sm text-[#f5f0e1]/50 mt-1">
                            Add a reference the AI missed
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-[#1a4d2e]/30 text-[#f5f0e1]/50 hover:text-[#f5f0e1] transition-colors"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">
                    {/* Text Snippet */}
                    <div>
                        <label className="block text-sm font-medium text-[#f5f0e1]/70 mb-2">
                            Text Snippet <span className="text-red-400">*</span>
                        </label>
                        <textarea
                            value={snippet}
                            onChange={(e) => setSnippet(e.target.value)}
                            placeholder="The text that contains the implicit reference..."
                            className="w-full h-24 bg-[#0a140a]/50 border border-[#1a4d2e]/40 rounded-xl p-3 text-[#f5f0e1] placeholder-[#f5f0e1]/30 focus:border-[#10B981]/50 focus:outline-none resize-none"
                        />
                    </div>

                    {/* Source Reference */}
                    <div className="relative">
                        <label className="block text-sm font-medium text-[#f5f0e1]/70 mb-2">
                            Talmudic Source <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            value={source}
                            onChange={(e) => handleSourceChange(e.target.value)}
                            onFocus={() => source.length > 1 && setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            placeholder="e.g., Bavli Berakhot 3a"
                            className="w-full bg-[#0a140a]/50 border border-[#1a4d2e]/40 rounded-xl p-3 text-[#f5f0e1] placeholder-[#f5f0e1]/30 focus:border-[#10B981]/50 focus:outline-none"
                        />
                        {showSuggestions && sourceSuggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-[#0f1a0f] border border-[#1a4d2e]/50 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                                {sourceSuggestions.map((suggestion) => (
                                    <button
                                        key={suggestion}
                                        onClick={() => handleSelectSource(suggestion)}
                                        className="w-full text-left px-4 py-2 text-[#f5f0e1]/80 hover:bg-[#10B981]/10 hover:text-[#10B981] transition-colors first:rounded-t-xl last:rounded-b-xl"
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Matching Phrase (optional) */}
                    <div>
                        <label className="block text-sm font-medium text-[#f5f0e1]/70 mb-2">
                            Matching Phrase <span className="text-[#f5f0e1]/40">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={matchingPhrase}
                            onChange={(e) => setMatchingPhrase(e.target.value)}
                            placeholder="The exact phrase from the Talmudic source..."
                            className="w-full bg-[#0a140a]/50 border border-[#1a4d2e]/40 rounded-xl p-3 text-[#f5f0e1] placeholder-[#f5f0e1]/30 focus:border-[#10B981]/50 focus:outline-none"
                        />
                    </div>

                    {/* Explanation (for ground truth) */}
                    <div>
                        <label className="block text-sm font-medium text-[#f5f0e1]/70 mb-2">
                            Explanation <span className="text-[#f5f0e1]/40">(helps train AI)</span>
                        </label>
                        <textarea
                            value={explanation}
                            onChange={(e) => setExplanation(e.target.value)}
                            placeholder="Why is this a valid reference? (e.g., 'The author paraphrases the teaching about...')"
                            className="w-full h-20 bg-[#0a140a]/50 border border-[#1a4d2e]/40 rounded-xl p-3 text-[#f5f0e1] placeholder-[#f5f0e1]/30 focus:border-[#10B981]/50 focus:outline-none resize-none"
                        />
                    </div>

                    {/* Ground Truth Toggle */}
                    <div className="flex items-center gap-3 p-4 bg-[#10B981]/5 border border-[#10B981]/20 rounded-xl">
                        <input
                            type="checkbox"
                            id="groundTruth"
                            checked={isGroundTruth}
                            onChange={(e) => setIsGroundTruth(e.target.checked)}
                            className="w-5 h-5 rounded border-[#1a4d2e]/50 bg-[#0a140a] text-[#10B981] focus:ring-[#10B981]/50 focus:ring-offset-0 cursor-pointer"
                        />
                        <label htmlFor="groundTruth" className="cursor-pointer">
                            <span className="font-medium text-[#10B981]">Mark as Ground Truth</span>
                            <p className="text-xs text-[#f5f0e1]/50 mt-0.5">
                                Use this reference to train AI to find similar patterns
                            </p>
                        </label>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-[#1a4d2e]/30">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl border border-[#1a4d2e]/50 text-[#f5f0e1]/60 hover:bg-[#1a4d2e]/20 hover:text-[#f5f0e1] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-5 py-2.5 rounded-xl bg-[#10B981] text-[#0a140a] font-bold hover:bg-[#34D399] transition-colors flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-lg">add</span>
                        Add Reference
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddReferenceModal;
