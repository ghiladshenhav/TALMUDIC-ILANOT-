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
    hebrewTranslation?: string; // Steinsaltz
    translation?: string;

    // Enhanced context
    contextBefore?: string;
    contextAfter?: string;
    originalText?: string; // Hebrew/Aramaic quote
}

export interface UserText {
    id: string;
    title: string;
    text: string;
    createdAt: any; // Timestamp
    findings?: AIFinding[];
}
