// import { GenerativeModel, GenerateContentRequest, GenerateContentResult } from "@google/genai";

interface RetryConfig {
    maxRetries?: number;
    initialDelayMs?: number;
    backoffFactor?: number;
}

/**
 * Generates content with exponential backoff retry logic for 429 errors.
 */
export const generateContentWithRetry = async (
    model: any, // Using any to avoid strict type issues with the GoogleGenAI SDK versions
    params: any,
    config: RetryConfig = {}
): Promise<any> => {
    const {
        maxRetries = 3,
        initialDelayMs = 2000,
        backoffFactor = 2
    } = config;

    let attempt = 0;
    let delay = initialDelayMs;

    while (true) {
        try {
            return await model.generateContent(params);
        } catch (error: any) {
            attempt++;

            // Check if it's a quota error (429) or a server error (503)
            const isQuotaError = error.message?.includes('429') || error.status === 429 || error.code === 429;
            const isServerError = error.message?.includes('503') || error.status === 503;

            if ((isQuotaError || isServerError) && attempt <= maxRetries) {
                console.warn(`AI Request failed (Attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= backoffFactor;
                continue;
            }

            // If we've exhausted retries or it's a different error, throw it
            if (isQuotaError) {
                throw new Error(`AI Service is busy. Please try again in a minute. (Quota Exceeded)`);
            }

            throw error;
        }
    }
};
