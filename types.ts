// Graph related types and data

export type NodeType = 'root' | 'branch';

export interface NodeStyle {
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number; // in px
    width?: number; // in px
    height?: number; // in px
    textColor?: string;
    fontSize?: string; // e.g., '1rem'
    tractateIcon?: string; // e.g., 'local_florist'
}

// Position field kept for backward compatibility but no longer used in new model
interface BaseGraphNode {
    id: string;
    type: NodeType;
    position?: { x: number; y: number }; // Optional now
    style?: NodeStyle;
}

export interface RootNode extends BaseGraphNode {
    type: 'root';
    title: string; // e.g., "The Oven of Akhnai"
    sourceText: string; // e.g., "Bavli Berakhot 2a"
    hebrewText: string;
    hebrewTranslation?: string; // Steinsaltz or other Hebrew translation
    translation: string;
    userNotesKeywords: string; // A rich text field
}

export enum TextGenre {
    Halakha = "Halakha",
    Aggadah = "Aggadah",
    Philosophy = "Philosophy",
    Poetry = "Poetry",
    ModernScholarship = "Modern Scholarship",
    Literary = "Literary",
    Historical = "Historical",
    Other = "Other"
}

export enum BranchCategory {
    Academic = "Academic",
    Philosophical = "Philosophical",
    Literary = "Literary",
    Historical = "Historical",
    Critique = "Critique",
}

export interface BranchNode extends BaseGraphNode {
    type: 'branch';
    author: string;
    workTitle: string;
    publicationDetails: string;
    year?: string;
    referenceText: string;
    userNotes: string;
    category?: BranchCategory;
    keywords?: string[]; // AI-generated and user-editable thematic tags (e.g., ["משיח", "Messiah", "redemption"])
    sourceDocumentId?: string; // Links to the UserText.id this branch was discovered from
    // Ground Truth harvesting
    isHarvested?: boolean; // True if this branch has been harvested as Ground Truth
    harvestedAt?: any; // Timestamp when harvested
}

/**
 * Author profile for storing bio information
 */
export interface AuthorProfile {
    normalizedName: string;   // Primary key (normalized version of name)
    displayName: string;      // Display name for UI
    hebrewName?: string;      // Hebrew name if available
    birthYear?: string;       // e.g., "1843"
    deathYear?: string;       // e.g., "1916"
    location?: string;        // e.g., "Kraków, Galicia"
    description?: string;     // Brief bio
    portraitUrl?: string;     // Path to generated portrait image
    tags?: string[];          // e.g., ["Hasidism", "Philosophy"]
}

/**
 * Tractate profile for storing tractate metadata
 */
export interface TractateProfile {
    normalizedName: string;   // Primary key (e.g., "berakhot")
    displayName: string;      // Display name (e.g., "Berakhot")
    hebrewName?: string;      // Hebrew name (e.g., "ברכות")
    order?: string;           // Seder name (e.g., "Zeraim")
    orderHebrew?: string;     // Hebrew Seder name (e.g., "זרעים")
    description?: string;     // User-editable description
    tags?: string[];          // Custom tags
    imageUrl?: string;        // Custom tree image URL
}

export type GraphNode = RootNode | BranchNode;


export enum LinkCategory {
    DirectQuote = "Direct Quote", // Brown
    Paraphrase = "Paraphrase", // Green
    ThematicParallel = "Thematic Parallel", // Pink
    Allusion = "Allusion",
    RebuttalCritique = "Rebuttal/Critique",
    InfluenceGeneral = "Influence (General)",
    Methodological = "Methodological",
    Biographical = "Biographical",
}

// ========================================
// NEW SIMPLIFIED DATA MODEL
// ========================================

/**
 * Simplified ReceptionTree structure
 * - No edges needed (branches directly belong to root)
 * - Composite IDs prevent collisions: ${treeId}-branch-${timestamp}-${index}
 */
export interface ReceptionTree {
    id: string;           // e.g., "bavli_berakhot_3a"
    root: RootNode;       // Single root node
    branches: BranchNode[]; // Direct array of branches
    createdAt?: Date | { seconds: number; nanoseconds: number };  // Firestore Timestamp or Date
    updatedAt?: Date | { seconds: number; nanoseconds: number };  // Firestore Timestamp or Date
}

