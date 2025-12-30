// Node.js has built-in fetch in recent versions

async function searchSefaria(phrase) {
    console.log(`Searching for: "${phrase}"`);
    const url = 'https://www.sefaria.org/api/search-wrapper';

    const body = {
        query: phrase,
        type: "text",
        field: "naive_lemmatizer",
        slop: 5,
        size: 5,
        filters: ["Talmud"],
        filter_fields: ["path"],
        source_proj: true
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            console.error(`Status: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error("Body:", text);
            return;
        }

        const data = await response.json();
        console.log("Total hits:", data.hits?.total?.value);
        if (data.hits && data.hits.hits) {
            data.hits.hits.forEach(hit => {
                console.log(`- Ref: ${hit._source.ref}`);
                console.log(`  Score: ${hit._score}`);
                console.log(`  Text: ${hit._source.he.substring(0, 50)}...`);
            });
        }
    } catch (err) {
        console.error("Error:", err);
    }
}

// Check if fetch is available (Node 18+)
if (!global.fetch) {
    console.log("Using http/https modules since global fetch is not available");
    // Simple fallback implementation if needed, or just assume user has Node 18+
}

searchSefaria('עמא פזיזא');
