import { ReceptionTree, BranchNode } from '../types';

// Known author name aliases for normalization
const AUTHOR_ALIASES: Record<string, string> = {
    'Ahron Marcus': 'Aharon Marcus',
    'York-Steiner': 'York Steiner',
    'R. ': 'Rabbi ',
    'Rav ': 'Rabbi ',
};

// Common Hebrew transliteration variations
const TRANSLITERATION_NORMALIZATIONS: [RegExp, string][] = [
    [/\bAhron\b/gi, 'Aharon'],
    [/\bMoshe\b/gi, 'Moses'],
    [/\bYosef\b/gi, 'Joseph'],
    [/\bYitzhak\b/gi, 'Isaac'],
    [/\bYaakov\b/gi, 'Jacob'],
];

/**
 * Normalize author name to merge similar entries
 * - Removes hyphens
 * - Standardizes Hebrew transliteration
 * - Applies known aliases
 */
export function normalizeAuthorName(name: string): string {
    if (!name) return '';

    // Basic normalization
    let normalized = name.trim()
        .replace(/-/g, ' ')      // Remove hyphens
        .replace(/\s+/g, ' ');   // Normalize whitespace

    // Apply transliteration normalizations
    for (const [pattern, replacement] of TRANSLITERATION_NORMALIZATIONS) {
        normalized = normalized.replace(pattern, replacement);
    }

    // Apply known aliases (exact match)
    if (AUTHOR_ALIASES[normalized]) {
        normalized = AUTHOR_ALIASES[normalized];
    }

    // Apply prefix aliases
    for (const [prefix, replacement] of Object.entries(AUTHOR_ALIASES)) {
        if (normalized.startsWith(prefix)) {
            normalized = replacement + normalized.slice(prefix.length);
        }
    }

    return normalized;
}

/**
 * Get the original name variants that normalized to this name
 */
export function getNameVariants(normalizedName: string, allNames: string[]): string[] {
    return allNames.filter(name => normalizeAuthorName(name) === normalizedName);
}

export interface AuthorEntry {
    name: string;
    originalNames: string[];  // All variants that normalized to this name
    branches: {
        branch: BranchNode;
        treeId: string;
        rootTitle: string;
        rootSource: string;
    }[];
    tractates: Set<string>;
    workTitles: Set<string>;
}

export const aggregateByAuthor = (forest: ReceptionTree[]): AuthorEntry[] => {
    const authorMap = new Map<string, AuthorEntry>();
    const originalNamesMap = new Map<string, Set<string>>(); // Track original names per normalized name

    forest.forEach(tree => {
        if (!tree.root || !tree.branches) return;

        tree.branches.forEach(branch => {
            if (!branch.author) return;

            // Normalize author name
            const originalName = branch.author.trim();
            if (!originalName) return;

            const authorName = normalizeAuthorName(originalName);

            // Track original names
            if (!originalNamesMap.has(authorName)) {
                originalNamesMap.set(authorName, new Set());
            }
            originalNamesMap.get(authorName)!.add(originalName);

            if (!authorMap.has(authorName)) {
                authorMap.set(authorName, {
                    name: authorName,
                    originalNames: [],
                    branches: [],
                    tractates: new Set(),
                    workTitles: new Set()
                });
            }

            const entry = authorMap.get(authorName)!;

            // Update original names from the set
            entry.originalNames = Array.from(originalNamesMap.get(authorName)!);

            // Add branch info
            entry.branches.push({
                branch,
                treeId: tree.id,
                rootTitle: tree.root.title,
                rootSource: tree.root.sourceText
            });

            // Add metadata
            if (tree.root.sourceText) {
                // Extract tractate name if possible, or use full source
                // Format is usually "Bavli [Tractate] [Page]"
                const parts = tree.root.sourceText.split(' ');
                if (parts.length >= 2) {
                    // e.g. "Bavli Gittin 10b" -> "Gittin"
                    // or "Mishnah Peah 1:1" -> "Peah"
                    // We can just store the full source for now to be safe, or try to extract
                    entry.tractates.add(tree.root.sourceText);
                } else {
                    entry.tractates.add(tree.root.sourceText);
                }
            }

            if (branch.workTitle) {
                entry.workTitles.add(branch.workTitle);
            }
        });
    });

    // Convert to array and sort alphabetically
    return Array.from(authorMap.values()).sort((a, b) => a.name.localeCompare(b.name));
};
