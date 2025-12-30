import React, { useState } from 'react';
import { BenYehudaAPI, BenYehudaWork } from '../../services/benyehuda-api';

interface BenYehudaSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (workId: string, title: string) => void;
}

const BenYehudaSearchModal: React.FC<BenYehudaSearchModalProps> = ({ isOpen, onClose, onImport }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<BenYehudaWork[]>([]);
    const [isLoading, setIsLoading] = useState(false);
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
            // If new search, clear previous results immediately
            if (!isLoadMore) {
                setResults([]);
                setTotalResults(0);
                setNextPageToken(null);
            }

            const data = await BenYehudaAPI.search(query, tokenToUse || undefined);

            if (isLoadMore) {
                setResults(prev => [...prev, ...data.works]);
            } else {
                setResults(data.works);
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-surface-dark border border-border-dark rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-border-dark flex justify-between items-center bg-background-dark rounded-t-xl">
                    <h2 className="text-xl font-bold text-primary font-serif">Import from Ben Yehuda</h2>
                    <button onClick={onClose} className="text-text-muted hover:text-text-dark transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Search Bar */}
                <div className="p-6 border-b border-border-dark bg-surface-dark">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search by author or title (e.g., Bialik, Agnon)..."
                            className="flex-1 bg-background-dark border border-border-dark rounded-lg px-4 py-2 text-text-dark focus:outline-none focus:border-primary transition-colors"
                            autoFocus
                        />
                        <button
                            onClick={() => handleSearch(false)}
                            disabled={isLoading}
                            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                            {isLoading && results.length === 0 ? 'Searching...' : 'Search'}
                        </button>
                    </div>
                    {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                    {totalResults > 0 && (
                        <p className="text-text-muted text-sm mt-2">
                            Showing {results.length} of {totalResults} results
                        </p>
                    )}
                </div>

                {/* Results List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-surface-dark/50">
                    {results.length === 0 && !isLoading && !error && (
                        <div className="text-center text-text-muted py-10">
                            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">search</span>
                            <p>Enter a search term to find works.</p>
                        </div>
                    )}

                    {Array.isArray(results) && results.map((work) => (
                        <div key={work.id} className="flex items-center justify-between p-4 bg-background-dark border border-border-dark rounded-lg hover:border-primary/50 transition-colors group">
                            <div className="flex-1 min-w-0 mr-4">
                                <h3 className="text-lg font-bold text-text-dark truncate font-serif">{work.title}</h3>
                                <p className="text-sm text-text-muted truncate">{work.author?.name || 'Unknown Author'}</p>
                                <div className="flex gap-2 mt-1">
                                    {work.genre && <span className="text-xs px-2 py-0.5 bg-surface-dark rounded-full text-text-muted border border-border-dark">{work.genre}</span>}
                                    {work.period && <span className="text-xs px-2 py-0.5 bg-surface-dark rounded-full text-text-muted border border-border-dark">{work.period}</span>}
                                </div>
                            </div>
                            <button
                                onClick={() => onImport(work.id, work.title)}
                                className="px-4 py-2 bg-surface-dark border border-border-dark text-primary rounded-lg hover:bg-primary hover:text-primary-foreground transition-all opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0"
                            >
                                Import
                            </button>
                        </div>
                    ))}

                    {/* Load More Button */}
                    {nextPageToken && (
                        <div className="flex justify-center pt-4">
                            <button
                                onClick={() => handleSearch(true)}
                                disabled={isLoading}
                                className="px-4 py-2 bg-surface-dark border border-border-dark text-text-dark rounded-lg hover:bg-background-dark transition-colors disabled:opacity-50"
                            >
                                {isLoading ? 'Loading...' : 'Load More'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BenYehudaSearchModal;