/**
 * ID Generation Helpers
 */
export const IDHelpers = {
    /**
     * Generate a unique branch ID
     * Format: ${treeId}-branch-${timestamp}-${index}
     * Example: "bavli_berakhot_3a-branch-1732281432000-0"
     */
    generateBranchId(treeId: string, index: number = 0): string {
        const timestamp = Date.now();
        return `${treeId}-branch-${timestamp}-${index}`;
    },

    /**
     * Generate a root ID from treeId
     * Format: ${treeId}-root
     * Example: "bavli_berakhot_3a-root"
     */
    generateRootId(treeId: string): string {
        return `${treeId}-root`;
    },

    /**
     * Extract treeId from a composite ID
     */
    extractTreeId(compositeId: string): string | null {
        const match = compositeId.match(/^(.+?)-(root|branch)/);
        return match ? match[1] : null;
    },

    /**
     * Check if an ID is a branch ID
     */
    isBranchId(id: string): boolean {
        return id.includes('-branch-');
    },

    /**
     * Check if an ID is a root ID
     */
    isRootId(id: string): boolean {
        return id.endsWith('-root');
    },

    /**
     * Validate if ID follows new composite format
     * Returns true if valid, false if legacy format
     */
    isValidCompositeId(id: string): boolean {
        // Root IDs: {treeId}-root
        if (id.endsWith('-root')) {
            return id.split('-').length >= 2;
        }
        // Branch IDs: {treeId}-branch-{timestamp}-{index}
        if (id.includes('-branch-')) {
            const parts = id.split('-branch-');
            if (parts.length !== 2) return false;
            const [treeId, suffix] = parts;
            // Suffix should be: {timestamp}-{index}
            const suffixParts = suffix.split('-');
            return suffixParts.length >= 2 && !isNaN(Number(suffixParts[0]));
        }
        // Legacy format detected
        return false;
    },

    /**
     * Warn if legacy ID detected
     */
    validateAndWarn(id: string, context: string): void {
        if (!this.isValidCompositeId(id)) {
            console.warn(`[ID Validation] Legacy ID detected in ${context}:`, id);
            console.warn('  This may cause ID collisions. Consider migrating data or creating a new tree.');
        }
    }
};

// ========================================
// LEGACY TYPES (For Migration Only)
// ========================================

export interface GraphEdge_LEGACY {
    id: string;
    source: string;
    target: string;
    category?: LinkCategory;
    label?: string;
}

export interface ReceptionTree_LEGACY {
    id: string;
    nodes: GraphNode[];
    edges: GraphEdge_LEGACY[];
}

// Type alias for clarity during migration
export type GraphEdge = GraphEdge_LEGACY;

// ========================================
// AI Discovery Types
// ========================================

export enum AIFindingType {
    RootMatch = 'Root Matches',
    ThematicFit = 'Thematic Fits',
    NewForm = 'New Forms',
    Connection = 'Connections',
    Reference = 'Reference'
}

export enum AIFindingStatus {
    Pending,
    Added,
    Dismissed,
    Rejected,
    AddedAsNewRoot,
    AddedToExistingRoot,
}

export interface AIFinding {
    id: string;
    type: AIFindingType;
    snippet: string; // The quote from the analyzed text
    confidence: number;
    source: string; // The Talmudic source (e.g., 'Bavli Berakhot 2a')
    status: AIFindingStatus;

    // For connection suggestions
    target?: string;
    justification?: string;

    // For new branch suggestions (RootMatch, ThematicFit, Reference)
    author?: string;
    workTitle?: string;

    // For new root suggestions (NewForm, Reference)
    title?: string;
    hebrewText?: string;
    matchingPhrase?: string; // The exact substring from hebrewText that proves the connection
    hebrewTranslation?: string; // Steinsaltz
    translation?: string;
    sefariaTranslation?: string; // Translation fetched from Sefaria when user corrects source

    // Enhanced context
    contextBefore?: string;
    contextAfter?: string;
    originalText?: string; // Hebrew/Aramaic quote

