/**
 * Tesseract OCR Service - Free, browser-based OCR
 * 
 * Supports:
 * - Hebrew (heb)
 * - German modern (deu)
 * - German Fraktur/Gothic (frk)
 * 
 * Replaces expensive Gemini Vision OCR to reduce API costs.
 */

import Tesseract, { createWorker, Worker, RecognizeResult } from 'tesseract.js';

export type OCRLanguage = 'heb' | 'deu' | 'frk' | 'heb+deu' | 'heb+frk' | 'deu+frk' | 'heb+deu+frk';

interface OCRProgress {
    status: string;
    progress: number;
}

interface OCRResult {
    text: string;
    confidence: number;
    language: OCRLanguage;
    processingTimeMs: number;
}

// Worker cache to avoid re-initialization
let cachedWorker: Worker | null = null;
let cachedLanguage: OCRLanguage | null = null;

/**
 * Initialize or get cached Tesseract worker for the specified language.
 * First call downloads language models (~10-30MB depending on languages).
 */
async function getWorker(
    language: OCRLanguage,
    progressCallback?: (progress: OCRProgress) => void
): Promise<Worker> {
    // If we have a cached worker with the same language, reuse it
    if (cachedWorker && cachedLanguage === language) {
        return cachedWorker;
    }

    // Terminate old worker if language changed
    if (cachedWorker) {
        await cachedWorker.terminate();
        cachedWorker = null;
    }

    console.log(`[Tesseract] Initializing worker for language: ${language}`);

    const worker = await createWorker(language, 1, {
        logger: (m) => {
            if (progressCallback && m.status && typeof m.progress === 'number') {
                progressCallback({
                    status: m.status,
                    progress: Math.round(m.progress * 100)
                });
            }
            // Debug logging
            if (m.status === 'loading language traineddata') {
                console.log(`[Tesseract] Downloading ${language} model: ${Math.round(m.progress * 100)}%`);
            }
        }
    });

    cachedWorker = worker;
    cachedLanguage = language;

    return worker;
}

/**
 * Perform OCR on an image or PDF file.
 * 
 * @param file - Image (PNG, JPEG, etc.) or single-page PDF
 * @param language - OCR language(s). Use '+' for multiple: 'heb+deu'
 * @param progressCallback - Optional callback for progress updates
 * @returns OCR result with text, confidence, and timing
 */
export async function performTesseractOCR(
    file: File | Blob,
    language: OCRLanguage = 'heb',
    progressCallback?: (progress: OCRProgress) => void
): Promise<OCRResult> {
    const startTime = Date.now();

    console.log(`[Tesseract] Starting OCR for file: ${(file as File).name || 'blob'}, language: ${language}`);

    try {
        const worker = await getWorker(language, progressCallback);

        // Convert file to image URL for Tesseract
        const imageUrl = URL.createObjectURL(file);

        progressCallback?.({ status: 'Recognizing text...', progress: 50 });

        const result: RecognizeResult = await worker.recognize(imageUrl);

        // Clean up object URL
        URL.revokeObjectURL(imageUrl);

        const processingTimeMs = Date.now() - startTime;

        console.log(`[Tesseract] OCR complete. Confidence: ${result.data.confidence}%, Time: ${processingTimeMs}ms`);

        return {
            text: result.data.text,
            confidence: result.data.confidence,
            language,
            processingTimeMs
        };

    } catch (error) {
        console.error('[Tesseract] OCR failed:', error);
        throw new Error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Perform OCR on a multi-page PDF.
 * Converts each page to image and runs OCR sequentially.
 * 
 * @param pdfFile - PDF file to process
 * @param language - OCR language(s)
 * @param progressCallback - Progress updates including page number
 * @returns Combined text with [[PAGE_X]] markers
 */
export async function performPdfOCR(
    pdfFile: File,
    language: OCRLanguage = 'heb+deu',
    progressCallback?: (message: string) => void
): Promise<string> {
    console.log(`[Tesseract] Starting PDF OCR for: ${pdfFile.name}`);
    progressCallback?.('Loading PDF...');

    // Import pdfjs from pdf-helpers which already has the worker properly configured
    // This avoids the CDN fallback issue
    const pdfjsLib = await import('pdfjs-dist');
    const pdfWorkerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');

    // Ensure worker is set before any PDF operations
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerModule.default;
    }

    // Load PDF
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;

    console.log(`[Tesseract] PDF has ${numPages} pages`);

    const allText: string[] = [];
    const worker = await getWorker(language);

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        progressCallback?.(`Processing page ${pageNum}/${numPages}...`);

        try {
            // Get page (using 'any' due to pdfjs-dist type inconsistencies)
            const page: any = await pdf.getPage(pageNum);

            // Render page to canvas at 2x scale for better OCR
            const scale = 2.0;
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d')!;
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // Convert canvas to blob
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((b) => {
                    if (b) resolve(b);
                    else reject(new Error('Failed to create blob from canvas'));
                }, 'image/png');
            });

            // Run OCR on this page
            const imageUrl = URL.createObjectURL(blob);
            const result = await worker.recognize(imageUrl);
            URL.revokeObjectURL(imageUrl);

            // Add page marker and text
            allText.push(`[[PAGE_${pageNum}]]`);
            allText.push(result.data.text);

            console.log(`[Tesseract] Page ${pageNum}/${numPages} complete, confidence: ${result.data.confidence}%`);

        } catch (error) {
            console.error(`[Tesseract] Failed to process page ${pageNum}:`, error);
            allText.push(`[[PAGE_${pageNum}]]`);
            allText.push(`[Error processing page ${pageNum}]`);
        }
    }

    progressCallback?.('OCR complete!');
    return allText.join('\n\n');
}

/**
 * Clean up Tesseract worker when done.
 * Call this when leaving the OCR view to free resources.
 */
export async function terminateTesseractWorker(): Promise<void> {
    if (cachedWorker) {
        console.log('[Tesseract] Terminating worker');
        await cachedWorker.terminate();
        cachedWorker = null;
        cachedLanguage = null;
    }
}

/**
 * Get human-readable language name for display
 */
export function getLanguageDisplayName(language: OCRLanguage): string {
    const names: Record<string, string> = {
        'heb': 'Hebrew',
        'deu': 'German',
        'frk': 'German (Fraktur)',
        'heb+deu': 'Hebrew + German',
        'heb+frk': 'Hebrew + Fraktur',
        'deu+frk': 'German + Fraktur',
        'heb+deu+frk': 'Hebrew + German + Fraktur'
    };
    return names[language] || language;
}

/**
 * Recommended language based on file characteristics
 * (Can be expanded with smarter detection)
 */
export function suggestLanguage(filename: string): OCRLanguage {
    const lowerName = filename.toLowerCase();

    // Check for obvious Hebrew indicators
    if (lowerName.includes('hebrew') || lowerName.includes('עברית')) {
        return 'heb';
    }

    // Check for Fraktur indicators (old German texts)
    if (lowerName.includes('fraktur') || lowerName.includes('gothic') ||
        lowerName.includes('1800') || lowerName.includes('1900')) {
        return 'heb+frk';
    }

    // Default for mixed Hebrew/German historical texts
    return 'heb+deu';
}
