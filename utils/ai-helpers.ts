// import { GenerativeModel, GenerateContentRequest, GenerateContentResult } from "@google/genai";

import { performTesseractOCR, performPdfOCR, OCRLanguage } from './tesseract-ocr';

interface RetryConfig {
    maxRetries?: number;
    initialDelayMs?: number;
    backoffFactor?: number;
}

/**
 * OCR Provider options - Tesseract is FREE, Gemini costs API tokens
 */
export type OCRProvider = 'tesseract' | 'gemini';

/**
 * OCR Options for unified interface
 */
export interface OCROptions {
    /** OCR provider: 'tesseract' (free) or 'gemini' (paid, better quality) */
    provider?: OCRProvider;
    /** Language for Tesseract OCR. Ignored for Gemini. */
    language?: OCRLanguage;
    /** Progress callback */
    onProgress?: (message: string) => void;
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

/**
 * Uploads a file to Google Gemini API.
 * @deprecated Consider using Tesseract OCR instead to save API costs.
 */
export const uploadFileToGemini = async (
    file: File | Blob,
    mimeType: string = 'text/plain',
    displayName?: string
): Promise<{ uri: string; mimeType: string }> => {
    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

        const metadata = {
            file: {
                display_name: displayName || 'Uploaded File',
                mime_type: mimeType
            }
        };

        // 1. Start Resumable Upload
        const startUploadResp = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'X-Goog-Upload-Protocol': 'resumable',
                    'X-Goog-Upload-Command': 'start',
                    'X-Goog-Upload-Header-Content-Length': file.size.toString(),
                    'X-Goog-Upload-Header-Content-Type': mimeType,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(metadata)
            }
        );

        if (!startUploadResp.ok) {
            throw new Error(`Failed to start upload: ${startUploadResp.statusText}`);
        }

        const uploadUrl = startUploadResp.headers.get('X-Goog-Upload-URL');
        if (!uploadUrl) {
            throw new Error('No upload URL received');
        }

        // 2. Upload Actual Bytes
        const uploadResp = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'upload, finalize',
                'X-Goog-Upload-Offset': '0',
                'Content-Length': file.size.toString(),
            },
            body: file
        });

        if (!uploadResp.ok) {
            throw new Error(`Failed to upload file content: ${uploadResp.statusText}`);
        }

        const result = await uploadResp.json();
        const fileUri = result.file.uri;

        console.log(`File uploaded successfully: ${fileUri}`);
        return { uri: fileUri, mimeType };

    } catch (error) {
        console.error("Error uploading file to Gemini:", error);
        throw error;
    }
};

/**
 * Performs OCR on a file using Gemini Vision.
 * ⚠️ COSTS API TOKENS - Consider using performOCR() with provider: 'tesseract' instead.
 * @deprecated Use performOCR() with options.provider = 'tesseract' for free OCR
 */
export const performGeminiOCR = async (file: File): Promise<string> => {
    console.log(`[Gemini OCR] Starting OCR for ${file.name}... (⚠️ This costs API tokens)`);
    try {
        const { uri, mimeType } = await uploadFileToGemini(file, file.type || 'image/png');

        // Dynamic import to avoid top-level SDK issues if any
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

        const prompt = "Transcribe the text in this document exactly as it appears. The document may contain mixed languages, including German (Fraktur/Gothic script) and Hebrew. Ensure distinct handling of both scripts. Preserve layout where possible. Do not add any commentary. Return ONLY the transcribed text.";

        const result = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [
                { role: 'user', parts: [{ text: prompt }, { fileData: { fileUri: uri, mimeType: mimeType } }] }
            ]
        });

        // Safe extraction for @google/genai SDK response
        if (result.candidates && result.candidates.length > 0 && result.candidates[0].content?.parts?.[0]?.text) {
            return result.candidates[0].content.parts[0].text;
        }
        return "";
    } catch (error) {
        console.error("Gemini OCR failed:", error);
        throw error;
    }
};

/**
 * Unified OCR function - DEFAULTS TO FREE TESSERACT.
 * Use options.provider = 'gemini' for higher quality (but costs API tokens).
 * 
 * @param file - Image or PDF file to OCR
 * @param options - OCR options including provider and language
 * @returns Extracted text
 */
export const performOCR = async (
    file: File,
    options: OCROptions = {}
): Promise<string> => {
    const {
        provider = 'tesseract',  // Default to FREE Tesseract
        language = 'heb+deu',
        onProgress
    } = options;

    console.log(`[OCR] Using ${provider} provider for ${file.name}`);

    if (provider === 'gemini') {
        // User explicitly chose Gemini - they accept the cost
        return performGeminiOCR(file);
    }

    // Default: Free Tesseract OCR
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPDF) {
        return performPdfOCR(file, language, onProgress);
    } else {
        const result = await performTesseractOCR(file, language, (progress) => {
            onProgress?.(`${progress.status} (${progress.progress}%)`);
        });
        return result.text;
    }
};

// Re-export for backwards compatibility
// Old code calling performOCR will now use Tesseract by default