    // Context Expansion
    expandedContextExplanation?: string;
    isExpandingContext?: boolean;

    // Implicit Reference Flag
    isImplicit?: boolean;

    // PDF Page Number
    pageNumber?: number;

    // Thematic Keywords (AI-generated, user-editable)
    keywords?: string[]; // e.g., ["משיח", "Messiah", "redemption", "גאולה"]

    // Hallucination Detection (set by post-processing validation)
    isHallucination?: boolean;
    hallucinationWarning?: string;

    // Source Correction (when Sefaria search finds the correct source)
    correctedBySefariaSearch?: boolean;
    correctionNote?: string;
    originalSource?: string; // What the AI originally suggested

    // Alternative Candidates (for ambiguous matches)
    alternativeCandidates?: Array<{
        source: string;
        hebrewText: string;
        reasoning: string;
        score?: number;
    }>;

    // Ground Truth / Manual Addition (for training AI)
    isGroundTruth?: boolean;        // Marks this as training data for AI
    userExplanation?: string;       // User's reasoning for why this is a valid reference
    addedManually?: boolean;        // Distinguishes user-added from AI-detected findings
    sourceDocumentId?: string;      // Links to the library text this came from

    // Needs Verification (AI detected reference but couldn't find exact page)
    needsVerification?: boolean;    // Flag for user to manually look up the exact source

    // Source Grounding (LangExtract-inspired)
    // Maps the extracted snippet back to exact character positions in source text
    snippetStartChar?: number;      // Character offset where snippet begins in source text
    snippetEndChar?: number;        // Character offset where snippet ends
    matchConfidence?: number;       // 0-1 confidence that offsets are accurate (1.0 = exact match)
}

export interface UserText {
    id: string;
    title: string;
    author?: string; // Moved from metadata to direct field, kept optional
    text: string;
    createdAt?: any; // Firestore Timestamp
    dateAdded?: number; // Unix timestamp fallback
    fileUri?: string; // Gemini File API URI
    pdfUrl?: string; // URL for stored PDF in Firebase Storage
    findings?: AIFinding[];
    // Metadata fields
    publicationDate?: string;
    keywords?: string[];
    genre?: TextGenre | string; // Text classification category (enum or custom)
    bibliographicalInfo?: string; // Citation details, publisher, etc.
    fullTranscribedText?: string;
    status?: 'active' | 'pending' | 'archived'; // Defaults to 'active' if undefined
}

/**
 * Ground Truth Example - User corrections and classifications for AI training
 */
export enum GroundTruthAction {
    APPROVE = 'APPROVE',     // Correct reference, use as positive example
    REJECT = 'REJECT',       // False positive, add to ignore list
    CORRECT = 'CORRECT'      // Wrong source, corrected by user
}

export enum GroundTruthCategory {
    StructuralNoise = 'structural_noise',      // Aramaic discourse markers
    LocusClassicus = 'locus_classicus',        // Primary source mapping
    Subversion = 'subversion',                 // Ironic/subversive usage
    OCRCorrection = 'ocr_correction'           // Fixed OCR errors
}

export interface GroundTruthExample {
    id: string;
    userId: string;
    createdAt: any; // Firestore Timestamp

    // Original Finding
    phrase: string;                 // "אחד רוכב ואחד מנהיג"
    snippet: string;                // Full quote from document
    originalSource?: string;        // If correction: "Mishnah Bava Metzia 1:1"

    // Correction/Classification
    action: GroundTruthAction;
    correctSource: string;          // "Bavli Bava Metzia 8a" or "N/A" if REJECT
    correctionReason?: string;      // "Donkey acquisition case, not garment"

    // Metadata
    confidenceLevel: 'high' | 'medium' | 'low';
    isGroundTruth: boolean;         // User explicitly marked as GT
    category?: GroundTruthCategory;

    // Optional enhancements
    justification?: string;         // User-edited explanation
    correctedOcrText?: string;      // If OCR was fixed

    // Usage tracking
    usageCount?: number;            // How many times this example has been used in prompts
    lastUsed?: any;                 // Firestore Timestamp
}
