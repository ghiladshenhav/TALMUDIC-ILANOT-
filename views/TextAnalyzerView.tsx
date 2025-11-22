
import React, { useState, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { AIFinding, AIFindingType, AIFindingStatus } from '../types';
import SuggestionCard from '../components/analyzer/SuggestionCard';
import { generateContentWithRetry } from '../utils/ai-helpers';

interface TextAnalyzerViewProps {
    onApproveFinding: (finding: AIFinding) => Promise<void>;
    existingRoots: string[];
    onAnalysisComplete: (text: string, title: string, findings: AIFinding[]) => Promise<void>;
}

const fileToGenerativePart = async (file: File) => {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
    });
    return {
        inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
};

const TextAnalyzerView: React.FC<TextAnalyzerViewProps> = ({ onApproveFinding, existingRoots, onAnalysisComplete }) => {
    const [file, setFile] = useState<File | null>(null);
    const [author, setAuthor] = useState('');
    const [workTitle, setWorkTitle] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<AIFinding[]>([]);
    const [processedSuggestionIds, setProcessedSuggestionIds] = useState<Set<string>>(new Set());

    const handleFileChange = (selectedFile: File | null) => {
        if (!selectedFile) return;

        const supportedImageTypes = ['image/jpeg', 'image/png', 'image/tiff'];
        const supportedTextTypes = ['text/plain'];
        const supportedPdfTypes = ['application/pdf'];
        const supportedTypes = [...supportedImageTypes, ...supportedTextTypes, ...supportedPdfTypes];

        if (!supportedTypes.includes(selectedFile.type)) {
            setError(`Unsupported file type: ${selectedFile.type}. Please upload a TXT, PDF, JPG, PNG, or TIFF file.`);
            setFile(null);
            return;
        }

        setError(null);
        setFile(selectedFile);
        setSuggestions([]);
        setProcessedSuggestionIds(new Set());
    };

    const handleDragEvent = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragEnter = (e: React.DragEvent) => {
        handleDragEvent(e);
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        handleDragEvent(e);
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        handleDragEvent(e);
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileChange(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    };

    const handleAnalyze = async () => {
        if (!file || !author.trim() || !workTitle.trim()) {
            setError('Please select a file and provide the author and work title.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuggestions([]);

        try {
            const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

            const model = 'gemini-2.5-flash';
            let contents: any;

            const basePrompt = `You are a Talmudic research assistant with one task: to locate all Talmudic or Midrashic references in a given text, and for each reference, retrieve the original source text.
Analyze the following document and identify every reference to rabbinic literature. For each reference you find, you must provide a JSON object with the following fields: "source", "snippet", "contextBefore", "contextAfter", "justification", "title", "hebrewText", "translation", and "originalText".
- "source": The precise, canonical citation (e.g., "Bavli Kiddushin 40b", "Mishnah Peah 1:1"). DO NOT include "Analysis of" or descriptive text here. It must be the citation only.
- "snippet": The quote from the input document where the reference is made.
- "contextBefore": The two sentences immediately preceding the snippet.
- "contextAfter": The two sentences immediately following the snippet.
- "justification": A brief explanation of why this is a valid reference.
- "title": A short, descriptive title for the Talmudic passage (e.g., "Study vs. Action").
- "hebrewText": The original Hebrew/Aramaic text of the Talmudic passage cited in 'source'.
- "translation": An English translation of the Talmudic passage cited in 'source'.
- "originalText": Same as hebrewText, included for consistency.

IMPORTANT: If the input text contains the English translation of a Talmudic source, DO NOT create a separate finding for it if you have already identified the source itself. Just include the translation in the "translation" field of the main finding. We do not want separate nodes for the translation.Return a single JSON object with one key, "foundReferences", which is an array of these objects, ordered chronologically as they appear in the source text.

--- DOCUMENT TEXT ---
`;

            if (file.type.startsWith('image/')) {
                const imagePart = await fileToGenerativePart(file);
                const prompt = `First, extract all text from the provided image. Then, use that extracted text as the "DOCUMENT TEXT" for the following task:\n\n${basePrompt}`;
                contents = { parts: [{ text: prompt }, imagePart] };
            } else if (file.type === 'application/pdf') {
                const pdfPart = await fileToGenerativePart(file);
                const prompt = `First, extract all text from the provided PDF document. Then, use that extracted text as the "DOCUMENT TEXT" for the following task:\n\n${basePrompt}`;
                contents = { parts: [{ text: prompt }, pdfPart] };
            } else { // text/plain
                const text = await file.text();
                contents = `${basePrompt}${text}`;
            }

            // Use the retry helper
            // Note: The SDK usage here was slightly incorrect in my previous attempt. 
            // The 'ai.models.generateContent' is the correct way for this version of the SDK used in the file originally.
            // So I will pass 'ai.models' as the "model" to my helper, or better yet, just pass the function to execute.
            // Actually, looking at the original code: `await ai.models.generateContent(...)`
            // My helper expects an object with a `generateContent` method. `ai.models` has this.

            const response = await generateContentWithRetry(ai.models, {
                model: model,
                contents: contents,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            foundReferences: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        source: { type: Type.STRING },
                                        snippet: { type: Type.STRING },
                                        contextBefore: { type: Type.STRING },
                                        contextAfter: { type: Type.STRING },
                                        justification: { type: Type.STRING },
                                        title: { type: Type.STRING },
                                        hebrewText: { type: Type.STRING },
                                        translation: { type: Type.STRING },
                                        originalText: { type: Type.STRING },
                                    },
                                    required: ["source", "snippet", "justification", "title", "hebrewText", "translation"]
                                }
                            }
                        }
                    }
                }
            });

            let jsonString = response.text.trim();

            // Remove markdown code blocks if present
            jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '');

            // Attempt to find the JSON object within the text
            const firstBrace = jsonString.indexOf('{');
            const lastBrace = jsonString.lastIndexOf('}');

            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                jsonString = jsonString.substring(firstBrace, lastBrace + 1);
            }

            let results;
            try {
                results = JSON.parse(jsonString);
            } catch (parseError) {
                console.error("JSON Parse Error:", parseError);
                console.log("Raw JSON String:", jsonString);

                // Attempt to repair truncated JSON (simple heuristic)
                try {
                    // Check if it looks like an unclosed array or object
                    if (jsonString.trim().endsWith(']')) {
                        // might be missing closing }
                        results = JSON.parse(jsonString + '}');
                    } else if (jsonString.trim().endsWith('}')) {
                        // might be fine, but maybe internal issue
                        throw parseError;
                    } else {
                        // Try adding closing characters
                        results = JSON.parse(jsonString + ']}');
                    }
                    console.log("Recovered from JSON error with simple repair.");
                } catch (retryError) {
                    throw new Error(`Failed to parse AI response. Raw output start: ${jsonString.substring(0, 100)}...`);
                }
            }
            const findings: AIFinding[] = results.foundReferences?.map((item: any, i: number) => ({
                id: `suggestion-ref-${crypto.randomUUID()}-${i}`,
                type: AIFindingType.Reference,
                status: AIFindingStatus.Pending,
                confidence: 95, // Hardcoded high confidence as this is a specific detection task
                author,
                workTitle,
                ...item
            })) || [];

            setSuggestions(findings);
            if (findings.length === 0) {
                setError("Analysis complete, but no new references were found in this document.");
            } else {
                // Save to library
                let fullText = "";
                if (typeof contents === 'string') {
                    fullText = contents.replace(basePrompt, '');
                } else {
                    fullText = `[File Upload: ${file.name}]`; // Placeholder for binary files
                }
                await onAnalysisComplete(fullText, `${workTitle} - ${author}`, findings);
            }

        } catch (err) {
            console.error("Analysis failed:", err);
            setError(`The AI analysis failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSuggestionAction = (suggestionId: string, newStatus: AIFindingStatus) => {
        setSuggestions(prev => prev.map(s => s.id === suggestionId ? { ...s, status: newStatus } : s));
    };

    const handleProcessSelections = async () => {
        const approved = suggestions.filter(s => (s.status === AIFindingStatus.Added || s.status === AIFindingStatus.AddedAsNewRoot || s.status === AIFindingStatus.AddedToExistingRoot) && !processedSuggestionIds.has(s.id));
        if (approved.length === 0) return;

        setIsProcessing(true);
        setError(null);
        console.log("Processing selections:", approved);

        try {
            await Promise.all(approved.map(finding => {
                console.log("Approving finding:", finding);
                return onApproveFinding(finding);
            }));
            // Add their IDs to the processed set after all are successful
            setProcessedSuggestionIds(prev => new Set([...prev, ...approved.map(f => f.id)]));
        } catch (error) {
            console.error("Failed to process selections:", error);
            setError("An error occurred while adding selections to the graph. Some items may not have been added. Please check the console and try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClearApproved = () => {
        setSuggestions(prev => prev.filter(s => s.status !== AIFindingStatus.Added && s.status !== AIFindingStatus.AddedAsNewRoot && s.status !== AIFindingStatus.AddedToExistingRoot));
    };

    const approvedCount = useMemo(() => suggestions.filter(s => (s.status === AIFindingStatus.Added || s.status === AIFindingStatus.AddedAsNewRoot || s.status === AIFindingStatus.AddedToExistingRoot) && !processedSuggestionIds.has(s.id)).length, [suggestions, processedSuggestionIds]);
    const processedCount = useMemo(() => suggestions.filter(s => s.status === AIFindingStatus.Added || s.status === AIFindingStatus.AddedAsNewRoot || s.status === AIFindingStatus.AddedToExistingRoot).length, [suggestions]);
    const isReadyToProcess = approvedCount > 0 && !isProcessing;

    const normalizeSourceText = (text: string) => {
        return text.toLowerCase()
            .replace(/^(bavli|yerushalmi|masechet|tractate|b\.|y\.)\s*/g, '')
            .replace(/[.,\-:;]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const checkIsExisting = (source: string) => {
        const normalizedSource = normalizeSourceText(source);
        if (!normalizedSource) return false;

        const match = existingRoots.find(rootSource => {
            const normalizedRoot = normalizeSourceText(rootSource);
            return normalizedRoot && normalizedRoot === normalizedSource;
        });

        // console.log(`Checking source: "${source}" (norm: "${normalizedSource}")`);
        // console.log(`Match found:`, match);
        return !!match;
    };

    return (
        <div className="flex-1 flex flex-col bg-background-dark text-text-dark overflow-y-auto">
            <div className="w-full max-w-4xl mx-auto p-8 space-y-8">
                {/* Header */}
                <div>
                    <h1 className="text-4xl font-black leading-tight tracking-[-0.033em] text-white flex items-center gap-4">
                        <span className="material-symbols-outlined text-ai-primary !text-5xl">plagiarism</span>
                        Reference Detector
                    </h1>
                    <p className="text-white/60 mt-2 max-w-3xl">Upload a document and provide its author and title. The AI will find all Talmudic/Midrashic references, retrieve the original source text, and help you add them to your graph.</p>
                </div>

                {/* Uploader Column */}
                <div className="bg-card-dark border border-border-dark rounded-xl p-6">
                    <h2 className="text-lg font-bold text-white">1. Provide Source</h2>
                    <p className="text-sm text-subtext-dark mt-1 mb-4">Add the source text and its metadata.</p>

                    <div className="space-y-4">
                        <label className="block">
                            <span className="text-sm font-medium text-text-dark">Author</span>
                            <input type="text" value={author} onChange={e => setAuthor(e.target.value)} placeholder="e.g., Emmanuel Levinas" className="modal-input mt-1" />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-text-dark">Work Title</span>
                            <input type="text" value={workTitle} onChange={e => setWorkTitle(e.target.value)} placeholder="e.g., Totality and Infinity" className="modal-input mt-1" />
                        </label>
                    </div>

                    <label
                        htmlFor="file-upload"
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragEvent}
                        onDrop={handleDrop}
                        className={`group mt-4 flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 ${isDragging
                            ? 'border-primary bg-primary/10 scale-[1.02]'
                            : 'border-border-dark bg-background-dark hover:bg-white/5 hover:border-primary/50'}`}
                    >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                            <div className={`p-4 rounded-full mb-3 transition-colors ${isDragging ? 'bg-primary/20' : 'bg-surface-dark group-hover:bg-white/10'}`}>
                                <span className={`material-symbols-outlined text-4xl transition-colors ${isDragging ? 'text-primary' : 'text-subtext-dark group-hover:text-primary'}`}>upload_file</span>
                            </div>
                            <p className="mb-2 text-lg font-medium text-white">
                                <span className="font-bold text-primary">Click to upload</span> or drag and drop
                            </p>
                            <p className="text-sm text-subtext-dark">TXT, PDF, JPG, PNG, TIFF</p>
                        </div>
                        <input id="file-upload" type="file" className="hidden" onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)} accept=".txt,.pdf,.jpg,.jpeg,.png,.tiff" />
                    </label>

                    {file && (
                        <div className="mt-4 p-3 bg-white/5 rounded-lg flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <span className="material-symbols-outlined text-primary">description</span>
                                <p className="text-sm text-white truncate flex-1" title={file.name}>{file.name}</p>
                            </div>
                            <button onClick={() => { setFile(null); setSuggestions([]); }} className="text-subtext-dark hover:text-white transition-colors flex-shrink-0">
                                <span className="material-symbols-outlined !text-xl">close</span>
                            </button>
                        </div>
                    )}

                    {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

                    <button
                        onClick={handleAnalyze}
                        disabled={!file || !author || !workTitle || isLoading || isProcessing}
                        className="w-full mt-6 flex items-center justify-center gap-2 h-12 px-6 rounded-lg bg-ai-primary text-white font-bold transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                <span>Analyzing...</span>
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined">spark</span>
                                <span>Find References</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Results Column */}
                <div>
                    <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
                        <h2 className="text-lg font-bold text-white">2. Review & Approve References</h2>
                        <div className="flex items-center gap-3">
                            {processedCount > 0 && !isProcessing && (
                                <button onClick={handleClearApproved} className="h-10 px-4 rounded-lg text-sm font-bold text-subtext-dark bg-white/10 hover:bg-white/20 transition-colors">
                                    Clear Added ({processedCount})
                                </button>
                            )}
                            {isReadyToProcess && (
                                <button onClick={handleProcessSelections} disabled={!isReadyToProcess} className="h-10 px-4 rounded-lg text-sm font-bold text-background-dark bg-primary hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                    {isProcessing ? 'Processing...' : `Add ${approvedCount} Selection${approvedCount > 1 ? 's' : ''} to Graph`}
                                </button>
                            )}
                        </div>
                    </div>
                    {isLoading ? (
                        <div className="w-full bg-card-dark border border-dashed border-border-dark rounded-xl flex flex-col items-center justify-center p-12 text-center">
                            <svg className="animate-spin h-12 w-12 text-ai-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <p className="mt-4 font-bold text-white">Scanning Document for References...</p>
                            <p className="text-sm text-subtext-dark">This may take a moment for large files.</p>
                        </div>
                    ) : suggestions.length > 0 ? (
                        <div className="space-y-4">
                            {suggestions.map(s => <SuggestionCard key={s.id} suggestion={s} onAction={handleSuggestionAction} isProcessed={processedSuggestionIds.has(s.id)} isExisting={checkIsExisting(s.source)} />)}
                        </div>
                    ) : (
                        <div className="w-full bg-card-dark border border-dashed border-border-dark rounded-xl flex flex-col items-center justify-center p-12 text-center">
                            <span className="material-symbols-outlined text-5xl text-subtext-dark">pending</span>
                            <p className="mt-2 font-bold text-white">References will appear here</p>
                            <p className="text-sm text-subtext-dark">Fill out the source details and analyze a document to begin.</p>
                        </div>
                    )}
                </div>
            </div>
            <style>{`
                .modal-input {
                    display: block;
                    width: 100%;
                    resize: vertical;
                    overflow: hidden;
                    border-radius: 0.5rem;
                    border: 1px solid rgba(19, 236, 19, 0.3);
                    background-color: #193319;
                    padding: 0.75rem;
                    font-size: 0.875rem;
                    color: white;
                }
                .modal-input::placeholder {
                    color: rgba(255, 255, 255, 0.5);
                }
                .modal-input:focus {
                    border-color: #13ec13;
                    outline: 0;
                    box-shadow: 0 0 0 2px rgba(19, 236, 19, 0.4);
                }
            `}</style>
        </div>
    );
};

export default TextAnalyzerView;
