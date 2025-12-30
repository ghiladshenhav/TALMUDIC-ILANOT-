export interface BenYehudaAuthor {
    id: string;
    name: string;
    // Add other fields as needed based on API response
}

export interface BenYehudaWork {
    id: string;
    title: string;
    author: BenYehudaAuthor;
    genre?: string;
    period?: string;
    // Add other fields as needed
}

export interface BenYehudaTextResponse {
    id: string;
    title: string;
    html: string; // The API likely returns HTML content
    text?: string; // Or plain text if available
    author: {
        name: string;
    };
}

const BASE_URL = 'https://benyehuda.org/api/v1';
const API_KEY = '18ba3db523867bc1d36e8913431d60891a347b14e6492e61e725beda41282237';

export const BenYehudaAPI = {
    /**
     * Search for works or authors
     */
    async search(query: string, searchAfter?: string[]): Promise<{ works: BenYehudaWork[], total: number, nextPageToken: string[] | null }> {
        try {
            const body: any = {
                fulltext: query,
                key: API_KEY
            };

            if (searchAfter) {
                body.search_after = searchAfter;
            }

            // The API requires a POST request for search with key in body
            const response = await fetch(`${BASE_URL}/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // The API returns { total_count: number, data: [...], next_page_search_after: [...] }
            const results = data.data || [];

            const works = results.map((item: any) => ({
                id: item.id.toString(),
                title: item.metadata.title,
                author: {
                    id: item.metadata.author_ids?.[0]?.toString() || '',
                    name: item.metadata.author_string || 'Unknown'
                },
                genre: item.metadata.genre,
                period: item.metadata.period
            }));

            return {
                works,
                total: data.total_count || 0,
                nextPageToken: data.next_page_search_after || null
            };
        } catch (error) {
            console.error('Ben Yehuda Search Error:', error);
            throw error;
        }
    },

    /**
     * Get the full text of a work
     */
    async getWorkText(workId: string): Promise<BenYehudaTextResponse> {
        try {
            // Key must be a query parameter for GET requests
            const response = await fetch(`${BASE_URL}/texts/${workId}?key=${API_KEY}`, {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }

            const metadata = await response.json();

            // The API download_url redirects to S3 which blocks CORS.
            // However, the public read page (metadata.url) allows CORS.
            // We fetch the public page and scrape the content from the #actualtext div.
            if (metadata.url) {
                try {
                    let htmlText = '';

                    // Extract the work ID from the URL (e.g., "https://benyehuda.org/read/8585" -> "8585")
                    const urlMatch = metadata.url.match(/\/read\/(\d+)/);
                    const workIdFromUrl = urlMatch ? urlMatch[1] : null;

                    // Try Vite proxy first (most reliable for local development)
                    if (workIdFromUrl) {
                        try {
                            const proxyUrl = `/api/benyehuda-read/${workIdFromUrl}`;
                            console.log(`Fetching from Vite proxy: ${proxyUrl}`);
                            const contentResponse = await fetch(proxyUrl);
                            if (contentResponse.ok) {
                                htmlText = await contentResponse.text();
                            } else {
                                throw new Error('Vite proxy failed');
                            }
                        } catch (viteError) {
                            console.warn('Vite proxy failed, trying AllOrigins...', viteError);
                            // Fallback to AllOrigins proxy
                            try {
                                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(metadata.url)}`;
                                console.log(`Fetching from AllOrigins proxy: ${proxyUrl}`);
                                const contentResponse = await fetch(proxyUrl);
                                if (contentResponse.ok) {
                                    const data = await contentResponse.json();
                                    htmlText = data.contents;
                                } else {
                                    throw new Error('AllOrigins proxy failed');
                                }
                            } catch (primaryError) {
                                console.warn('AllOrigins proxy failed, trying CORSProxy.io...', primaryError);
                                // Final fallback to CORSProxy.io
                                const backupUrl = `https://corsproxy.io/?${encodeURIComponent(metadata.url)}`;
                                const backupResponse = await fetch(backupUrl);
                                if (backupResponse.ok) {
                                    htmlText = await backupResponse.text();
                                } else {
                                    throw new Error('All proxies failed');
                                }
                            }
                        }
                    } else {
                        // Fallback for non-standard URLs - use original proxy logic
                        try {
                            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(metadata.url)}`;
                            console.log(`Fetching from primary proxy: ${proxyUrl}`);
                            const contentResponse = await fetch(proxyUrl);
                            if (contentResponse.ok) {
                                const data = await contentResponse.json();
                                htmlText = data.contents;
                            } else {
                                throw new Error('Primary proxy failed');
                            }
                        } catch (primaryError) {
                            console.warn('Primary proxy failed, trying backup...', primaryError);
                            const backupUrl = `https://corsproxy.io/?${encodeURIComponent(metadata.url)}`;
                            const backupResponse = await fetch(backupUrl);
                            if (backupResponse.ok) {
                                htmlText = await backupResponse.text();
                            } else {
                                throw new Error('Backup proxy failed');
                            }
                        }
                    }

                    if (htmlText) {
                        console.log(`Fetched HTML length: ${htmlText.length}`);

                        const parser = new DOMParser();
                        const doc = parser.parseFromString(htmlText, 'text/html');
                        const contentElement = doc.getElementById('actualtext');

                        if (contentElement) {
                            console.log("Found #actualtext element");
                            const htmlContent = contentElement.innerHTML;
                            // Also try to get a clean text version
                            const textContent = contentElement.textContent || '';

                            return {
                                ...metadata,
                                html: htmlContent,
                                text: textContent
                            };
                        } else {
                            console.warn("Could not find #actualtext element in fetched HTML");
                        }
                    }
                } catch (scrapeError) {
                    console.warn('Failed to scrape content from public page, falling back to metadata only:', scrapeError);
                }
            }

            return metadata;
        } catch (error) {
            console.error('Ben Yehuda Text Fetch Error:', error);
            throw error;
        }
    }
};
