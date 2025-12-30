/**
 * Rate Limiter Utility
 * Prevents API rate limit errors by spacing out requests.
 */

/**
 * Simple rate limiter that enforces a minimum delay between requests.
 */
export class RateLimiter {
    private requestsPerMinute: number;
    private minDelayMs: number;
    private lastRequestTime: number = 0;
    private queue: (() => void)[] = [];
    private processing: boolean = false;

    constructor(requestsPerMinute: number = 60) {
        this.requestsPerMinute = requestsPerMinute;
        this.minDelayMs = Math.ceil(60000 / requestsPerMinute);
    }

    /**
     * Wait for a slot to become available before making a request.
     * This ensures requests are spaced out to stay under the rate limit.
     */
    async waitForSlot(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.minDelayMs) {
            const waitTime = this.minDelayMs - timeSinceLastRequest;
            console.log(`[RateLimiter] Waiting ${waitTime}ms before next request...`);
            await this.delay(waitTime);
        }

        this.lastRequestTime = Date.now();
    }

    /**
     * Get the current queue length (for UI display).
     */
    getQueueLength(): number {
        return this.queue.length;
    }

    /**
     * Get the minimum delay between requests in milliseconds.
     */
    getMinDelayMs(): number {
        return this.minDelayMs;
    }

    /**
     * Update the rate limit.
     */
    setRequestsPerMinute(rpm: number): void {
        this.requestsPerMinute = rpm;
        this.minDelayMs = Math.ceil(60000 / rpm);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Default rate limiter for Gemini API.
 * Conservative limit of 30 RPM to leave headroom for other operations.
 */
export const geminiRateLimiter = new RateLimiter(30);

/**
 * Rate limiter for embedding generation (Pinecone/Gemini embeddings).
 * Higher limit since these are lighter operations.
 */
export const embeddingRateLimiter = new RateLimiter(100);
