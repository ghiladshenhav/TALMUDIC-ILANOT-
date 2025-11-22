
const normalizeSourceText = (text) => {
    return text.toLowerCase()
        .replace(/^(bavli|yerushalmi|masechet|tractate|b\.|y\.)\s*/g, '')
        .replace(/[.,\-:;]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const existingRoots = ["Bava Kamma 38a", "Sanhedrin 99a", "Ketubot 111a"];
const suggestions = [
    "Bavli Bava Kamma 38a",
    "B. Bava Kamma 38a",
    "Masechet Bava Kamma 38a",
    "Bava Kamma 38a",
    "Berakhot 2a"
];

console.log("Existing Roots (Normalized):", existingRoots.map(normalizeSourceText));

suggestions.forEach(s => {
    const norm = normalizeSourceText(s);
    const match = existingRoots.find(r => normalizeSourceText(r) === norm);
    console.log(`Suggestion: "${s}" -> Norm: "${norm}" -> Match: ${match ? "YES" : "NO"}`);
});
