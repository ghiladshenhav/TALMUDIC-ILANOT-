import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source. 
// We need to use the worker from the installed package.
// In a Vite environment, we can point to the file in node_modules or use a CDN.
// Using a CDN is often easier for quick setup without complex build config changes,
// but for production, bundling the worker is better.
// For now, we'll try to use the worker from the package if Vite handles it, 
// or fallback to a CDN if needed.
// A common pattern in Vite is to import the worker script URL.

// Note: We might need to adjust this path based on how Vite bundles assets.
// For simplicity in this setup, we will use a CDN for the worker to avoid build issues.
// Import the worker script as a URL using Vite's ?url suffix
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ');
        fullText += `[[PAGE_${i}]]\n${pageText}\n\n`;
    }

    return fullText;
};
