import React, { useState, useRef } from 'react';
import { AIFinding } from '../../types';
import { analyzePdfComplete, citationsToFindings, ExtractedCitation, analyzePdfWithTesseract } from '../../services/pdf-extraction';
import { OCRLanguage, getLanguageDisplayName } from '../../utils/tesseract-ocr';

// OCR Provider type
type OCRProvider = 'tesseract' | 'gemini';

interface PdfAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAnalysisComplete: (findings: AIFinding[], transcribedText: string) => void;
}

const PdfAnalysisModal: React.FC<PdfAnalysisModalProps> = ({ isOpen, onClose, onAnalysisComplete }) => {
    const [file, setFile] = useState<File | null>(null);
    const [author, setAuthor] = useState('');
    const [workTitle, setWorkTitle] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [citations, setCitations] = useState<ExtractedCitation[]>([]);
    const [transcribedText, setTranscribedText] = useState<string>('');
    const [selectedCitations, setSelectedCitations] = useState<Set<number>>(new Set());
    const [analysisStage, setAnalysisStage] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // OCR Provider selection - defaults to FREE Tesseract
    const [ocrProvider, setOcrProvider] = useState<OCRProvider>('tesseract');
    const [ocrLanguage, setOcrLanguage] = useState<OCRLanguage>('heb+deu');

    if (!isOpen) return null;

    const handleFileChange = (selectedFile: File | null) => {
        if (selectedFile && selectedFile.type === 'application/pdf') {
            setFile(selectedFile);
            setError(null);
            setCitations([]);
            setSelectedCitations(new Set());

            // Try to extract title from filename
            const nameWithoutExt = selectedFile.name.replace(/\.pdf$/i, '');
            if (!workTitle) {
                setWorkTitle(nameWithoutExt);
            }
        } else if (selectedFile) {
            setError('Please select a PDF file');
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        handleFileChange(droppedFile);
    };

    const handleAnalyze = async () => {
        if (!file) {
            setError('Please select a PDF file');
            return;
        }
        if (!author.trim() || !workTitle.trim()) {
            setError('Please provide the author and work title');
            return;
        }

        setIsAnalyzing(true);
        setError(null);

        const providerLabel = ocrProvider === 'tesseract' ? 'FREE Tesseract' : 'Gemini (paid)';
        setAnalysisStage(`Transcribing with ${providerLabel}...`);

        try {
            console.log(`[PDF Analysis] Starting analysis with ${ocrProvider}:`, file.name);

            let result;

            if (ocrProvider === 'tesseract') {
                // FREE Tesseract OCR - only transcribes, no citation extraction
                result = await analyzePdfWithTesseract(file, ocrLanguage, (stage) => {
                    setAnalysisStage(stage);
                });

                // Note: Tesseract only gives us text, citations come from running Analyzer later
                setAnalysisStage(`✅ Transcribed ${result.transcribedText.length} characters (FREE). Run Analyzer to find citations.`);

            } else {
                // Gemini Vision (PAID) - transcribes AND extracts citations
                result = await analyzePdfComplete(file, (stage) => {
                    setAnalysisStage(stage);
                });

                setAnalysisStage(`Transcribed ${result.transcribedText.length} characters, found ${result.citations.length} citations`);
            }

            setTranscribedText(result.transcribedText);
            setCitations(result.citations);

            // Select all by default
            const allIndices = new Set<number>(result.citations.map((_, i) => i));
            setSelectedCitations(allIndices);

            if (result.citations.length === 0 && ocrProvider === 'gemini') {
                setError('No Talmudic citations found in this document. The full text has been transcribed and saved.');
            }

        } catch (err: any) {
            console.error('[PDF Analysis] Error:', err);
            setError(err.message || 'Failed to analyze PDF');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const toggleCitation = (index: number) => {
        const newSelection = new Set(selectedCitations);
        if (newSelection.has(index)) {
            newSelection.delete(index);
        } else {
            newSelection.add(index);
        }
        setSelectedCitations(newSelection);
    };

    const handleSelectAll = () => {
        if (selectedCitations.size === citations.length) {
            setSelectedCitations(new Set());
        } else {
            setSelectedCitations(new Set(citations.map((_, i) => i)));
        }
    };

    const handleConfirm = async () => {
        const selectedCitationsList = citations.filter((_, i) => selectedCitations.has(i));

        // citationsToFindings is now async - fetches from Sefaria if needed
        const findings = await citationsToFindings(selectedCitationsList, workTitle, author);

        console.log(`[PDF Analysis] Sending ${findings.length} findings with ${transcribedText.length} chars of text`);
        onAnalysisComplete(findings, transcribedText);
        onClose();
    };

    const handleReset = () => {
        setFile(null);
        setCitations([]);
        setTranscribedText('');
        setSelectedCitations(new Set());
        setError(null);
        setAnalysisStage('');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-surface-dark border border-border-dark rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-border-dark flex justify-between items-center bg-background-dark rounded-t-xl">
                    <div>
                        <h2 className="text-xl font-bold text-primary font-serif flex items-center gap-2">
                            <span className="material-symbols-outlined text-red-400">picture_as_pdf</span>
                            Scan PDF for Citations
                        </h2>
                        <p className="text-sm text-subtext-dark">
                            Upload a German/Hebrew PDF and AI will extract Talmudic references directly from the document.
                        </p>
                    </div>
                    {!isAnalyzing && (
                        <button onClick={onClose} className="text-text-muted hover:text-text-dark transition-colors">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-surface-dark/50">
                    {/* Metadata Inputs */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-subtext-dark mb-1">Author *</label>
                            <input
                                type="text"
                                value={author}
                                onChange={(e) => setAuthor(e.target.value)}
                                disabled={isAnalyzing}
                                placeholder="e.g., Heinrich Graetz"
                                className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2 text-text-dark focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-subtext-dark mb-1">Work Title *</label>
                            <input
                                type="text"
                                value={workTitle}
                                onChange={(e) => setWorkTitle(e.target.value)}
                                disabled={isAnalyzing}
                                placeholder="e.g., Geschichte der Juden"
                                className="w-full bg-background-dark border border-border-dark rounded-lg px-4 py-2 text-text-dark focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                            />
                        </div>
                    </div>

                    {/* OCR Provider Selection */}
                    <div className="mb-6 p-4 bg-background-dark rounded-lg border border-border-dark">
                        <label className="block text-sm font-medium text-subtext-dark mb-3">OCR Method</label>
                        <div className="flex gap-4">
                            <label className={`flex-1 p-3 rounded-lg border cursor-pointer transition-all ${ocrProvider === 'tesseract'
                                ? 'border-green-500 bg-green-500/10'
                                : 'border-border-dark hover:border-primary/30'
                                }`}>
                                <input
                                    type="radio"
                                    name="ocrProvider"
                                    value="tesseract"
                                    checked={ocrProvider === 'tesseract'}
                                    onChange={() => setOcrProvider('tesseract')}
                                    disabled={isAnalyzing}
                                    className="sr-only"
                                />
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="material-symbols-outlined text-green-400 text-lg">savings</span>
                                    <span className="font-medium text-text-dark">Tesseract (FREE)</span>
                                    <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded">Recommended</span>
                                </div>
                                <p className="text-xs text-subtext-dark">
                                    Transcribes text only. Run Analyzer separately for references.
                                </p>
                            </label>
                            <label className={`flex-1 p-3 rounded-lg border cursor-pointer transition-all ${ocrProvider === 'gemini'
                                ? 'border-primary bg-primary/10'
                                : 'border-border-dark hover:border-primary/30'
                                }`}>
                                <input
                                    type="radio"
                                    name="ocrProvider"
                                    value="gemini"
                                    checked={ocrProvider === 'gemini'}
                                    onChange={() => setOcrProvider('gemini')}
                                    disabled={isAnalyzing}
                                    className="sr-only"
                                />
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="material-symbols-outlined text-primary text-lg">auto_awesome</span>
                                    <span className="font-medium text-text-dark">Gemini Vision</span>
                                    <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">Paid</span>
                                </div>
                                <p className="text-xs text-subtext-dark">
                                    Higher quality + auto citation extraction. Costs API tokens.
                                </p>
                            </label>
                        </div>

                        {/* Language selection for Tesseract */}
                        {ocrProvider === 'tesseract' && (
                            <div className="mt-3 pt-3 border-t border-border-dark">
                                <label className="block text-xs font-medium text-subtext-dark mb-2">Language(s)</label>
                                <select
                                    value={ocrLanguage}
                                    onChange={(e) => setOcrLanguage(e.target.value as OCRLanguage)}
                                    disabled={isAnalyzing}
                                    className="bg-surface-dark border border-border-dark rounded px-3 py-1.5 text-sm text-text-dark focus:outline-none focus:border-primary"
                                >
                                    <option value="heb+deu">Hebrew + German (default)</option>
                                    <option value="heb+frk">Hebrew + Fraktur (old German)</option>
                                    <option value="heb+deu+frk">Hebrew + German + Fraktur</option>
                                    <option value="heb">Hebrew only</option>
                                    <option value="deu">German only</option>
                                    <option value="frk">Fraktur only</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {/* File Upload Area */}
                    {!citations.length && (
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all mb-6 ${isDragging
                                ? 'border-primary bg-primary/10'
                                : file
                                    ? 'border-green-500/50 bg-green-500/5'
                                    : 'border-border-dark hover:border-primary/50 bg-background-dark'
                                }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf"
                                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                                className="hidden"
                            />

                            {file ? (
                                <div className="flex items-center justify-center gap-3">
                                    <span className="material-symbols-outlined text-3xl text-green-400">check_circle</span>
                                    <div className="text-left">
                                        <p className="text-text-dark font-medium">{file.name}</p>
                                        <p className="text-sm text-subtext-dark">
                                            {(file.size / (1024 * 1024)).toFixed(2)} MB • Click to change
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-4xl text-primary mb-2">upload_file</span>
                                    <p className="text-text-dark font-medium">Drop PDF here or click to browse</p>
                                    <p className="text-sm text-subtext-dark mt-1">
                                        Supports German, Hebrew, and mixed-script documents
                                    </p>
                                </>
                            )}
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}

                    {/* Analyzing Spinner */}
                    {isAnalyzing && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <span className="material-symbols-outlined text-4xl animate-spin text-primary mb-4">sync</span>
                            <h3 className="text-lg font-bold text-text-dark mb-2">Analyzing PDF...</h3>
                            <p className="text-sm text-subtext-dark">{analysisStage}</p>
                            <p className="text-xs text-primary mt-2 font-mono bg-primary/10 px-3 py-1 rounded">
                                AI is reading the document visually
                            </p>
                        </div>
                    )}

                    {/* Citations Results */}
                    {citations.length > 0 && !isAnalyzing && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-text-dark">
                                    Found {citations.length} Citations
                                </h3>
                                <button
                                    onClick={handleSelectAll}
                                    className="text-sm text-primary hover:underline font-medium"
                                >
                                    {selectedCitations.size === citations.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>

                            <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                                {citations.map((citation, index) => {
                                    const isSelected = selectedCitations.has(index);
                                    return (
                                        <div
                                            key={index}
                                            onClick={() => toggleCitation(index)}
                                            className={`p-4 rounded-lg border cursor-pointer transition-all ${isSelected
                                                ? 'bg-primary/10 border-primary'
                                                : 'bg-background-dark border-border-dark hover:border-primary/30'
                                                }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center mt-0.5 transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-subtext-dark bg-transparent'
                                                    }`}>
                                                    {isSelected && <span className="material-symbols-outlined text-sm text-white">check</span>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-bold text-primary">{citation.source}</span>
                                                        {citation.isImplicit && (
                                                            <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">
                                                                Implicit
                                                            </span>
                                                        )}
                                                        {citation.pageNumber && (
                                                            <span className="text-xs text-subtext-dark">
                                                                p. {citation.pageNumber}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-text-dark mb-2 line-clamp-2">
                                                        "{citation.snippet}"
                                                    </p>
                                                    <p className="text-xs text-subtext-dark">
                                                        {citation.justification}
                                                    </p>
                                                    {citation.hebrewText && (
                                                        <p className="text-sm text-green-400 mt-2 font-hebrew" dir="rtl">
                                                            {citation.hebrewText}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-border-dark bg-background-dark rounded-b-xl flex justify-between items-center">
                    <div className="text-sm text-subtext-dark">
                        {citations.length > 0
                            ? `${selectedCitations.size} of ${citations.length} citations selected`
                            : transcribedText && ocrProvider === 'tesseract'
                                ? `✅ ${transcribedText.length.toLocaleString()} characters transcribed (FREE)`
                                : file
                                    ? 'Ready to analyze'
                                    : 'Select a PDF to begin'
                        }
                    </div>
                    <div className="flex gap-3">
                        {citations.length > 0 ? (
                            <>
                                <button
                                    onClick={handleReset}
                                    className="px-4 py-2 text-text-dark hover:bg-surface-dark rounded-lg transition-colors"
                                >
                                    Start Over
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    disabled={selectedCitations.size === 0}
                                    className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg shadow-primary/20"
                                >
                                    Add {selectedCitations.size} to Analyzer
                                </button>
                            </>
                        ) : transcribedText && ocrProvider === 'tesseract' ? (
                            // Tesseract mode: has text but no citations - show "Send to Analyzer"
                            <>
                                <button
                                    onClick={handleReset}
                                    className="px-4 py-2 text-text-dark hover:bg-surface-dark rounded-lg transition-colors"
                                >
                                    Start Over
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium shadow-lg shadow-green-600/20 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">send</span>
                                    Send Text to Analyzer
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={onClose}
                                    disabled={isAnalyzing}
                                    className="px-4 py-2 text-text-dark hover:bg-surface-dark rounded-lg transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAnalyze}
                                    disabled={!file || !author.trim() || !workTitle.trim() || isAnalyzing}
                                    className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg shadow-primary/20 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                    Analyze with AI
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PdfAnalysisModal;
