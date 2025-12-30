/**
 * Deep Research Panel Component
 * 
 * UI for initiating and viewing Gemini Deep Research results
 * for Talmudic reception discovery.
 */

import React, { useState, useCallback } from 'react';
import {
    startTalmudicResearch,
    completeResearch,
    ResearchReport
} from '../../services/deep-research-service';
import { AIFinding } from '../../types';

interface DeepResearchPanelProps {
    initialPassage?: string;
    hebrewText?: string;
    onFindingsDiscovered?: (findings: AIFinding[]) => void;
    onClose?: () => void;
}

const DeepResearchPanel: React.FC<DeepResearchPanelProps> = ({
    initialPassage = '',
    hebrewText,
    onFindingsDiscovered,
    onClose
}) => {
    const [passage, setPassage] = useState(initialPassage);
    const [focusAreas, setFocusAreas] = useState('');
    const [isResearching, setIsResearching] = useState(false);
    const [status, setStatus] = useState<string>('');
    const [report, setReport] = useState<ResearchReport | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleStartResearch = useCallback(async () => {
        if (!passage.trim()) {
            setError('Please enter a passage to research');
            return;
        }

        setIsResearching(true);
        setError(null);
        setStatus('Initiating Deep Research...');
        setReport(null);

        try {
            const { interactionId } = await startTalmudicResearch({
                passage: passage.trim(),
                hebrewText,
                focusAreas: focusAreas.split(',').map(s => s.trim()).filter(Boolean)
            });

            setStatus('Research in progress. This may take a few minutes...');

            // Wait for completion with progress updates
            const finalReport = await completeResearch(
                interactionId,
                { passage: passage.trim(), hebrewText },
                (progressStatus) => setStatus(progressStatus),
                300000 // 5 minutes max
            );

            setReport(finalReport);
            setStatus(`Completed! Found ${finalReport.findings.length} references.`);

            // Notify parent of findings
            if (onFindingsDiscovered && finalReport.findings.length > 0) {
                onFindingsDiscovered(finalReport.findings);
            }
        } catch (err) {
            console.error('[DeepResearch] Error:', err);
            setError(err instanceof Error ? err.message : 'Research failed');
            setStatus('');
        } finally {
            setIsResearching(false);
        }
    }, [passage, hebrewText, focusAreas, onFindingsDiscovered]);

    return (
        <div className="flex flex-col h-full bg-background-dark text-text-dark">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border-dark">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">psychology_alt</span>
                    <h2 className="text-lg font-bold">Deep Research</h2>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-surface-dark transition-colors"
                    >
                        <span className="material-symbols-outlined text-text-muted">close</span>
                    </button>
                )}
            </div>

            {/* Input Section */}
            <div className="p-4 space-y-4 border-b border-border-dark">
                <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">
                        Talmudic Passage or Topic
                    </label>
                    <textarea
                        value={passage}
                        onChange={(e) => setPassage(e.target.value)}
                        placeholder="e.g., 'The Oven of Akhnai' or 'Bavli Bava Metzia 59b'"
                        className="w-full h-24 px-3 py-2 bg-surface-dark border border-border-dark rounded-lg text-text-dark placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                        disabled={isResearching}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">
                        Focus Areas (optional, comma-separated)
                    </label>
                    <input
                        type="text"
                        value={focusAreas}
                        onChange={(e) => setFocusAreas(e.target.value)}
                        placeholder="e.g., philosophy, poetry, 19th century scholarship"
                        className="w-full px-3 py-2 bg-surface-dark border border-border-dark rounded-lg text-text-dark placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                        disabled={isResearching}
                    />
                </div>

                <button
                    onClick={handleStartResearch}
                    disabled={isResearching || !passage.trim()}
                    className={`w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all
                        ${isResearching
                            ? 'bg-primary/50 cursor-not-allowed'
                            : 'bg-primary hover:bg-primary-hover text-background-dark'
                        }`}
                >
                    {isResearching ? (
                        <>
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            <span>Researching...</span>
                        </>
                    ) : (
                        <>
                            <span className="material-symbols-outlined">search</span>
                            <span>Start Deep Research</span>
                        </>
                    )}
                </button>
            </div>

            {/* Status */}
            {status && (
                <div className="px-4 py-3 bg-surface-dark border-b border-border-dark">
                    <div className="flex items-center gap-2 text-text-muted">
                        {isResearching && (
                            <span className="material-symbols-outlined text-primary animate-pulse">hourglass_empty</span>
                        )}
                        <span className="text-sm">{status}</span>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="px-4 py-3 bg-error/10 border-b border-error/30">
                    <div className="flex items-center gap-2 text-error">
                        <span className="material-symbols-outlined">error</span>
                        <span className="text-sm">{error}</span>
                    </div>
                </div>
            )}

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-4">
                {report && (
                    <div className="space-y-4">
                        {/* Summary */}
                        <div className="p-4 bg-surface-dark rounded-lg border border-border-dark">
                            <h3 className="font-bold text-primary mb-2">Research Summary</h3>
                            <p className="text-sm text-text-muted">
                                Found {report.findings.length} scholarly references and interpretations
                            </p>
                            {report.citations && report.citations.length > 0 && (
                                <p className="text-xs text-text-muted mt-1">
                                    {report.citations.length} source URLs cited
                                </p>
                            )}
                        </div>

                        {/* Findings List */}
                        <div className="space-y-3">
                            <h3 className="font-medium text-text-dark">Discovered References</h3>
                            {report.findings.length === 0 ? (
                                <p className="text-sm text-text-muted">
                                    No specific references extracted. Check the raw report below.
                                </p>
                            ) : (
                                report.findings.map((finding, index) => (
                                    <div
                                        key={finding.id}
                                        className="p-3 bg-surface-dark rounded-lg border border-border-dark hover:border-primary/50 transition-colors"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h4 className="font-bold text-text-dark">
                                                    {finding.workTitle || 'Untitled Work'}
                                                </h4>
                                                <p className="text-sm text-primary">
                                                    {finding.author || 'Unknown Author'}
                                                </p>
                                            </div>
                                            <span className="text-xs px-2 py-1 bg-primary/20 text-primary rounded">
                                                #{index + 1}
                                            </span>
                                        </div>
                                        <p className="text-sm text-text-muted mt-2 line-clamp-3">
                                            {finding.snippet || finding.justification}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Raw Report */}
                        {report.rawReport && (
                            <details className="mt-4">
                                <summary className="text-sm text-text-muted cursor-pointer hover:text-primary">
                                    View Raw Research Report
                                </summary>
                                <div className="mt-2 p-4 bg-surface-dark rounded-lg border border-border-dark max-h-96 overflow-y-auto">
                                    <pre className="text-xs text-text-muted whitespace-pre-wrap break-words">
                                        {report.rawReport}
                                    </pre>
                                </div>
                            </details>
                        )}
                    </div>
                )}

                {/* Empty State */}
                {!report && !isResearching && (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <span className="material-symbols-outlined text-6xl text-primary/30 mb-4">
                            travel_explore
                        </span>
                        <h3 className="text-lg font-medium text-text-muted mb-2">
                            Explore Reception History
                        </h3>
                        <p className="text-sm text-text-muted/60 max-w-sm">
                            Enter a Talmudic passage to discover scholarly interpretations,
                            philosophical connections, and literary references across centuries.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DeepResearchPanel;
