import React, { useEffect, useRef, useMemo } from 'react';
import { AIFinding } from '../../types';

interface HighlightableTextProps {
    text: string;
    findings: AIFinding[];
    highlightedFindingId: string | null;
    selectionMode: 'none' | 'resegment' | 'addReference';
    onTextSelected: (selectedText: string) => void;
    onClearHighlight: () => void;
}

interface TextSegment {
    text: string;
    findingId: string | null;
    isHighlighted: boolean;
}

/**
 * Detect if text is primarily RTL (Hebrew/Arabic) or LTR (Latin/German)
 * Returns 'rtl' for Hebrew, 'ltr' for German/English
 */
const detectTextDirection = (text: string): 'rtl' | 'ltr' => {
    if (!text || text.length === 0) return 'ltr';

    // Count Hebrew characters (Unicode range: U+0590 to U+05FF)
    const hebrewPattern = /[\u0590-\u05FF]/g;
    // Count Latin characters (a-z, A-Z, German umlauts, etc.)
    const latinPattern = /[a-zA-ZäöüÄÖÜß]/g;

    const hebrewMatches = text.match(hebrewPattern) || [];
    const latinMatches = text.match(latinPattern) || [];

    // If more Hebrew characters than Latin, use RTL
    return hebrewMatches.length >= latinMatches.length ? 'rtl' : 'ltr';
};

/**
 * HighlightableText component - renders text with interactive highlighting for findings
 * 
 * Features:
 * - Wraps found snippets with highlight markers
 * - Active highlight (clicked finding) has distinct style and scrolls into view
 * - Selection mode for resegmentation and adding references
 */
