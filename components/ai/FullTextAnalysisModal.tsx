
import React, { useState } from 'react';

interface FullTextAnalysisModalProps {
    onClose: () => void;
    onAnalyze: (fullText: string) => Promise<void>;
}

const FullTextAnalysisModal: React.FC<FullTextAnalysisModalProps> = ({ onClose, onAnalyze }) => {
    const [fullText, setFullText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAnalyze = async () => {
        if (fullText.trim().length < 100) { // Simple validation
            setError('Please paste a substantial amount of text for a meaningful analysis.');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            await onAnalyze(fullText);
            // onClose will be called by the parent on success
        } catch (err) {
            console.error(err);
            setError('An unexpected error occurred during analysis.');
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" aria-modal="true" role="dialog">
            <div className="relative z-10 mx-auto w-full max-w-2xl">
                <div className="flex flex-col rounded-xl border border-ai-primary/20 bg-[#141929] text-white shadow-2xl shadow-ai-primary/10">
                    <div className="flex flex-col gap-2 p-6 sm:p-8 border-b border-ai-primary/20">
                        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                             <span className="material-symbols-outlined text-ai-primary text-4xl">spark</span>
                            AI Full-Text Analysis
                        </h1>
                        <p className="text-white/70">Paste your text below. The AI will scan it for connections to your existing reception trees and suggest new ones.</p>
                    </div>
                    <div className="flex flex-col gap-6 px-6 sm:px-8 py-6">
                        <div className="flex w-full flex-col">
                            <label className="pb-2 text-base font-medium text-white" htmlFor="full-text">
                                Document Text
                            </label>
                            <textarea
                                id="full-text"
                                className="form-textarea w-full resize-y overflow-hidden rounded-lg border border-ai-primary/30 bg-[#191F33] p-3.5 text-base font-normal text-white placeholder:text-white/50 focus:border-ai-primary focus:outline-0 focus:ring-2 focus:ring-ai-primary/40 min-h-80"
                                placeholder="Paste an article, chapter, or any other text here..."
                                value={fullText}
                                onChange={(e) => setFullText(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>
                        {error && <p className="text-red-400 text-sm">{error}</p>}
                    </div>
                    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 p-6 sm:p-8 bg-[#101421]/50 rounded-b-xl">
                        <button 
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-11 px-4 bg-ai-primary/20 text-white text-sm font-bold leading-normal tracking-wide transition-colors hover:bg-ai-primary/30 disabled:opacity-50 disabled:cursor-not-allowed">
                            <span className="truncate">Cancel</span>
                        </button>
                        <button 
                            onClick={handleAnalyze}
                            disabled={isLoading || !fullText.trim()}
                            className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-11 px-4 bg-ai-primary text-white text-sm font-bold leading-normal tracking-wide transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
                             {isLoading ? (
                                <>
                                 <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                 <span>Analyzing...</span>
                                </>
                             ) : (
                                <span className="truncate">Analyze Text</span>
                             )}
                        </button>
                    </div>
                </div>
            </div>
             <div className="absolute inset-0 z-0" onClick={onClose}></div>
        </div>
    );
};

export default FullTextAnalysisModal;
