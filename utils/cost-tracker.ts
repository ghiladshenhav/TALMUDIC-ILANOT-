/**
 * Cost Tracker Utility
 * 
 * Tracks LLM API usage in IndexedDB for cost analysis and autonomy metrics.
 * Uses gemini-2.5-flash pricing: Input $0.075/1M, Output $0.30/1M
 */

// ========================================
// TYPES
// ========================================

export type ApiUsageType =
    | 'scanner'         // First pass of Hypothesis Scanner
    | 'librarian'       // Second pass (verification)
    | 'standard'        // Standard single-pass analysis
    | 'embedding'       // Embedding generation for RAG
    | 'rag_search'      // RAG query (search only, no LLM)
    | 'gt_skipped'      // Skipped due to Ground Truth pre-filter
    | 'cache_hit';      // Skipped due to semantic cache

export interface ApiUsageLog {
    id: string;
    timestamp: Date;
    type: ApiUsageType;
    model: string;
    inputTokens: number;
    outputTokens: number;
    isCached: boolean;      // Was this a cache hit or GT skip?
    estimatedCost: number;  // USD
}

export interface CostSummary {
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCalls: number;
    cachedCalls: number;        // Calls avoided via cache/GT
    autonomyScore: number;      // % of calls handled without LLM (0-100)
    byType: Record<ApiUsageType, { calls: number; cost: number; tokens: number }>;
}

export type TimeRange = 'today' | 'week' | 'month' | 'all';

// ========================================
// PRICING (gemini-2.5-flash)
// ========================================

const PRICING = {
    'gemini-2.5-flash': {
        inputPerMillion: 0.075,   // $0.075 per 1M input tokens
        outputPerMillion: 0.30    // $0.30 per 1M output tokens
    },
    'text-embedding-004': {
        inputPerMillion: 0.00,    // Embeddings are free (billed separately)
        outputPerMillion: 0.00
    }
} as const;

// ========================================
// INDEXEDDB SETUP
// ========================================

const DB_NAME = 'talmudic-cost-tracker';
const DB_VERSION = 1;
const STORE_NAME = 'usage_logs';

let dbInstance: IDBDatabase | null = null;

async function openDatabase(): Promise<IDBDatabase> {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('type', 'type', { unique: false });
            }
        };
    });
}

// ========================================
// CORE API
// ========================================

/**
 * Log an API usage event
 */
export async function logApiUsage(
    type: ApiUsageType,
    model: string,
    inputTokens: number,
    outputTokens: number,
    isCached: boolean = false
): Promise<void> {
    try {
        const db = await openDatabase();

        // Calculate cost
        const pricing = PRICING[model as keyof typeof PRICING] || PRICING['gemini-2.5-flash'];
        const estimatedCost = isCached ? 0 : (
            (inputTokens / 1_000_000) * pricing.inputPerMillion +
            (outputTokens / 1_000_000) * pricing.outputPerMillion
        );

        const log: ApiUsageLog = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            timestamp: new Date(),
            type,
            model,
            inputTokens: isCached ? 0 : inputTokens,
            outputTokens: isCached ? 0 : outputTokens,
            isCached,
            estimatedCost
        };

        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.add(log);

        console.log(`[Cost Tracker] Logged: ${type}, tokens: ${inputTokens}/${outputTokens}, cost: $${estimatedCost.toFixed(6)}, cached: ${isCached}`);
    } catch (error) {
        console.error('[Cost Tracker] Failed to log usage:', error);
    }
}

/**
 * Get cost summary for a time range
 */
export async function getCostSummary(timeRange: TimeRange = 'all'): Promise<CostSummary> {
    const db = await openDatabase();

    // Calculate time filter
    const now = new Date();
    let startTime: Date;

    switch (timeRange) {
        case 'today':
            startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case 'week':
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            startTime = new Date(0);
    }

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            const allLogs: ApiUsageLog[] = request.result;

            // Filter by time range
            const logs = allLogs.filter(log => {
                const logTime = new Date(log.timestamp);
                return logTime >= startTime;
            });

            // Build summary
            const summary: CostSummary = {
                totalCost: 0,
                totalInputTokens: 0,
                totalOutputTokens: 0,
                totalCalls: logs.length,
                cachedCalls: 0,
                autonomyScore: 0,
                byType: {
                    scanner: { calls: 0, cost: 0, tokens: 0 },
                    librarian: { calls: 0, cost: 0, tokens: 0 },
                    standard: { calls: 0, cost: 0, tokens: 0 },
                    embedding: { calls: 0, cost: 0, tokens: 0 },
                    rag_search: { calls: 0, cost: 0, tokens: 0 },
                    gt_skipped: { calls: 0, cost: 0, tokens: 0 },
                    cache_hit: { calls: 0, cost: 0, tokens: 0 }
                }
            };

            for (const log of logs) {
                summary.totalCost += log.estimatedCost;
                summary.totalInputTokens += log.inputTokens;
                summary.totalOutputTokens += log.outputTokens;

                if (log.isCached) {
                    summary.cachedCalls++;
                }

                // Aggregate by type
                if (summary.byType[log.type]) {
                    summary.byType[log.type].calls++;
                    summary.byType[log.type].cost += log.estimatedCost;
                    summary.byType[log.type].tokens += log.inputTokens + log.outputTokens;
                }
            }

            // Calculate autonomy score (% of calls that didn't need LLM)
            if (summary.totalCalls > 0) {
                summary.autonomyScore = (summary.cachedCalls / summary.totalCalls) * 100;
            }

            resolve(summary);
        };
    });
}

/**
 * Get recent usage logs
 */
export async function getRecentLogs(limit: number = 50): Promise<ApiUsageLog[]> {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const request = index.openCursor(null, 'prev'); // Descending order

        const results: ApiUsageLog[] = [];

        request.onerror = () => reject(request.error);

        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

            if (cursor && results.length < limit) {
                results.push(cursor.value);
                cursor.continue();
            } else {
                resolve(results);
            }
        };
    });
}

/**
 * Clear all usage logs (for debugging/reset)
 */
export async function clearUsageLogs(): Promise<void> {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            console.log('[Cost Tracker] All usage logs cleared');
            resolve();
        };
    });
}