const HighlightableText: React.FC<HighlightableTextProps> = ({
    text,
    findings,
    highlightedFindingId,
    selectionMode,
    onTextSelected,
    onClearHighlight,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const highlightRef = useRef<HTMLSpanElement>(null);

    // Scroll to highlighted finding when it changes
    useEffect(() => {
        if (highlightedFindingId && highlightRef.current) {
            highlightRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    }, [highlightedFindingId]);

    // Handle text selection
    const handleMouseUp = () => {
        if (selectionMode === 'none') return;

        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();

        if (selectedText && selectedText.length > 0) {
            onTextSelected(selectedText);
            // Clear browser selection
            selection?.removeAllRanges();
        }
    };

    // Build segments with highlights
    const segments = useMemo(() => {
        if (!text || findings.length === 0) {
            return [{ text, findingId: null, isHighlighted: false }];
        }

        // Create normalized version for matching, but keep track of original positions
        // We'll still display original text with its formatting
        const normalizedText = text.replace(/\s+/g, ' ');

        // Build position mapping from normalized to original
        const normalizedToOriginal: number[] = [];
        let origIdx = 0;
        for (let normIdx = 0; normIdx < normalizedText.length; normIdx++) {
            // Skip extra whitespace in original
            while (origIdx < text.length && /\s/.test(text[origIdx]) &&
                origIdx > 0 && /\s/.test(text[origIdx - 1])) {
                origIdx++;
            }
            normalizedToOriginal[normIdx] = origIdx;
            origIdx++;
        }
        normalizedToOriginal.push(text.length); // End marker

        // Build a list of all snippet positions (in normalized text)
        interface SnippetPosition {
            start: number;  // Position in normalized text
            end: number;
            origStart: number;  // Position in original text
            origEnd: number;
            findingId: string;
        }

        const positions: SnippetPosition[] = [];

        for (const finding of findings) {
            if (!finding.snippet) continue;

            const normalizedSnippet = finding.snippet.replace(/\s+/g, ' ').trim();
            let index = normalizedText.indexOf(normalizedSnippet);
            let matchLength = normalizedSnippet.length;

            // If exact match fails, try progressively shorter substrings
            if (index === -1 && normalizedSnippet.length > 20) {
                // Try matching a shorter portion (first 60% of the snippet)
                const shorterSnippet = normalizedSnippet.substring(0, Math.floor(normalizedSnippet.length * 0.6));
                index = normalizedText.indexOf(shorterSnippet);
                if (index !== -1) {
                    matchLength = shorterSnippet.length;
                }
            }

            // If still no match, try the first 30 characters (for very long snippets)
            if (index === -1 && normalizedSnippet.length > 30) {
                const shortStart = normalizedSnippet.substring(0, 30);
                index = normalizedText.indexOf(shortStart);
                if (index !== -1) {
                    matchLength = 30;
                }
            }

            if (index !== -1) {
                positions.push({
                    start: index,
                    end: index + matchLength,
                    origStart: normalizedToOriginal[index] || 0,
                    origEnd: normalizedToOriginal[index + matchLength] || text.length,
                    findingId: finding.id,
                });
            }
        }

        // Sort by start position
        positions.sort((a, b) => a.start - b.start);

        // Remove overlapping positions (keep first occurrence)
        const nonOverlapping: SnippetPosition[] = [];
        let lastEnd = -1;
        for (const pos of positions) {
            if (pos.start >= lastEnd) {
                nonOverlapping.push(pos);
                lastEnd = pos.end;
            }
        }

        // Build segments using ORIGINAL text positions
        const result: TextSegment[] = [];
        let currentIndex = 0;

        for (const pos of nonOverlapping) {
            // Add text before this highlight (from original)
            if (pos.origStart > currentIndex) {
                result.push({
                    text: text.substring(currentIndex, pos.origStart),
                    findingId: null,
                    isHighlighted: false,
                });
            }

            // Add highlighted segment (from original)
            result.push({
                text: text.substring(pos.origStart, pos.origEnd),
                findingId: pos.findingId,
                isHighlighted: pos.findingId === highlightedFindingId,
            });

            currentIndex = pos.origEnd;
        }

        // Add remaining text (from original)
        if (currentIndex < text.length) {
            result.push({
                text: text.substring(currentIndex),
                findingId: null,
                isHighlighted: false,
            });
        }

        return result;
    }, [text, findings, highlightedFindingId]);

    // Cursor style based on selection mode
    const cursorClass = selectionMode !== 'none' ? 'cursor-crosshair select-text' : 'cursor-default';

    return (
        <div className="relative h-full flex flex-col">
            {/* Selection mode indicator */}
            {selectionMode !== 'none' && (
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-2 bg-primary/20 border-b border-primary/30 rounded-t-lg">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary animate-pulse">target</span>
                        <span className="text-sm font-medium text-primary">
                            {selectionMode === 'resegment'
                                ? 'Select text to update the reference boundaries'
                                : 'Select text to create a new reference'}
                        </span>
                    </div>
                    <button
                        onClick={onClearHighlight}
                        className="px-2 py-1 text-xs font-medium text-primary/70 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {/* Text container - automatically detects Hebrew (RTL) vs German (LTR) */}
            <div
                ref={containerRef}
                className={`flex-1 overflow-y-auto p-4 font-serif text-lg leading-relaxed text-white/90 whitespace-pre-line ${detectTextDirection(text) === 'rtl' ? 'text-right' : 'text-left'} ${cursorClass}`}
                dir={detectTextDirection(text)}
                onMouseUp={handleMouseUp}
            >
                {segments.map((segment, idx) => {
                    if (segment.findingId) {
                        const isActive = segment.isHighlighted;
                        return (
                            <span
                                key={`${segment.findingId}-${idx}`}
                                ref={isActive ? highlightRef : null}
                                className={`
                                    transition-all duration-300 rounded px-0.5
                                    ${isActive
                                        ? 'bg-yellow-400/80 text-gray-900 ring-2 ring-yellow-300 animate-pulse'
                                        : 'bg-primary/20 hover:bg-primary/30 border-b border-primary/40'
                                    }
                                `}
                                title={`Finding: ${segment.findingId.substring(0, 8)}...`}
                            >
                                {segment.text}
                            </span>
                        );
                    }
                    return <span key={idx}>{segment.text}</span>;
                })}
            </div>

            {/* Highlight count badge */}
            {findings.length > 0 && (
                <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-card-dark/90 border border-border-dark rounded-full text-xs text-subtext-dark shadow-lg">
                    <span className="font-bold text-primary">{findings.filter(f => f.snippet && text.includes(f.snippet.replace(/\s+/g, ' ').substring(0, 50))).length}</span>
                    <span> references highlighted</span>
                </div>
            )}
        </div>
    );
};

export default HighlightableText;
