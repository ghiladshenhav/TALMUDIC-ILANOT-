import React, { useState } from 'react';
import { BenYehudaAPI, BenYehudaWork } from '../../services/benyehuda-api';
import { UserText, AIFinding } from '../../types';
import { analyzeFullText } from '../../utils/text-analysis';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';

interface BatchImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: () => void;
}

const BatchImportModal: React.FC<BatchImportModalProps> = ({ isOpen, onClose, onImportComplete }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<BenYehudaWork[]>([]);
    const [selectedWorks, setSelectedWorks] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState<{ current: number; total: number; currentTitle: string; stage: string }>({ current: 0, total: 0, currentTitle: '', stage: '' });
    const [error, setError] = useState<string | null>(null);
    const [nextPageToken, setNextPageToken] = useState<string[] | null>(null);
    const [totalResults, setTotalResults] = useState<number>(0);

    if (!isOpen) return null;

    const handleSearch = async (isLoadMore = false) => {
        if (!query.trim()) return;

        setIsLoading(true);
        setError(null);
        try {
            const tokenToUse = isLoadMore ? nextPageToken : undefined;
            if (!isLoadMore) {
                setResults([]);
                setTotalResults(0);
                setNextPageToken(null);
                setSelectedWorks(new Set()); // Reset selection on new search
            }

            const data = await BenYehudaAPI.search(query, tokenToUse || undefined);

            if (isLoadMore) {
                setResults(prev => {
                    const existingIds = new Set(prev.map(p => p.id));
                    const newUniqueWorks = data.works.filter(w => !existingIds.has(w.id));
                    return [...prev, ...newUniqueWorks];
                });
            } else {
                setResults(data.works); // Assuming API doesn't return dups in a single page, but if it does:
                // setResults(Array.from(new Map(data.works.map(w => [w.id, w])).values()));
            }

            setTotalResults(data.total);
            setNextPageToken(data.nextPageToken);
        } catch (err) {
            setError('Failed to search. Please try again.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch(false);
        }
    };

    const toggleSelection = (workId: string) => {
        const newSelection = new Set(selectedWorks);
        if (newSelection.has(workId)) {
            newSelection.delete(workId);
        } else {
            newSelection.add(workId);
        }
        setSelectedWorks(newSelection);
    };

    const handleSelectAll = () => {
        if (selectedWorks.size === results.length) {
            setSelectedWorks(new Set());
        } else {
            const newSelection = new Set<string>();
            results.forEach(w => newSelection.add(w.id));
            setSelectedWorks(newSelection);
        }
    };

    const handleBatchImport = async () => {
        const worksToImport = results.filter(w => selectedWorks.has(w.id));
        if (worksToImport.length === 0) return;

        setIsImporting(true);
        setImportProgress({ current: 0, total: worksToImport.length, currentTitle: '', stage: 'Initializing...' });

        try {
            for (let i = 0; i < worksToImport.length; i++) {
                const work = worksToImport[i];
                setImportProgress({ current: i + 1, total: worksToImport.length, currentTitle: work.title, stage: 'Fetching Text...' });

                // 1. Fetch Text
                let textData;
                try {
                    textData = await BenYehudaAPI.getWorkText(work.id);
                } catch (fetchError) {
                    console.error(`Failed to fetch text for work ${work.id}:`, fetchError);
                    textData = { title: work.title, author: work.author, html: '', text: 'Error fetching text from Ben Yehuda.' };
                }

                const cleanedText = textData.text || (textData.html ? textData.html.replace(/<[^>]*>?/gm, '') : '') || 'No text content available.';

                // 2. Perform AI Analysis
                setImportProgress({ current: i + 1, total: worksToImport.length, currentTitle: work.title, stage: 'Analyzing with AI...' });
                let findings: AIFinding[] = [];
                try {
                    if (cleanedText && cleanedText.length > 100) { // Only analyze if there's substantial text
                        findings = await analyzeFullText(cleanedText, (processed, total) => {
                            // Optional: Could update granular progress here
                        });
                    }
                } catch (aiError) {
                    console.error(`AI Analysis failed for ${work.title}:`, aiError);
                    // Continue without findings
                }

                // Helper to remove undefined values (Firebase doesn't accept them)
                const removeUndefined = (obj: any): any => {
                    if (Array.isArray(obj)) {
                        return obj.map(item => removeUndefined(item));
                    } else if (obj !== null && typeof obj === 'object' && !(obj instanceof Timestamp)) {
                        return Object.fromEntries(
                            Object.entries(obj)
                                .filter(([_, v]) => v !== undefined)
                                .map(([k, v]) => [k, removeUndefined(v)])
                        );
                    }
                    return obj;
                };

                // 3. Create UserText object with 'pending' status
                const newText: Omit<UserText, 'id'> = removeUndefined({
                    title: textData.title || work.title || 'Untitled',
                    author: work.author?.name || textData.author?.name || 'Unknown Author',
                    text: cleanedText,
                    dateAdded: Date.now(),
                    createdAt: Timestamp.now(),
                    status: 'pending',
                    findings: findings,
                    publicationDate: work.period || '',
                    keywords: [work.genre || 'Literature', 'Ben Yehuda Import']
                }) as any;

                // 4. Save to Firestore
                await addDoc(collection(db, 'user_texts'), newText);

                // Small delay
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // All done
            alert(`Successfully imported ${worksToImport.length} texts to the Review Queue.`);
            onImportComplete();
            onClose();

        } catch (err) {
            console.error("Batch import failed:", err);
            setError("Failed to complete batch import. Some texts may not have been saved.");
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-surface-dark border border-border-dark rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-border-dark flex justify-between items-center bg-background-dark rounded-t-xl">
                    <div>
                        <h2 className="text-xl font-bold text-primary font-serif">Batch Import from Ben Yehuda</h2>
                        <p className="text-sm text-subtext-dark">Search for an author and select multiple works to import.</p>
                    </div>
                    {!isImporting && (
                        <button onClick={onClose} className="text-text-muted hover:text-text-dark transition-colors">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    )}
                </div>

                {/* Search Bar */}
                <div className="p-6 border-b border-border-dark bg-surface-dark">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isImporting}
                            placeholder="Search by author (e.g., Bialik, Agnon)..."
                            className="flex-1 bg-background-dark border border-border-dark rounded-lg px-4 py-2 text-text-dark focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                            autoFocus
                        />
                        <button
                            onClick={() => handleSearch(false)}
                            disabled={isLoading || isImporting}
                            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                            {isLoading ? 'Searching...' : 'Search'}
                        </button>
                    </div>
                    {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                </div>

                {/* Results List */}
                <div className="flex-1 overflow-y-auto p-6 bg-surface-dark/50 relative">
                    {isImporting && (
                        <div className="absolute inset-0 z-10 bg-background-dark/90 flex flex-col items-center justify-center">
                            <div className="w-2/3 max-w-md space-y-4 text-center">
                                <span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span>
                                <h3 className="text-xl font-bold text-text-dark">Importing & Analyzing...</h3>
                                <p className="text-subtext-dark">Processing: {importProgress.currentTitle}</p>
                                <p className="text-xs text-primary font-mono bg-primary/10 px-2 py-1 rounded inline-block">
                                    {importProgress.stage}
                                </p>
                                <div className="w-full bg-surface-dark rounded-full h-4 border border-border-dark overflow-hidden">
                                    <div
                                        className="bg-primary h-full transition-all duration-300 ease-out"
                                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                                    />
                                </div>
                                <p className="text-sm font-mono text-primary">
                                    {importProgress.current} / {importProgress.total}
                                </p>
                            </div>
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="mb-4 flex justify-between items-center">
                            <button
                                onClick={handleSelectAll}
                                disabled={isImporting}
                                className="text-sm text-primary hover:underline font-medium"
                            >
                                {selectedWorks.size === results.length ? 'Deselect All' : 'Select All'}
                            </button>
                            <span className="text-sm text-subtext-dark">
                                {selectedWorks.size} selected
                            </span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-2">
                        {results.map((work) => {
                            const isSelected = selectedWorks.has(work.id);
                            return (
                                <div
                                    key={work.id}
                                    onClick={() => !isImporting && toggleSelection(work.id)}
                                    className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${isSelected
                                        ? 'bg-primary/10 border-primary'
                                        : 'bg-background-dark border-border-dark hover:border-primary/30'
                                        } ${isImporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center mr-4 transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-subtext-dark bg-transparent'
                                        }`}>
                                        {isSelected && <span className="material-symbols-outlined text-sm text-white">check</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-md font-bold text-text-dark truncate">{work.title}</h3>
                                        <p className="text-xs text-subtext-dark truncate">{work.author?.name}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {work.genre && <span className="text-xs px-2 py-0.5 bg-surface-dark rounded-full text-text-muted border border-border-dark">{work.genre}</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Load More Button */}
                    {nextPageToken && !isLoading && results.length > 0 && (
                        <div className="flex justify-center pt-6">
                            <button
                                onClick={() => handleSearch(true)}
                                disabled={isLoading || isImporting}
                                className="px-4 py-2 bg-surface-dark border border-border-dark text-text-dark rounded-lg hover:bg-background-dark transition-colors disabled:opacity-50"
                            >
                                Load More Results
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-border-dark bg-background-dark rounded-b-xl flex justify-between items-center">
                    <div className="text-sm text-subtext-dark">
                        {selectedWorks.size > 0 ? `${selectedWorks.size} works ready to import` : 'Select works to import'}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            disabled={isImporting}
                            className="px-4 py-2 text-text-dark hover:bg-surface-dark rounded-lg transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleBatchImport}
                            disabled={selectedWorks.size === 0 || isImporting}
                            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg shadow-primary/20"
                        >
                            {isImporting ? 'Importing...' : `Import ${selectedWorks.size} Works`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BatchImportModal;
