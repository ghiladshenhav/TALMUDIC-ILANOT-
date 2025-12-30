
async function fetchTalmudText(ref) {
    try {
        const url = `https://www.sefaria.org/api/texts/${encodeURIComponent(ref)}?context=0&pad=0&alts=0&bare=0`;
        console.log("Fetching URL:", url);

        const response = await fetch(url);
        if (!response.ok) {
            console.log(`Status: ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data.error) {
            console.log("API Error:", data.error);
            return null;
        }

        console.log("Data received:", data ? "Yes" : "No");
        if (data) {
            console.log("Ref:", data.ref);
        }
        return data;

    } catch (error) {
        console.error("Error:", error);
        return null;
    }
}

fetchTalmudText("Talmud Bavli, Ketubot 111a");
