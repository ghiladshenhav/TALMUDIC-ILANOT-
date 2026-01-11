/**
 * Ground Truth Pre-Filter
 * 
 * Uses existing embedding-based similarity search to decide whether to skip LLM calls.
 * If a chunk matches known REJECT patterns with high confidence, skip the expensive LLM.
 * If a chunk matches known APPROVE patterns, auto-add the finding.
 */

import { searchGroundTruthByRelevance, GroundTruthCandidate } from './rag-search';
import { AIFinding, AIFindingType, AIFindingStatus } from '../types';

// Thresholds for decision-making
const REJECT_CONFIDENCE_THRESHOLD = 0.85;  // Must be very confident to skip LLM
const APPROVE_CONFIDENCE_THRESHOLD = 0.90; // Must be even more confident to auto-add

export interface PrefilterResult {
    /** If true, skip the LLM call for this chunk */
    shouldSkipLLM: boolean;
    /** Reason for the decision (for logging) */
    reason?: string;
    /** Auto-generated findings from APPROVE matches */
    autoFindings: AIFinding[];
    /** Phrases that matched high-confidence REJECT patterns */
    matchedRejects: string[];
    /** Stats for logging */
    stats: {
        totalGTExamples: number;
        highConfidenceRejects: number;
        highConfidenceApproves: number;
    };
}

/**
 * Pre-filter a text chunk using Ground Truth semantic search.
 * This runs BEFORE the LLM to potentially skip expensive API calls.
 * 
 * Decision logic:
 * 1. Fetch GT examples semantically similar to this chunk
 * 2. If high-confidence REJECT examples dominate AND no APPROVE → skip LLM
 * 3. If high-confidence APPROVE examples found → auto-add findings
 * 4. Otherwise → proceed to LLM
 */
export async function prefilterWithGroundTruth(
    chunk: string,
    userId: string
): Promise<PrefilterResult> {
    const result: PrefilterResult = {
        shouldSkipLLM: false,
        autoFindings: [],
        matchedRejects: [],
        stats: {
            totalGTExamples: 0,
            highConfidenceRejects: 0,
            highConfidenceApproves: 0
        }
    };

    try {
        // Use existing GT semantic search (already uses embeddings)
        const gtExamples = await searchGroundTruthByRelevance(chunk, userId, 10);
        result.stats.totalGTExamples = gtExamples.length;

        if (gtExamples.length === 0) {
            // No GT data yet - must use LLM
            return result;
        }

        // Categorize by action and confidence
        const highConfidenceRejects: GroundTruthCandidate[] = [];
        const highConfidenceApproves: GroundTruthCandidate[] = [];

        for (const gt of gtExamples) {
            if (gt.action === 'REJECT' && gt.score >= REJECT_CONFIDENCE_THRESHOLD) {
                highConfidenceRejects.push(gt);
                result.matchedRejects.push(gt.phrase);
            } else if (gt.action === 'APPROVE' && gt.score >= APPROVE_CONFIDENCE_THRESHOLD) {
                highConfidenceApproves.push(gt);
            }
        }

        result.stats.highConfidenceRejects = highConfidenceRejects.length;
        result.stats.highConfidenceApproves = highConfidenceApproves.length;

        // Decision 1: If high-confidence APPROVE patterns found, create auto-findings
        if (highConfidenceApproves.length > 0) {
            for (const gt of highConfidenceApproves) {
                const autoFinding: AIFinding = {
                    id: crypto.randomUUID(),
                    type: AIFindingType.Reference,
                    source: gt.correctSource,
                    snippet: gt.snippet || gt.phrase,
                    confidence: gt.score,
                    status: AIFindingStatus.Pending,
                    justification: `Auto-detected from Ground Truth: "${gt.phrase}" → ${gt.correctSource}`,
                    isImplicit: true,
                    // Flag that this came from GT pre-filter
                    isGroundTruth: true,
                    addedManually: false
                };
                result.autoFindings.push(autoFinding);
            }
            console.log(`[GT Pre-filter] ✅ Auto-added ${highConfidenceApproves.length} findings from APPROVE patterns`);
        }

        // Decision 2: If ONLY high-confidence REJECT patterns and NO approves, skip LLM
        // This is conservative - we only skip if we're very confident there's nothing to find
        if (highConfidenceRejects.length >= 2 && highConfidenceApproves.length === 0) {
            // Additional check: the reject patterns should cover significant portions
            const rejectPhrases = highConfidenceRejects.map(r => r.phrase).join(' ');
            const coverageRatio = rejectPhrases.length / chunk.length;

            if (coverageRatio > 0.3) { // At least 30% of chunk covered by known rejects
                result.shouldSkipLLM = true;
                result.reason = `${highConfidenceRejects.length} high-confidence REJECT patterns matched (coverage: ${(coverageRatio * 100).toFixed(0)}%)`;
                console.log(`[GT Pre-filter] ⏭️ Skipping LLM: ${result.reason}`);
            }
        }

        return result;

    } catch (error) {
        console.error('[GT Pre-filter] Error:', error);
        // On error, don't skip - let LLM handle it
        return result;
    }
}

/**
 * Check if GT pre-filtering is available for a user.
 * Requires Pinecone to be configured and user to have GT examples.
 */
export function isPrefilterAvailable(): boolean {
    return !!import.meta.env.VITE_PINECONE_API_KEY;
}
