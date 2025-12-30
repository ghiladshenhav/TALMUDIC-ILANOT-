/**
 * Deep Research Service
 * 
 * Leverages Gemini's Deep Research agent for comprehensive
 * Talmudic reception research across web and academic sources.
 */

import {
    startDeepResearch,
    waitForDeepResearch,
    getDeepResearchStatus,
    DeepResearchResult
} from './interactions-client';
import { AIFinding, AIFindingType, AIFindingStatus } from '../types';

export interface ResearchQuery {
    passage: string;         // The Talmudic passage to research
    hebrewText?: string;     // Original Hebrew text
    focusAreas?: string[];   // Optional topics to emphasize
    maxWaitMinutes?: number; // Max time to wait (default: 5)
}

export interface ResearchReport {
    query: string;
    status: 'running' | 'completed' | 'failed';
    findings: AIFinding[];
    rawReport?: string;
    citations?: string[];
    startedAt: Date;
    completedAt?: Date;
}

/**
 * Start a Deep Research task for a Talmudic passage
 * Returns interaction ID for polling
 */
export async function startTalmudicResearch(
    query: ResearchQuery
): Promise<{ interactionId: string; report: ResearchReport }> {
    const researchPrompt = buildResearchPrompt(query);

    const { interactionId } = await startDeepResearch(researchPrompt);

    const report: ResearchReport = {
        query: query.passage,
        status: 'running',
        findings: [],
        startedAt: new Date()
    };

    console.log(`[Deep Research] Started for: "${query.passage.substring(0, 50)}..."`);
    console.log(`[Deep Research] Interaction ID: ${interactionId}`);

    return { interactionId, report };
}

/**
 * Poll for research completion
 */
export async function checkResearchStatus(
    interactionId: string
): Promise<{ status: string; progress?: string }> {
    const result = await getDeepResearchStatus(interactionId);
    return {
        status: result.status,
        progress: result.status === 'running' ? 'Researching...' : undefined
    };
}

/**
 * Wait for research to complete and parse findings
 */
export async function completeResearch(
    interactionId: string,
    originalQuery: ResearchQuery,
    onProgress?: (status: string) => void,
    maxWaitMs: number = 300000
): Promise<ResearchReport> {
    const result = await waitForDeepResearch(
        interactionId,
        onProgress,
        10000, // Poll every 10 seconds
        maxWaitMs
    );

    // Parse the research report
    const findings = parseResearchFindings(result, originalQuery);

    const report: ResearchReport = {
        query: originalQuery.passage,
        status: result.status as any,
        findings,
        rawReport: result.text,
        citations: extractCitations(result.text),
        startedAt: new Date(),
        completedAt: new Date()
    };

    console.log(`[Deep Research] Completed with ${findings.length} findings`);

    return report;
}

/**
 * Build the research prompt for Talmudic reception discovery
 */
function buildResearchPrompt(query: ResearchQuery): string {
    const focusString = query.focusAreas?.length
        ? `Focus areas: ${query.focusAreas.join(', ')}`
        : '';

    return `
You are conducting scholarly research on the reception history of a Talmudic passage.

## Passage to Research:
"${query.passage}"
${query.hebrewText ? `\nOriginal Hebrew/Aramaic:\n${query.hebrewText}` : ''}

## Research Objectives:
1. Find modern scholarly interpretations of this passage
2. Identify philosophical and literary works that reference or allude to this text
3. Discover translations and commentaries across different traditions
4. Locate academic articles and books analyzing this passage
5. Find thematic parallels in other religious or secular literature

${focusString}

## Required Output Format:
For each source found, provide:
- Author name and dates (if available)
- Work title and publication information
- The specific quote or reference
- How it relates to the original passage
- Whether it's an explicit citation or implicit allusion

Organize findings by category:
1. Traditional Commentaries (Rishonim, Acharonim)
2. Modern Academic Scholarship
3. Philosophical Works
4. Literary References
5. Contemporary Applications

Include citations for all sources.
`.trim();
}

/**
 * Parse AI findings from research report
 */
function parseResearchFindings(
    result: DeepResearchResult,
    query: ResearchQuery
): AIFinding[] {
    const findings: AIFinding[] = [];
    const text = result.text || '';

    // Extract structured findings from the report
    // The report is usually in markdown format with sections
    const sections = text.split(/#{1,3}\s/);

    for (const section of sections) {
        const lines = section.split('\n').filter(l => l.trim());

        // Look for author/work patterns
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Pattern: "Author Name - Work Title" or "**Author Name**"
            const authorMatch = line.match(/\*\*([^*]+)\*\*/);
            const workMatch = line.match(/[-–]\s*["""]?([^"""]+)["""]?/);

            if (authorMatch || workMatch) {
                const finding: AIFinding = {
                    id: crypto.randomUUID(),
                    type: AIFindingType.Reference,
                    status: AIFindingStatus.Pending,
                    source: query.passage,
                    snippet: lines.slice(i, i + 3).join(' ').substring(0, 200),
                    confidence: 0.7,
                    author: authorMatch?.[1]?.trim(),
                    workTitle: workMatch?.[1]?.trim() || 'Discovered Work',
                    justification: `Found in Deep Research on "${query.passage}"`,
                    hebrewText: query.hebrewText
                };

                // Avoid duplicates by checking author+work
                const key = `${finding.author}-${finding.workTitle}`;
                if (!findings.some(f => `${f.author}-${f.workTitle}` === key)) {
                    findings.push(finding);
                }
            }
        }
    }

    return findings;
}

/**
 * Extract citations from research report
 */
function extractCitations(text: string): string[] {
    const citations: string[] = [];

    // Look for common citation patterns
    const urlPattern = /https?:\/\/[^\s)]+/g;
    const matches = text.match(urlPattern);
    if (matches) {
        citations.push(...matches);
    }

    return [...new Set(citations)]; // Deduplicate
}

/**
 * Quick research - start and wait for completion
 */
export async function researcTalmudicPassage(
    passage: string,
    options?: Partial<ResearchQuery>
): Promise<ResearchReport> {
    const query: ResearchQuery = {
        passage,
        ...options
    };

    const { interactionId } = await startTalmudicResearch(query);
    return completeResearch(
        interactionId,
        query,
        undefined,
        (query.maxWaitMinutes || 5) * 60 * 1000
    );
}
