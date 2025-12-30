import React, { useState, useEffect, useMemo } from 'react';
import { db, storage } from './firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDoc, arrayUnion, arrayRemove, writeBatch, addDoc, Timestamp, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { ReceptionTree, GraphNode, AIFinding, AIFindingStatus, GraphEdge, RootNode, BranchNode, AIFindingType, LinkCategory, IDHelpers, UserText, AuthorProfile, TractateProfile } from './types';
import { generateContentWithRetry } from './utils/ai-helpers';
import { getPositiveTrainingExamples } from './utils/feedback-helpers';
import { generateUUID } from './utils/id-helpers';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TextAnalyzerView from './views/TextAnalyzerView';
import AIAssistantView from './views/AIAssistantView';
import AddPassageModal from './components/AddPassageModal';
import MergeDuplicatesModal from './components/MergeDuplicatesModal';
import FullTextAnalysisModal from './components/ai/FullTextAnalysisModal';
import { BenYehudaAPI } from './services/benyehuda-api';
import BenYehudaSearchModal from './components/importer/BenYehudaSearchModal';
import BatchImportModal from './components/importer/BatchImportModal';
import PdfAnalysisModal from './components/importer/PdfAnalysisModal';
import { app } from './firebase';
import { Chat, GoogleGenAI } from "@google/genai";
import { sendMessage as sendInteractionMessage, createSession, isInteractionsAvailable } from './services/interactions-client';
import { fetchTalmudText } from './utils/sefaria';
import SettingsModal from './components/SettingsModal';
import HelpModal from './components/HelpModal';
import Layout from './components/Layout';
import LibraryView from './views/LibraryView';
import SplitPaneView from './views/SplitPaneView';
import SimilarInterpretationsView from './views/SimilarInterpretationsView';
import AuthorDetailPage from './views/AuthorDetailPage';
import TractateDetailPage from './views/TractateDetailPage';
import { AuthorEntry } from './utils/author-aggregation';
import SyncDebugView from './views/SyncDebugView';

// Define SchemaType locally to avoid runtime import errors
enum SchemaType {
    STRING = "STRING",
    NUMBER = "NUMBER",
    INTEGER = "INTEGER",
    BOOLEAN = "BOOLEAN",
    ARRAY = "ARRAY",
    OBJECT = "OBJECT"
}

type View = 'dashboard' | 'split-pane' | 'analyzer' | 'assistant' | 'library' | 'connections';

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

const App: React.FC = () => {
    // Helper to clean JSON string from AI response
    const cleanJsonString = (str: string) => {
        // Remove markdown code blocks
        let cleaned = str.replace(/```json\n?|\n?```/g, '').trim();
        // Remove any other markdown code blocks if json tag was missing
        cleaned = cleaned.replace(/```\n?|\n?```/g, '').trim();
        // Remove non-printable control characters (except common whitespace)
        // This fixes "Bad control character" errors
        cleaned = cleaned.replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/g, '');
        return cleaned;
    };

    const [darkMode, setDarkMode] = useState(true);
    const [currentView, setCurrentView] = useState<View>('split-pane');
    const [receptionForest, setReceptionForest] = useState<ReceptionTree[]>([]);
    const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
    const [aiFindings, setAIFindings] = useState<AIFinding[]>([]);
    const [isAddPassageModalOpen, setIsAddPassageModalOpen] = useState(false);
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
    const [isSyncDebugOpen, setIsSyncDebugOpen] = useState(false);
    const [addBranchParent, setAddBranchParent] = useState<GraphNode | null>(null);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [fullTextAnalysis, setFullTextAnalysis] = useState<any>(null);
    const [isBenYehudaModalOpen, setIsBenYehudaModalOpen] = useState(false);
    const [isBatchImportModalOpen, setIsBatchImportModalOpen] = useState(false);
    const [isPdfAnalysisModalOpen, setIsPdfAnalysisModalOpen] = useState(false);
    const [isAiLoading, setIsLoading] = useState(false);
    const [isDbLoading, setIsDbLoading] = useState(true);

    // Settings & Help State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [currentFont, setCurrentFont] = useState('font-sans');


    // AI Assistant State
    const [chat, setChat] = useState<Chat | null>(null);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

    const [selectedTractate, setSelectedTractate] = useState<string | null>(null);

    // Author Detail Page State
    const [selectedAuthor, setSelectedAuthor] = useState<AuthorEntry | null>(null);
    const [authorProfiles, setAuthorProfiles] = useState<Record<string, AuthorProfile>>({});
    // Tractate Profiles State
    const [tractateProfiles, setTractateProfiles] = useState<Record<string, TractateProfile>>({});

    // Combine all nodes from the forest (roots + branches)
    const allNodes = useMemo(() => {
        const nodes: GraphNode[] = [];
        receptionForest.forEach(tree => {
            if (tree.root) nodes.push(tree.root);
            if (Array.isArray(tree.branches)) {
                nodes.push(...tree.branches);
            }
        });
        return nodes;
    }, [receptionForest]);

    const selectedGraphNode = useMemo(() => allNodes.find(n => n.id === selectedGraphNodeId) || null, [selectedGraphNodeId, allNodes]);

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);

    // Apply Font Change
    useEffect(() => {
        document.body.classList.remove('font-sans', 'font-serif', 'font-mono');
        if (currentFont !== 'font-sans') {
            document.body.classList.add(currentFont);
        }
    }, [currentFont]);

    // Initialize Chat session when forest data is loaded
    useEffect(() => {
        if (receptionForest.length > 0 && !chat) {
            initializeChat();
        }
    }, [receptionForest, chat]);

    const initializeChat = async () => {
        console.log("Initializing AI Chat...");
        const graphSummary = receptionForest
            .filter(tree => tree.root && tree.branches) // Filter out legacy trees
            .map(tree => {
                const root = tree.root;
                return {
                    title: root.title,
                    source: root.sourceText,
                    // Full Content for Context
                    content: {
                        english_translation: root.translation,
                        hebrew_explanation: root.hebrewTranslation, // Steinsaltz
                        user_notes: root.userNotesKeywords
                    },
                    // Detailed Branch Information
                    reception_branches: tree.branches.map(b => ({
                        author: b.author,
                        work_title: b.workTitle,
                        quote: b.referenceText,
                        notes: b.userNotes,
                        category: b.category,
                        publication: b.publicationDetails
                    }))
                };
            });

        // Initialize GoogleGenAI Client (using the same SDK as File Upload)
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        const client = new GoogleGenAI({ apiKey: apiKey });

        const systemInstruction = `You are an expert digital humanities research assistant specializing in Talmudic reception history. 
            
            You have access to the user's ENTIRE research corpus (provided in the chat history).
            This data includes:
            1. Full Talmudic passages with translations (English & Steinsaltz).
            2. All reception branches (modern authors, quotes, works) connected to these passages.
            3. The user's personal library of uploaded texts (if synced).

            *** CORE PROTOCOLS ***
            You must adhere to the same strict analysis standards as the "Reference Detector":
            
            1. **SENSITIVITY TO IMPLICIT REFERENCES**:
               - Do not just look for direct quotes. Look for the "DNA" of the Talmud.
               - **Linguistic Echoes**: Use of Aramaic idioms ("Kal Vachomer", "Teiku"), Gemara-like phrasing.
               - **Conceptual Allusions**: Discussions mirroring Talmudic debates (e.g., "intent vs. action").
               - **Structural Parallels**: Arguments built on Sugya logic.
               - Always distinguish between **Explicit Citations** and **Implicit Allusions**.

            2. **STRICT CITATION FORMAT**:
               - When citing a Talmudic source, ALWAYS use: "[Corpus] [Tractate] [Page][Folio]" (e.g., "Bavli Gittin 10b").
               - Never use generic terms like "The Gemara" without a specific citation.

            YOUR GOAL:
            - Answer questions by searching through the provided data and library files.
            - When analyzing the user's library files, apply the "Implicit Reference" protocols to find subtle connections.
            - When asked about an author (e.g., "Levinas"), look for them in the 'reception_branches'.
            - Synthesize connections between different trees and library texts.
            
            Be concise, insightful, and data-driven.`;

        const initialHistory: any[] = [
            { role: 'user', parts: [{ text: `Here is the COMPLETE data of my current research graph. This includes full texts, translations, and all reception branches.\n\n${JSON.stringify(graphSummary, null, 2)}` }] },
            { role: 'model', parts: [{ text: "Understood. I have ingested your full research corpus. I can see all the texts, translations, and reception branches you've collected. I am ready to answer specific questions about authors, themes, and connections within this data." }] }
        ];



        const newChat = client.chats.create({
            model: "gemini-2.0-flash",
            config: {
                systemInstruction: {
                    role: 'system',
                    parts: [{ text: systemInstruction }]
                }
            },
            history: initialHistory,
        });
        setChat(newChat as any); // Cast to any to avoid minor type mismatches between SDK versions if any
        setChatHistory([
            { role: 'model', text: "Understood. I have reviewed your research graph and library. I am ready to assist. How can I help you explore the connections in your research today?" }
        ]);
        console.log("AI Chat initialized successfully.");
    };

    const handleOpenBatchImport = () => {
        setIsBatchImportModalOpen(true);
    };



    // Fetch data from Firestore on mount
    useEffect(() => {
        setIsDbLoading(true);
        const unsubscribe = onSnapshot(collection(db, "receptionTrees"), (snapshot) => {
            console.log("Firestore snapshot update received. Docs:", snapshot.docs.length);
            const forestData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReceptionTree));

            // Debug: Log all trees and their status
            console.log(`[Dashboard Debug] Total trees loaded: ${forestData.length}`);
            const validTrees = forestData.filter(t => t.root && t.branches);
            const legacyTrees = forestData.filter(t => !t.root || !t.branches);
            console.log(`[Dashboard Debug] Valid trees (with root+branches): ${validTrees.length}`);
            console.log(`[Dashboard Debug] Legacy trees (hidden): ${legacyTrees.length}`);

            // List all valid trees
            validTrees.forEach(tree => {
                console.log(`[Dashboard Debug] ✅ Visible: "${tree.root.title}" (${tree.root.sourceText}) - ${tree.branches.length} branches`);
            });

            // List hidden trees
            legacyTrees.forEach(tree => {
                console.log(`[Dashboard Debug] ⚠️ Hidden (legacy): id="${tree.id}"`);
            });

            setReceptionForest(forestData);
            setIsDbLoading(false);
        }, (error) => {
            console.error("Error fetching data from Firestore:", error);
            alert("Could not connect to the database. Please check your Firebase setup and security rules.");
            setIsDbLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    // Load author profiles from Firestore
    useEffect(() => {
        const loadAuthorProfiles = async () => {
            try {
                const snapshot = await getDocs(collection(db, 'authorProfiles'));
                const profiles: Record<string, AuthorProfile> = {};
                snapshot.docs.forEach(doc => {
                    const profile = doc.data() as AuthorProfile;
                    profiles[profile.normalizedName] = profile;
                });
                setAuthorProfiles(profiles);
                console.log(`[Author Profiles] Loaded ${snapshot.docs.length} author profiles`);
            } catch (error) {
                console.error('[Author Profiles] Failed to load:', error);
            }
        };
        loadAuthorProfiles();
    }, []);

    // Load tractate profiles from Firestore
    useEffect(() => {
        const loadTractateProfiles = async () => {
            try {
                const snapshot = await getDocs(collection(db, 'tractateProfiles'));
                const profiles: Record<string, TractateProfile> = {};
                snapshot.docs.forEach(doc => {
                    const profile = doc.data() as TractateProfile;
                    profiles[profile.normalizedName] = profile;
                });
                setTractateProfiles(profiles);
                console.log(`[Tractate Profiles] Loaded ${snapshot.docs.length} tractate profiles`);
            } catch (error) {
                console.error('[Tractate Profiles] Failed to load:', error);
            }
        };
        loadTractateProfiles();
    }, []);

    // Keyboard shortcut for adding a new passage
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
            if (currentView === 'dashboard' && event.key.toLowerCase() === 'n') {
                event.preventDefault();
                setIsAddPassageModalOpen(true);
            }
            if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
                event.preventDefault();
                setIsSyncDebugOpen(prev => !prev);
            }
            if (event.key === 'Escape') {
                // cancelConnection(); // Removed
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentView]);

    const handleToggleDarkMode = () => setDarkMode(prev => !prev);

    const handleViewChange = (view: View) => {
        setCurrentView(view);
        // Always clear selection when leaving split-pane, UNLESS we are going to assistant
        if (view !== 'split-pane' && view !== 'assistant') {
            setSelectedGraphNodeId(null);
        }
    };

    const handleSelectNode = (node: GraphNode | null) => {
        setSelectedGraphNodeId(node?.id || null);
    };

    // Schema for Talmudic Page Data (Full Generation)
    const rootNodeSchema = {
        type: SchemaType.OBJECT,
        properties: {
            hebrewText: { type: SchemaType.STRING },
            hebrewTranslation: { type: SchemaType.STRING },
            translation: { type: SchemaType.STRING },
            keywords: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
        },
        required: ["hebrewText", "hebrewTranslation", "translation", "keywords"]
    };

    // Schema for Supplementary Data (when text is fetched from Sefaria)
    const supplementaryDataSchema = {
        type: SchemaType.OBJECT,
        properties: {
            hebrewTranslation: { type: SchemaType.STRING },
            keywords: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
        },
        required: ["hebrewTranslation", "keywords"]
    };

    const addAIFoundRootNode = async (finding: AIFinding, markAsLoading: boolean = true) => {
        if (markAsLoading) setIsLoading(true);
        try {
            // 1. Try to fetch text from Sefaria
            const sefariaData = await fetchTalmudText(finding.source);

            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            const client = new GoogleGenAI({ apiKey: apiKey });

            let aiData: any;

            if (sefariaData) {
                // Sefaria success: Ask AI only for explanation and keywords
                const result = await client.models.generateContent({
                    model: "gemini-2.0-flash",
                    contents: [{ role: 'user', parts: [{ text: `Provide a Steinsaltz-style Hebrew explanation and keywords for this Talmudic passage:\n\n${sefariaData.hebrewText}` }] }],
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: supplementaryDataSchema as any,
                        systemInstruction: {
                            role: 'system',
                            parts: [{
                                text: `You are a helpful assistant specialized in rabbinic literature. 
                            The user has provided the text of a Talmudic passage. You must provide:
                            1. "hebrewTranslation": A Steinsaltz-style Hebrew translation / explanation of the provided text.
                            2. "keywords": A list of 3-5 keywords relevant to the passage.` }]
                        }
                    }
                });
                aiData = JSON.parse(cleanJsonString(result.text as string));
                // Merge Sefaria text with AI data
                aiData.hebrewText = sefariaData.hebrewText;
                aiData.translation = sefariaData.translation;
            } else {
                // Sefaria failed: Fallback to full AI generation
                console.warn("Sefaria fetch failed, falling back to AI generation for", finding.source);
                const result = await client.models.generateContent({
                    model: "gemini-2.0-flash",
                    contents: [{ role: 'user', parts: [{ text: `Extract information for the Talmudic passage: ${finding.title} (${finding.source})` }] }],
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: rootNodeSchema as any,
                        systemInstruction: {
                            role: 'system',
                            parts: [{
                                text: `You are a helpful assistant specialized in rabbinic literature. For a given Talmudic source, you must provide:
                            1. "hebrewText": The FULL original Hebrew/Aramaic text of the entire Talmudic page or sugya. Do NOT just provide a snippet. Provide the complete context (e.g., the whole Amud or relevant discussion).
                            2. "hebrewTranslation": The Steinsaltz Hebrew translation / explanation.
                            3. "translation": A complete English translation of the full 'hebrewText' provided above.
                            4. "keywords": A list of 3-5 keywords.` }]
                        }
                    }
                });
                aiData = JSON.parse(cleanJsonString(result.text as string));
            }

            const keywords = Array.isArray(aiData.keywords) ? aiData.keywords : [];
            const userNotesKeywords = `<h3>Suggested Keywords</h3><ul>${keywords.map((kw: string) => `<li>${kw}</li>`).join('')}</ul><p><strong>AI Justification:</strong> ${finding.justification || 'N/A'}</p>`;

            const newNodeData: Omit<RootNode, 'id' | 'position'> = {
                title: finding.title || 'Untitled AI Suggestion',
                sourceText: finding.source,
                type: 'root',
                hebrewText: aiData.hebrewText || '',
                hebrewTranslation: aiData.hebrewTranslation || '', // Steinsaltz
                translation: aiData.translation || '',
                userNotesKeywords: userNotesKeywords,
                style: {
                    borderColor: '#2B3A67', // ai-primary color
                    borderWidth: 3,
                }
            };

            // Create the initial branch for the specific finding that triggered this root creation
            const initialBranch: Omit<BranchNode, 'id' | 'position' | 'type'> = {
                author: finding.author || 'Discovered Author',
                workTitle: finding.workTitle || (finding.source ? finding.source.split(' ').slice(0, 2).join(' ') : 'Discovered Work'),
                publicationDetails: 'From analyzed text',
                referenceText: buildReferenceText(finding),
                userNotes: buildUserNotes(finding),
                ...(finding.isGroundTruth && { keywords: ['ground-truth', 'verified'] }),
                ...(finding.sourceDocumentId && { sourceDocumentId: finding.sourceDocumentId }),
                style: { borderColor: '#2B3A67', borderWidth: 2 }
            };

            console.log("[addAIFoundRootNode] Creating new root with initial branch:", initialBranch);
            await handleCreateRootNode(newNodeData, initialBranch);
            setCurrentView('split-pane');

        } catch (error) {
            console.error("Failed to create AI-found root node:", error);
            alert("Failed to process the AI suggestion. Please try creating the node manually.");
            throw error; // re-throw to be caught by caller
        } finally {
            if (markAsLoading) setIsLoading(false);
        }
    }

    // Helper to build rich reference text with context
    const buildReferenceText = (finding: AIFinding): string => {
        const parts: string[] = [];
        if (finding.contextBefore) parts.push(finding.contextBefore);
        parts.push(finding.snippet);
        if (finding.contextAfter) parts.push(finding.contextAfter);
        return parts.join(' ').trim() || finding.snippet;
    };

    // Helper to build comprehensive userNotes including all modifications from Analyzer
    const buildUserNotes = (finding: AIFinding): string => {
        const parts: string[] = ['Added from Reference Detector.', ''];

        parts.push(`**Source:** ${finding.source}`);

        // Include Hebrew text fetched from Sefaria when user corrected the source
        if (finding.matchingPhrase) {
            parts.push('');
            parts.push(`**Talmudic Text:**`);
            parts.push(finding.matchingPhrase);
        }

        // Include Sefaria translation if available
        if (finding.sefariaTranslation) {
            parts.push('');
            parts.push(`**Translation:**`);
            parts.push(finding.sefariaTranslation);
        }

        // AI justification
        if (finding.justification) {
            parts.push('');
            parts.push(`**AI Justification:** ${finding.justification}`);
        }

        // User's correction explanation (from "Suggest Alternative Source" or GT marking)
        if (finding.userExplanation) {
            parts.push('');
            parts.push(`**User Notes:** ${finding.userExplanation}`);
        }

        // Ground truth indicator
        if (finding.isGroundTruth) {
            parts.push('');
            parts.push('✓ Verified as Ground Truth');
        }

        return parts.join('\n');
    };

    const handleApproveAIFinding = async (finding: AIFinding) => {
        console.log("handleApproveAIFinding called with:", finding);
        console.log(`[Approve] workTitle="${finding.workTitle}", author="${finding.author}", source="${finding.source}"`);
        try {
            if (finding.type === AIFindingType.NewForm) {
                await addAIFoundRootNode(finding);
                return;
            }

            if (finding.type === AIFindingType.Connection) {
                if (!finding.target) return;
                const newEdge: GraphEdge = {
                    id: `edge-${crypto.randomUUID()}`,
                    source: finding.source,
                    target: finding.target,
                    category: LinkCategory.ThematicParallel,
                    label: 'AI Suggestion'
                };
                // await handleAddEdge(newEdge);
                console.warn("Edge creation is not supported in the new tree model.");
                alert("Connections between trees are not yet supported in the new data model.");
                setCurrentView('split-pane');
                return;
            }

            // Helper to normalize source text for comparison
            const normalizeSourceText = (text: string) => {
                return text.toLowerCase()
                    .replace(/^(bavli|yerushalmi|masechet|tractate|b\.|y\.|בבלי|ירושלמי|מסכת)\s*/gi, '')
                    .replace(/[.,\-:;]/g, '')
                    .replace(/['"״׳]/g, '') // Remove quotes
                    .replace(/\s+/g, ' ')
                    .trim();
            };

            if (finding.type === AIFindingType.Reference) {
                const normalizedFindingSource = normalizeSourceText(finding.source);

                const existingRoot = allNodes.find(n => {
                    if (n.type !== 'root') return false;
                    const root = n as RootNode;
                    const normalizedRootSource = normalizeSourceText(root.sourceText);

                    // Direct exact match
                    if (normalizedRootSource === normalizedFindingSource) return true;

                    // Smart match: only if one is a prefix variant of the other
                    // e.g., "berakhot 2a" matches "bavli berakhot 2a" but NOT "berakhot 5a"
                    // Check if they share the same tractate + page reference
                    const extractTractateAndPage = (text: string) => {
                        // Match tractate name followed by page number (e.g., "berakhot 2a", "shabbat 6a")
                        const match = text.match(/^(.+?)\s*(\d+[ab]?)$/i);
                        return match ? { tractate: match[1].trim(), page: match[2].toLowerCase() } : null;
                    };

                    const findingParts = extractTractateAndPage(normalizedFindingSource);
                    const rootParts = extractTractateAndPage(normalizedRootSource);

                    if (findingParts && rootParts) {
                        // Both have tractate+page format - must match exactly
                        const tractateMatch = findingParts.tractate === rootParts.tractate ||
                            findingParts.tractate.includes(rootParts.tractate) ||
                            rootParts.tractate.includes(findingParts.tractate);
                        const pageMatch = findingParts.page === rootParts.page;

                        if (tractateMatch && pageMatch) {
                            console.log(`[Source Match] Matched "${finding.source}" to "${root.sourceText}"`);
                            return true;
                        }
                    }

                    return false;
                });

                // Determine action based on status or auto-detect
                let shouldAddToExisting = false;
                let shouldCreateNew = false;

                console.log(`[Approve Flow] existingRoot found: ${!!existingRoot}`, existingRoot ? `"${(existingRoot as RootNode).sourceText}"` : 'none');
                console.log(`[Approve Flow] finding.status: ${finding.status}`);

                if (finding.status === AIFindingStatus.AddedToExistingRoot) {
                    shouldAddToExisting = true;
                    console.log(`[Approve Flow] Status says: AddedToExistingRoot`);
                } else if (finding.status === AIFindingStatus.AddedAsNewRoot) {
                    shouldCreateNew = true;
                    console.log(`[Approve Flow] Status says: AddedAsNewRoot`);
                } else {
                    // Default/Auto behavior (legacy or simple 'Added' status)
                    if (existingRoot) {
                        shouldAddToExisting = true;
                        console.log(`[Approve Flow] Auto-detect: Add to existing root`);
                    } else {
                        shouldCreateNew = true;
                        console.log(`[Approve Flow] Auto-detect: Create new root`);
                    }
                }

                console.log(`[Approve Flow] DECISION: shouldAddToExisting=${shouldAddToExisting}, shouldCreateNew=${shouldCreateNew}`);

                if (shouldAddToExisting) {
                    if (existingRoot) {
                        // Case 1: Root already exists. Add a new branch to its tree.
                        const parentNode = existingRoot as RootNode;
                        const parentTree = receptionForest.find(t => t.root?.id === parentNode.id);

                        if (!parentTree) {
                            console.error("Could not find a tree for the existing root node.");
                            throw new Error("Parent tree not found for existing root.");
                        }

                        // Check for duplicates
                        const duplicateBranch = parentTree.branches?.find(b => {
                            const isSameWork = finding.workTitle ? b.workTitle === finding.workTitle : true;
                            if (!isSameWork) return false;

                            const snippetA = b.referenceText.trim().toLowerCase();
                            const snippetB = finding.snippet.trim().toLowerCase();
                            return snippetA === snippetB || snippetA.includes(snippetB) || snippetB.includes(snippetA);
                        });

                        if (duplicateBranch) {
                            alert(`This reference already exists in the graph!\n\n` +
                                `Work: "${duplicateBranch.workTitle}"\n` +
                                `Look in Dashboard under the tree for: "${parentNode.sourceText}"\n\n` +
                                `Click on that tree to see its branches.`);
                            return;
                        }

                        // Use finding author/title if available, otherwise fallback
                        const branchAuthor = finding.author || 'Discovered Author';
                        const branchWorkTitle = finding.workTitle || (finding.source ? finding.source.split(' ').slice(0, 2).join(' ') : 'Discovered Work');

                        const newBranchNode: Omit<BranchNode, 'id' | 'position' | 'type'> = {
                            author: branchAuthor,
                            workTitle: branchWorkTitle,
                            publicationDetails: 'From analyzed text',
                            referenceText: buildReferenceText(finding),
                            userNotes: buildUserNotes(finding),
                            ...(finding.isGroundTruth && { keywords: ['ground-truth', 'verified'] }),
                            ...(finding.sourceDocumentId && { sourceDocumentId: finding.sourceDocumentId }),
                            style: { borderColor: '#2B3A67', borderWidth: 2 }
                        };
                        console.log("[Approving Finding] Creating branch node:", newBranchNode);
                        console.log(`[Approving Finding] Adding to tree: ${parentTree.id}, root: ${parentNode.sourceText}`);
                        await handleCreateBranchNode(newBranchNode, parentTree.id, parentNode.id, true);
                        console.log("[Approving Finding] ✅ Branch created successfully");
                        alert(`Successfully added reference to "${finding.source}"! Check the tree for "${parentNode.sourceText}" in Dashboard.`);
                    } else {
                        // User wanted to add to existing, but it wasn't found. Fallback to creating new.
                        console.warn("Existing root not found during approval, despite initial check. Creating new instead.");
                        shouldCreateNew = true;
                    }
                }

                if (shouldCreateNew) {
                    // Case 2: Create a new tree with the root and the branch together.

                    // Use Sefaria data as fallback for missing fields
                    let hebrewTextForRoot = finding.hebrewText || finding.matchingPhrase;
                    let translationForRoot = finding.translation || finding.sefariaTranslation;

                    // If still missing, try to fetch from Sefaria
                    if (!hebrewTextForRoot || !translationForRoot) {
                        console.log('[New Root] Missing text data, attempting to fetch from Sefaria:', finding.source);
                        try {
                            const sefariaData = await fetchTalmudText(finding.source);
                            if (sefariaData) {
                                hebrewTextForRoot = hebrewTextForRoot || sefariaData.hebrewText;
                                translationForRoot = translationForRoot || sefariaData.translation;
                                console.log('[New Root] Successfully fetched from Sefaria');
                            }
                        } catch (err) {
                            console.warn('[New Root] Sefaria fetch failed:', err);
                        }
                    }

                    // Final check - if still missing, we can't create the root
                    if (!hebrewTextForRoot) {
                        console.error("Cannot create new root: Hebrew text is missing and could not be fetched.", finding);
                        alert("Could not create the new passage. Try using 'Add to Existing Root' instead, or the text might not be available in Sefaria.");
                        throw new Error("Missing required Hebrew text for new root node.");
                    }

                    const newTreeId = finding.source.toLowerCase().replace(/\s/g, '_').replace(/\./g, '') + '-' + generateUUID().split('-')[0];

                    const PADDING_X = 100;
                    const PADDING_Y = 100;
                    let maxX = 50;
                    allNodes.forEach(n => { if (n.position && n.position.x > maxX) maxX = n.position.x; });
                    const newRootX = maxX + PADDING_X;
                    const newRootY = PADDING_Y;

                    const newRootNode: RootNode = {
                        id: IDHelpers.generateRootId(newTreeId),
                        type: 'root',
                        position: { x: newRootX, y: newRootY },
                        title: finding.source, // Use the citation as the main title (e.g., "Bavli Berakhot 5a")
                        sourceText: finding.source,
                        hebrewText: hebrewTextForRoot,
                        hebrewTranslation: finding.hebrewTranslation || '',
                        translation: translationForRoot || '',
                        userNotesKeywords: `<h3>${finding.title || 'AI Analysis'}</h3><p>${finding.justification || ''}</p>`,
                        style: { borderColor: '#2B3A67', borderWidth: 3 }
                    };

                    const newBranchNode: BranchNode = {
                        id: IDHelpers.generateBranchId(newTreeId, 0),
                        type: 'branch',
                        position: { x: newRootX + 5 + (Math.random() * 5), y: newRootY + 15 + (Math.random() * 5) },
                        author: finding.author || 'Discovered Author',
                        workTitle: finding.workTitle || 'Discovered Work',
                        publicationDetails: 'From analyzed text',
                        referenceText: buildReferenceText(finding),
                        userNotes: buildUserNotes(finding),
                        style: { borderColor: '#2B3A67', borderWidth: 2 },
                        ...(finding.isGroundTruth && { keywords: ['ground-truth', 'verified'] }),
                        ...(finding.sourceDocumentId && { sourceDocumentId: finding.sourceDocumentId })
                    };

                    const newTree: ReceptionTree = {
                        id: newTreeId,
                        root: newRootNode,
                        branches: [newBranchNode]
                    };

                    await setDoc(doc(db, 'receptionTrees', newTreeId), newTree);
                    alert(`Successfully created new page for "${finding.source}"!`);
                    // Do not switch view, let user continue analyzing
                    // setCurrentView('split-pane');
                }
                // setCurrentView('split-pane');
                return;
            }

            // For RootMatch and ThematicFit, add a new branch
            const tree = receptionForest.find(t => t.root.sourceText === finding.source);

            if (!tree) {
                console.error("Cannot add branch: parent tree or root node not found for source:", finding.source);
                alert(`Could not find the parent passage "${finding.source}" in your forest to add this connection.`);
                throw new Error("Parent tree not found"); // Throw to indicate failure
            }

            const rootNode = tree.root; // Get root directly

            const newBranchData: Omit<BranchNode, 'id' | 'position' | 'type'> = {
                author: finding.author || 'Discovered Author',
                workTitle: finding.workTitle || 'Discovered Work',
                publicationDetails: 'From analyzed text',
                referenceText: buildReferenceText(finding),
                userNotes: buildUserNotes(finding),
                ...(finding.isGroundTruth && { keywords: ['ground-truth', 'verified'] }),
                ...(finding.sourceDocumentId && { sourceDocumentId: finding.sourceDocumentId }),
                style: {
                    borderColor: '#2B3A67', // ai-primary color
                    borderWidth: 2,
                }
            };
            await handleCreateBranchNode(newBranchData, tree.id, rootNode.id, true);
            setCurrentView('split-pane');
        } catch (error: any) {
            console.error("Error approving finding:", error);
            alert(`Failed to add suggestion: ${error.message || "Unknown error"}`);
        }
    };


    const handleUpdateFinding = async (findingId: string, newStatus: AIFindingStatus) => {
        const finding = aiFindings.find(f => f.id === findingId);
        if (!finding || finding.status === newStatus) return;

        if (newStatus === AIFindingStatus.Added) {
            setIsLoading(true);
            try {
                await handleApproveAIFinding(finding);
                setAIFindings(prev => prev.map(f => f.id === findingId ? { ...f, status: newStatus } : f));
            } catch (error) {
                console.error("Failed to approve AI finding:", error);
            } finally {
                setIsLoading(false);
            }
        } else {
            setAIFindings(prev => prev.map(f => f.id === findingId ? { ...f, status: newStatus } : f));
        }
    };

    const handleCreateRootNode = async (node: Omit<RootNode, 'id' | 'position'>, initialBranch?: Omit<BranchNode, 'id' | 'position' | 'type'>) => {
        console.log('[Smart Sync] Checking for duplicate of:', node.sourceText);

        // Smart Sync: Check for existing root with same source text
        const normalizeSourceText = (text: string) => {
            return text.toLowerCase()
                // Remove common prefixes/suffixes anywhere in the string
                .replace(/\b(bavli|yerushalmi|masechet|tractate|talmud|b\.|y\.|t\.)\b/g, '')
                // Remove punctuation
                .replace(/[.,\-:;()]/g, '')
                // Normalize whitespace
                .replace(/\s+/g, ' ')
                .trim();
        };

        const normalizedNewSource = normalizeSourceText(node.sourceText);
        console.log('[Smart Sync] Normalized source:', normalizedNewSource);
        console.log('[Smart Sync] Searching through', allNodes.length, 'nodes');

        // Find existing root with matching normalized source
        const existingRoot = allNodes.find(n =>
            n.type === 'root' &&
            normalizeSourceText((n as RootNode).sourceText) === normalizedNewSource
        );

        if (existingRoot) {
            console.log('[Smart Sync] Found existing root:', existingRoot.id, existingRoot.sourceText);
            // Found a match!
            if (initialBranch) {
                console.log('[Smart Sync] Has initial branch, adding to existing tree');
                // If we have an initial branch, just add it to the existing root
                // Find parent tree by checking root ID
                const parentTree = receptionForest.find(t => t.root?.id === existingRoot.id);
                if (parentTree) {
                    await handleCreateBranchNode(initialBranch, parentTree.id, existingRoot.id);
                    setIsAddPassageModalOpen(false);
                    return;
                }
            }

            console.log('[Smart Sync] Showing confirmation dialog');

            // If we have a branch to add, ask if they want to add it to the existing tree
            // If no branch, just ask if they want to view the existing page
            const message = initialBranch
                ? `A page for "${existingRoot.sourceText}" already exists.\n\n` +
                `Click OK to add your commentary "${initialBranch.workTitle}" to the existing page.\n` +
                `Click Cancel to create a separate duplicate page (Not Recommended).`
                : `A page for "${existingRoot.sourceText}" already exists.\n\n` +
                `Click OK to view the existing page.\n` +
                `Click Cancel to create a duplicate (Not Recommended).`;

            const shouldLink = window.confirm(message);

            console.log('[Smart Sync] User chose:', shouldLink ? 'Link to existing' : 'Create duplicate');
            if (shouldLink) {
                // If we have a branch, add it to the existing tree first
                if (initialBranch) {
                    console.log('[Smart Sync] Adding branch to existing tree before viewing');
                    const parentTree = receptionForest.find(t => t.root?.id === existingRoot.id);
                    if (parentTree) {
                        await handleCreateBranchNode(initialBranch, parentTree.id, existingRoot.id);
                    } else {
                        console.error('[Smart Sync] Could not find parent tree for existing root');
                    }
                }

                // Then view the page
                setSelectedGraphNodeId(existingRoot.id);
                setCurrentView('split-pane');
                setIsAddPassageModalOpen(false);
                return;
            }
            // If they say no, we proceed to create a duplicate
        } else {
            console.log('[Smart Sync] No existing root found, creating new tree');
        }


        const newTreeId = node.sourceText.toLowerCase().replace(/\s/g, '_').replace(/\./g, '');
        // Generate composite Root ID
        const newNodeId = IDHelpers.generateRootId(newTreeId);

        let maxX = 50;
        let maxY = 50;
        let count = 0;
        allNodes.forEach(n => {
            if (n.position && n.position.x > maxX) maxX = n.position.x;
            if (n.position && n.position.y > maxY) maxY = n.position.y;
            count++;
        });
        const newX = (count % 5) * 250 + 100;
        const newY = Math.floor(count / 5) * 200 + 100;

        const newRootNode: RootNode = {
            ...node,
            id: newNodeId,
            type: 'root',
            position: { x: newX, y: newY }
        };

        const branches: BranchNode[] = [];

        if (initialBranch) {
            // Generate composite Branch ID (index 0)
            const newBranchId = IDHelpers.generateBranchId(newTreeId, 0);
            const newBranchNode: BranchNode = {
                ...initialBranch,
                id: newBranchId,
                type: 'branch',
                position: { x: newX + 50, y: newY + 150 } // Offset from root
            };
            branches.push(newBranchNode);
        }

        const newTree: ReceptionTree = {
            id: newTreeId,
            root: newRootNode,
            branches: branches,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await setDoc(doc(db, "receptionTrees", newTreeId), newTree);

        setIsAddPassageModalOpen(false);
        setCurrentView('split-pane');
        setSelectedGraphNodeId(initialBranch ? branches[0].id : newRootNode.id);
    };





    const handleCreateBranchNode = async (branchData: Omit<BranchNode, 'id' | 'position' | 'type'>, parentTreeId: string, parentNodeId?: string, isFromAI: boolean = false) => {
        const treeToUpdate = receptionForest.find(tree => tree.id === parentTreeId);
        if (!treeToUpdate) {
            console.error(`Could not find parent tree with id "${parentTreeId}" to add branch to.`);
            return;
        }

        // Get current branch count to generate index for ID
        const branchIndex = treeToUpdate.branches.length;

        // Generate composite ID
        const newNodeId = IDHelpers.generateBranchId(parentTreeId, branchIndex);

        // Sanity check: Ensure ID is in correct format
        if (!IDHelpers.isValidCompositeId(newNodeId)) {
            console.error('[ID Generation Error] Generated invalid ID:', newNodeId);
            throw new Error('Failed to generate valid composite ID');
        }
        console.log(`[Branch Creation] ✅ Generated composite ID: ${newNodeId} `);



        // Position relative to root node
        const sourcePos = treeToUpdate.root.position || { x: 0, y: 0 };

        const newBranchNode: BranchNode = {
            ...branchData,
            id: newNodeId,
            type: 'branch',
            position: { x: sourcePos.x + 50 + (Math.random() * 50), y: sourcePos.y + 200 + (Math.random() * 50) },
        };

        // Update Firestore: add to branches array
        const treeDocRef = doc(db, "receptionTrees", parentTreeId);
        await updateDoc(treeDocRef, {
            branches: arrayUnion(newBranchNode),
            updatedAt: new Date()
        });

        if (!isFromAI) {
            setIsAddPassageModalOpen(false);
            setAddBranchParent(null);
            setCurrentView('split-pane');
        }
        setSelectedGraphNodeId(newBranchNode.id);
    };

    const handleMoveBranch = async (branchId: string, targetRootId: string) => {
        console.log('[Move Branch] Starting move of branch', branchId, 'to root', targetRootId);

        try {
            // 1. Find source tree (tree containing this branch)
            const sourceTree = receptionForest.find(t =>
                t.branches?.some(b => b.id === branchId)
            );

            // 2. Find target tree by root ID
            const targetTree = receptionForest.find(t => t.root?.id === targetRootId);

            if (!sourceTree) {
                alert('Could not find the tree containing this branch');
                return;
            }

            if (!targetTree) {
                alert('Could not find the target tree');
                return;
            }

            if (sourceTree.id === targetTree.id) {
                alert('Branch is already in this tree');
                return;
            }

            // 3. Get the branch to move
            const branchToMove = sourceTree.branches?.find(b => b.id === branchId);
            if (!branchToMove) {
                alert('Branch not found');
                return;
            }

            console.log('[Move Branch] Moving from', sourceTree.id, 'to', targetTree.id);

            // 4. Remove from source tree
            const updatedSourceBranches = sourceTree.branches?.filter(b => b.id !== branchId) || [];
            const updatedSourceTree = { ...sourceTree, branches: updatedSourceBranches };

            // 5. Add to target tree
            const updatedTargetBranches = [...(targetTree.branches || []), branchToMove];
            const updatedTargetTree = { ...targetTree, branches: updatedTargetBranches };

            // 6. Update both trees in Firestore using batch
            const batch = writeBatch(db);
            batch.set(doc(db, 'receptionTrees', sourceTree.id), updatedSourceTree);
            batch.set(doc(db, 'receptionTrees', targetTree.id), updatedTargetTree);
            await batch.commit();

            console.log('[Move Branch] Successfully moved branch');
            alert(`Successfully moved branch to "${targetTree.root.title}"`);

            // Keep the branch selected so user can see it moved
            setSelectedGraphNodeId(branchId);
        } catch (error) {
            console.error('[Move Branch] Error:', error);
            alert('Failed to move branch. Check console for details.');
        }
    };


    // ...

    const handleSaveAnalysisToLibrary = async (text: string, title: string, findings: AIFinding[], textId?: string, fullTranscribedText?: string) => {
        console.log('[App] handleSaveAnalysisToLibrary called', { textId, findingsCount: findings.length, hasFullText: !!fullTranscribedText });
        try {
            // We are now using Text-Only workflow to avoid CORS issues with PDF uploads
            // The fullTranscribedText contains the complete text with [[PAGE_X]] markers

            // Truncate large fields in findings to prevent Firestore 1MB document limit
            // 500 words ≈ 3500 characters per field
            const MAX_FIELD_LENGTH = 3500;
            const truncateField = (value: any): string => {
                // Return empty string for undefined/null, Firestore doesn't accept undefined
                if (value === undefined || value === null) return '';
                if (typeof value !== 'string') return String(value);
                return value.length > MAX_FIELD_LENGTH
                    ? value.substring(0, MAX_FIELD_LENGTH) + '...[truncated for storage]'
                    : value;
            };

            // Sanitize findings: remove all undefined values (Firestore rejects undefined)
            const sanitizeForFirestore = (obj: any): any => {
                return JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
            };

            const sanitizedFindings = findings.map(f => sanitizeForFirestore({
                ...f,
                hebrewText: truncateField(f.hebrewText),
                translation: truncateField(f.translation),
                justification: truncateField(f.justification),
            }));

            // Also truncate fullTranscribedText if it's too large (max 500KB to be safe)
            const MAX_TEXT_LENGTH = 500000;
            const truncatedFullText = fullTranscribedText && fullTranscribedText.length > MAX_TEXT_LENGTH
                ? fullTranscribedText.substring(0, MAX_TEXT_LENGTH) + '...[truncated for storage]'
                : fullTranscribedText;

            if (textId) {
                console.log('[App] Updating existing text:', textId);
                // Update existing text - DON'T overwrite 'text' field to preserve original layout
                const updateData: any = {
                    title,
                    // NOTE: We intentionally don't update 'text' here to preserve original formatting
                    // (e.g., page breaks from PDF transcription). The original text is kept as-is.
                    findings: sanitizedFindings,
                    updatedAt: new Date()
                };
                if (truncatedFullText) {
                    updateData.fullTranscribedText = truncatedFullText;
                }
                await updateDoc(doc(db, 'user_texts', textId), updateData);
                alert("Analysis updated in library!");
                return textId;
            } else {
                console.log('[App] Creating new text');
                // Create new text
                const docRef = await addDoc(collection(db, 'user_texts'), {
                    title,
                    text,
                    createdAt: new Date(),
                    findings: sanitizedFindings,
                    fullTranscribedText: truncatedFullText || null,
                    status: 'pending' // Default status for new texts
                });
                alert("Analysis saved to library!");
                return docRef.id;
            }
        } catch (error: any) {
            console.error("Failed to save analysis to library:", error);
            alert(`Failed to save text to library history: ${error.message || "Unknown error"} `);
            return null;
        }
    };

    // ...

    const handleAnalyzeFromLibrary = (text: UserText) => {
        console.log('[App] handleAnalyzeFromLibrary called', { id: text.id, findingsCount: text.findings?.length, hasPdf: !!text.pdfUrl });
        setPendingAnalysis({
            text: text.text,
            author: text.author || 'Unknown',
            title: text.title,
            id: text.id,
            findings: text.findings,
            pdfUrl: text.pdfUrl,
            fullTranscribedText: text.fullTranscribedText
        });
        setCurrentView('analyzer');
    };

    const [pendingAnalysis, setPendingAnalysis] = useState<{ text: string; author: string; title: string; id?: string; findings?: AIFinding[]; pdfUrl?: string; fullTranscribedText?: string } | null>(null);

    const handleBenYehudaImport = async (workId: string, title: string) => {
        setIsBenYehudaModalOpen(false);
        setIsLoading(true);
        try {
            const workData = await BenYehudaAPI.getWorkText(workId);
            const textContent = workData.html || workData.text || '';
            const authorName = workData.author?.name || 'Unknown Author';

            // Save to My Library (user_texts)
            const docRef = await addDoc(collection(db, 'user_texts'), {
                title: title,
                author: authorName,
                text: textContent,
                createdAt: Timestamp.now(),
                findings: [], // Initial empty findings
                keywords: ['Ben Yehuda Import'],
                bibliographicalInfo: `Imported from Project Ben Yehuda (ID: ${workId})`
            });

            // Set pending analysis data and switch view
            setPendingAnalysis({
                text: textContent,
                author: authorName,
                title: title,
                id: docRef.id,
                findings: []
            });
            setCurrentView('analyzer');

        } catch (error) {
            console.error("Failed to import from Ben Yehuda:", error);
            alert("Failed to import text. Please check the console for details.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRunFullAnalysis = async (fullText: string) => {
        setIsAnalysisModalOpen(false);
        setIsLoading(true);

        const graphSummary = receptionForest
            .filter(tree => tree.root)
            .map(tree => {
                const root = tree.root;
                return {
                    sourceText: root.sourceText,
                    title: root.title,
                    keywords: root.userNotesKeywords.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).join(', ')
                };
            });

        try {
            // Fetch positive training examples for few-shot learning
            const learningExamples = await getPositiveTrainingExamples(20);
            console.log('[handleRunFullAnalysis] Fetched learning examples:', learningExamples ? 'Found examples' : 'No examples yet');

            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            const client = new GoogleGenAI({ apiKey: apiKey });
            const prompt = `You are a Talmudic research assistant. Analyze the following user-provided text based on their current research graph.
${learningExamples}
--- USER TEXT ---
${fullText}
--- END USER TEXT ---

--- USER'S GRAPH SUMMARY ---
${JSON.stringify(graphSummary, null, 2)}
--- END GRAPH SUMMARY ---

Scan the user's text and identify three types of connections. Return a single JSON object with three arrays: "rootMatches", "thematicFits", and "newRoots".

*** CRITICAL: IMPLICIT CONCEPTUAL DISCOVERY ***
Identify IMPLICIT conceptual resemblances. If the text relies on Talmudic logic (e.g., 'Kal VaChomer', 'Chazaka', 'Miggu', 'Gezeira Shava', 'Binyan Av') without explicitly quoting sources, flag it as a 'Conceptual Echo'. 
Look for:
- Arguments structured using a fortiori reasoning without naming it
- Assumptions based on presumptive states (Chazaka) without citation
- Legal reasoning that mirrors specific Talmudic principles
- Use of dialectical Gemara-style argumentation patterns
Mark these items with "isImplicit": true and include "Conceptual Echo" in the justification.

For "rootMatches" and "thematicFits", each item must have:
- "snippet" (a relevant quote from the user text)
- "contextBefore" (the two sentences immediately preceding the snippet)
- "contextAfter" (the two sentences immediately following the snippet)
- "confidence" (a number 0-100)
- "source" (the Talmudic passage it matches, e.g., "Bavli Kiddushin 40b")
- "originalText" (the full quote in the original Hebrew/Aramaic)
- "author"
- "title"
- "justification" (why this matches - include "Conceptual Echo" for implicit pattern matches)
- "isImplicit" (boolean - TRUE if this is a conceptual pattern match without explicit citation)

For "newRoots", suggest new Talmudic passages that are NOT in the graph but are referenced in the text.

Output JSON ONLY.`;

            const result = await client.models.generateContent({
                model: "gemini-2.0-flash",
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: "application/json",
                }
            });

            const text = result.text as string;
            const jsonString = cleanJsonString(text);
            const analysis = JSON.parse(jsonString);

            setFullTextAnalysis(analysis);
            setIsAnalysisModalOpen(true);

            const findings: AIFinding[] = [];

            analysis.rootMatches?.forEach((item: any, i: number) => findings.push({
                id: `finding-rm-${crypto.randomUUID()}-${i}`,
                type: AIFindingType.RootMatch,
                status: AIFindingStatus.Pending,
                ...item
            }));
            analysis.thematicFits?.forEach((item: any, i: number) => findings.push({
                id: `finding-tf-${crypto.randomUUID()}-${i}`,
                type: AIFindingType.ThematicFit,
                status: AIFindingStatus.Pending,
                ...item
            }));
            analysis.newRoots?.forEach((item: any, i: number) => findings.push({
                id: `finding-nr-${crypto.randomUUID()}-${i}`,
                type: AIFindingType.NewForm,
                status: AIFindingStatus.Pending,
                ...item
            }));

            setAIFindings(findings);

            // Save to My Library
            const title = fullText.split('\n')[0].substring(0, 50) || 'Untitled Text';
            await setDoc(doc(collection(db, 'user_texts')), {
                title,
                text: fullText,
                createdAt: new Date(),
                findings: findings
            });

        } catch (error: any) {
            console.error("Full text analysis failed:", error);
            alert(`The AI analysis failed: ${error.message || "Unknown error"}. Please check the console for details.`);
        } finally {
            setIsLoading(false);
        }
    };



    const handleRegenerateRootData = async (rootNode: RootNode) => {
        setIsLoading(true);
        try {
            // 1. Try to fetch text from Sefaria
            // Use sourceText if available, otherwise title (which might be "Masechet ...")
            const ref = rootNode.sourceText || rootNode.title;
            const sefariaData = await fetchTalmudText(ref);

            const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

            let aiData: any;

            if (sefariaData) {
                // Sefaria success
                const response = await generateContentWithRetry(ai.models, {
                    model: 'gemini-2.0-flash',
                    contents: `Provide a Steinsaltz-style Hebrew explanation and keywords for this Talmudic passage:\n\n${sefariaData.hebrewText}`,
                    config: {
                        systemInstruction: `You are a helpful assistant specialized in rabbinic literature. 
                        The user has provided the text of a Talmudic passage. You must provide:
                        1. "hebrewTranslation": A Steinsaltz-style Hebrew translation / explanation of the provided text.
                        2. "keywords": A list of 3-5 keywords relevant to the passage.`,
                        responseMimeType: "application/json",
                        responseSchema: supplementaryDataSchema,
                    }
                });
                aiData = JSON.parse(cleanJsonString(response.text.trim()));
                aiData.hebrewText = sefariaData.hebrewText;
                aiData.translation = sefariaData.translation;

            } else {
                // Fallback
                console.warn("Sefaria fetch failed during regeneration, falling back to AI");
                const response = await generateContentWithRetry(ai.models, {
                    model: 'gemini-2.0-flash',
                    contents: `Extract information for the Talmudic passage: ${rootNode.title} (${rootNode.sourceText})`,
                    config: {
                        systemInstruction: `You are a helpful assistant specialized in rabbinic literature. For a given Talmudic source, you must provide:
                1. "hebrewText": The FULL original Hebrew/Aramaic text of the entire Talmudic page or sugya. Do NOT just provide a snippet. Provide the complete context (e.g., the whole Amud or relevant discussion).
                2. "hebrewTranslation": The Steinsaltz Hebrew translation / explanation.
                3. "translation": A complete English translation of the full 'hebrewText' provided above.
                4. "keywords": A list of 3 - 5 keywords.`,
                        responseMimeType: "application/json",
                        responseSchema: rootNodeSchema,
                    }
                });
                aiData = JSON.parse(cleanJsonString(response.text.trim()));
            }

            const keywords = Array.isArray(aiData.keywords) ? aiData.keywords : [];
            const userNotesKeywords = `< h3 > Suggested Keywords</h3 > <ul>${keywords.map((kw: string) => `<li>${kw}</li>`).join('')}</ul>`;

            const updatedRoot: RootNode = {
                ...rootNode,
                hebrewText: aiData.hebrewText || rootNode.hebrewText,
                hebrewTranslation: aiData.hebrewTranslation || '',
                translation: aiData.translation || rootNode.translation,
                userNotesKeywords: userNotesKeywords
            };

            await handleSaveNodeChanges(updatedRoot);
            alert("Page data regenerated successfully!");

        } catch (error) {
            console.error("Failed to regenerate root data:", error);
            alert("Failed to regenerate data. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };



    const handleSaveNodeChanges = async (updatedNode: GraphNode) => {
        const tree = receptionForest.find(t =>
            t.root?.id === updatedNode.id || t.branches?.some(b => b.id === updatedNode.id)
        );
        if (!tree) return;

        const treeDocRef = doc(db, "receptionTrees", tree.id);

        // Helper to sanitize object for Firestore (remove undefined)
        const sanitizeForFirestore = (obj: any): any => {
            return JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
        };

        const sanitizedNode = sanitizeForFirestore(updatedNode);

        if (updatedNode.type === 'root') {
            await updateDoc(treeDocRef, { root: sanitizedNode, updatedAt: new Date() });
        } else {
            // Branch update
            if (!tree.branches) return;
            const updatedBranches = tree.branches.map(b => b.id === updatedNode.id ? sanitizedNode : b);
            await updateDoc(treeDocRef, { branches: updatedBranches, updatedAt: new Date() });
        }
    };

    const handleDeleteNode = async (nodeId: string) => {
        if (!window.confirm("Are you sure you want to delete this node and all its connections? This action cannot be undone.")) {
            return;
        }

        // Find tree containing the node
        const tree = receptionForest.find(t =>
            t.root?.id === nodeId || t.branches?.some(b => b.id === nodeId)
        );

        if (!tree) {
            console.error("Tree not found for node ID:", nodeId);
            return;
        }

        try {
            if (tree.root && tree.root.id === nodeId) {
                // Deleting root -> delete entire tree
                await deleteDoc(doc(db, "receptionTrees", tree.id));
            } else if (tree.branches) {
                // Deleting branch
                const branchToDelete = tree.branches.find(b => b.id === nodeId);
                if (branchToDelete) {
                    await updateDoc(doc(db, "receptionTrees", tree.id), {
                        branches: arrayRemove(branchToDelete)
                    });
                }
            }
            setSelectedGraphNodeId(null);
        } catch (error) {
            console.error("Error during deletion:", error);
            alert("Failed to delete node. Check console for details.");
        }
    };

    const handleMergeTrees = async (targetTreeId: string, sourceTreeIds: string[]) => {
        const targetTree = receptionForest.find(t => t.id === targetTreeId);
        if (!targetTree || !targetTree.root) return;

        const targetRoot = targetTree.root;

        for (const sourceId of sourceTreeIds) {
            const sourceTree = receptionForest.find(t => t.id === sourceId);
            if (!sourceTree || !sourceTree.root) continue;

            const sourceRoot = sourceTree.root;
            const sourceBranches = sourceTree.branches || [];

            const branchesToAdd: BranchNode[] = [];

            // 1. Check if we need to convert Source Root to a Branch
            const hasEquivalentBranch = sourceBranches.some(b => b.workTitle === sourceRoot.title);

            if (!hasEquivalentBranch) {
                // Generate new ID for the converted root
                // We use a timestamp-based index to ensure uniqueness even in loop
                const newBranchId = IDHelpers.generateBranchId(targetTreeId, Date.now() + branchesToAdd.length);

                const newBranchFromRoot: BranchNode = {
                    id: newBranchId,
                    type: 'branch',
                    workTitle: sourceRoot.title,
                    author: 'Unknown',
                    publicationDetails: 'Merged from Root',
                    referenceText: sourceRoot.translation || '',
                    userNotes: `Original Source: ${sourceRoot.sourceText}\n\n${sourceRoot.userNotesKeywords}`,
                    position: { x: 0, y: 0 }
                };
                branchesToAdd.push(newBranchFromRoot);
            }

            // 2. Move existing branches
            // We re-ID them to match the target tree context and ensure uniqueness
            sourceBranches.forEach((branch, index) => {
                const newBranchId = IDHelpers.generateBranchId(targetTreeId, Date.now() + branchesToAdd.length + 100); // Offset to avoid collision with root-branch
                const movedBranch: BranchNode = {
                    ...branch,
                    id: newBranchId,
                };
                branchesToAdd.push(movedBranch);
            });

            // 3. Update Target Tree
            const targetTreeRef = doc(db, "receptionTrees", targetTreeId);
            await updateDoc(targetTreeRef, {
                branches: arrayUnion(...branchesToAdd)
            });

            // 4. Delete Source Tree
            await deleteDoc(doc(db, "receptionTrees", sourceId));
        }

        setSelectedGraphNodeId(targetRoot.id);
        alert("Merge completed successfully!");
    };


    const handleSendMessage = async (message: string, context?: string) => {
        setIsLoading(true);
        const userMessage: ChatMessage = { role: 'user', text: message };
        setChatHistory(prev => [...prev, userMessage]);

        try {
            // Build the effective message with context
            const effectiveMessage = context ? `${context}\n\n${message}` : message;

            let responseText: string;

            // Try Interactions API first (server-side state = cost savings)
            if (isInteractionsAvailable()) {
                // Use a consistent session ID for the main assistant chat
                const sessionId = 'main-assistant';

                // Initialize session with system instruction on first use
                // (The session persists across calls via previous_interaction_id)
                const result = await sendInteractionMessage(sessionId, effectiveMessage);
                responseText = result.text;
                console.log('[AI] Used Interactions API (server-side state)');
            } else if (chat) {
                // Fallback to legacy Chat API
                const result = await chat.sendMessage({ message: effectiveMessage });
                responseText = result.text as string;
                console.log('[AI] Used legacy Chat API');
            } else {
                throw new Error('No AI chat session available');
            }

            const modelMessage: ChatMessage = { role: 'model', text: responseText };
            setChatHistory(prev => [...prev, modelMessage]);
        } catch (error) {
            console.error("Error sending message to AI:", error);
            const errorMessage: ChatMessage = { role: 'model', text: "Sorry, I encountered an error. Please try again." };
            setChatHistory(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStandardizeTitles = async () => {
        if (!confirm("This will rename all pages to match their source citation (e.g., 'Morning Prayer' -> 'Bavli Berachot 5a'). Old titles will be saved in the notes. Continue?")) return;

        setIsLoading(true);
        try {
            const batch = writeBatch(db);
            let updatedCount = 0;

            receptionForest.forEach(tree => {
                const rootNode = tree.root;
                if (!rootNode) return;

                // Check if title needs standardization
                if (rootNode.title.trim() !== rootNode.sourceText.trim()) {
                    const oldTitle = rootNode.title;
                    const newTitle = rootNode.sourceText;

                    // Append old title to user notes if it's not already there
                    let newNotes = rootNode.userNotesKeywords || "";
                    if (!newNotes.includes(`Old Title: ${oldTitle} `)) {
                        newNotes = `< h3 > Old Title: ${oldTitle}</h3 > ` + newNotes;
                    }

                    const updatedRoot = {
                        ...rootNode,
                        title: newTitle,
                        userNotesKeywords: newNotes
                    };

                    const treeRef = doc(db, "receptionTrees", tree.id);
                    batch.update(treeRef, { root: updatedRoot });
                    updatedCount++;
                }
            });

            if (updatedCount > 0) {
                await batch.commit();
                alert(`Successfully standardized ${updatedCount} page titles!`);
            } else {
                alert("All page titles are already standardized.");
            }

        } catch (error) {
            console.error("Error standardizing titles:", error);
            alert("Failed to standardize titles. Check console for details.");
        } finally {
            setIsLoading(false);
        }
    };

    // Diagnostic function to find and report problematic branches
    const handleDiagnoseOrphanBranches = () => {
        console.log('[Diagnose] Starting branch diagnosis...');

        const problems: { tree: string; branch: string; issues: string[] }[] = [];

        receptionForest.forEach(tree => {
            if (!tree.branches) return;

            tree.branches.forEach(branch => {
                const issues: string[] = [];

                if (branch.workTitle === 'Discovered Work' || !branch.workTitle) {
                    issues.push('Missing work title');
                }
                if (branch.author === 'Discovered Author' || branch.author === 'Unknown Author' || !branch.author) {
                    issues.push('Missing author');
                }

                if (issues.length > 0) {
                    problems.push({
                        tree: `${tree.root?.title || tree.id} (${tree.root?.sourceText})`,
                        branch: `"${branch.referenceText?.substring(0, 50)}..."`,
                        issues
                    });
                }
            });
        });

        if (problems.length === 0) {
            alert('✅ No orphaned branches found! All branches have proper metadata.');
            console.log('[Diagnose] No problems found');
        } else {
            console.log('[Diagnose] Found problems:', problems);

            // Format issues for display
            const summary = problems.slice(0, 10).map(p =>
                `• Under "${p.tree}":\n  ${p.issues.join(', ')}`
            ).join('\n\n');

            const moreText = problems.length > 10 ? `\n\n... and ${problems.length - 10} more. Check console for full list.` : '';

            alert(
                `⚠️ Found ${problems.length} branches with missing metadata:\n\n` +
                summary + moreText +
                '\n\nTo fix: Delete these branches and re-add them from the Analyzer.'
            );
        }
    };


    const handleDeleteTree = async (treeId: string) => {
        console.log('[Delete] Starting deletion for tree:', treeId);
        try {
            console.log('[Delete] Calling deleteDoc...');
            await deleteDoc(doc(db, "receptionTrees", treeId));
            console.log('[Delete] deleteDoc completed successfully');

            // Clear selection if the deleted tree was selected
            if (selectedGraphNode && receptionForest.find(t => t.id === treeId && (t.root?.id === selectedGraphNode.id || t.branches?.some(b => b.id === selectedGraphNode.id)))) {
                console.log('[Delete] Clearing selection');
                setSelectedGraphNodeId(null);
            }
            console.log('[Delete] Deletion completed');
        } catch (error) {
            console.error("[Delete] Error deleting tree:", error);
            alert("Failed to delete passage. Check console for details.");
        }
    };

    /**
     * Bulk cleanup: Reset branches with specified authors back to "Discovered Author"
     * Usage: Call from browser console: window.cleanupAuthors(['H. Seligsohn', 'Kanitz', 'Test Author Update 1'])
     */
    const handleCleanupBranchesByAuthors = async (authorsToReset: string[]) => {
        console.log('[Cleanup] Starting cleanup for authors:', authorsToReset);
        setIsLoading(true);

        try {
            const batch = writeBatch(db);
            let cleanedCount = 0;
            let treesToUpdate = 0;

            receptionForest.forEach(tree => {
                if (!tree.branches) return;
                let treeUpdated = false;

                const updatedBranches = tree.branches.map(branch => {
                    if (authorsToReset.some(a => branch.author === a)) {
                        console.log(`[Cleanup] Resetting branch "${branch.workTitle}" from "${branch.author}" to "Discovered Author"`);
                        treeUpdated = true;
                        cleanedCount++;
                        return { ...branch, author: 'Discovered Author' };
                    }
                    return branch;
                });

                if (treeUpdated) {
                    treesToUpdate++;
                    const treeRef = doc(db, 'receptionTrees', tree.id);
                    batch.update(treeRef, { branches: updatedBranches, updatedAt: new Date() });
                }
            });

            if (cleanedCount > 0) {
                await batch.commit();
                console.log(`[Cleanup] Reset ${cleanedCount} branches across ${treesToUpdate} trees.`);
                alert(`Cleaned up ${cleanedCount} branches. They now show "Discovered Author".`);
            } else {
                console.log('[Cleanup] No matching branches found');
                alert('No branches found with those author names.');
            }
        } catch (error) {
            console.error('[Cleanup] Error:', error);
            alert('Failed to cleanup branches. Check console for details.');
        } finally {
            setIsLoading(false);
        }
    };

    // Expose cleanup function to browser console for manual use
    (window as any).cleanupAuthors = handleCleanupBranchesByAuthors;

    // List all unique authors for debugging
    (window as any).listAllAuthors = () => {
        const authorCounts: Record<string, number> = {};
        receptionForest.forEach(tree => {
            tree.branches?.forEach(branch => {
                authorCounts[branch.author] = (authorCounts[branch.author] || 0) + 1;
            });
        });
        console.table(Object.entries(authorCounts).sort((a, b) => b[1] - a[1]).map(([author, count]) => ({ author, count })));
        return authorCounts;
    };

    // List all branches with a specific author
    (window as any).listBranchesByAuthor = (authorName: string) => {
        const branches: { tree: string, workTitle: string, author: string }[] = [];
        receptionForest.forEach(tree => {
            tree.branches?.forEach(branch => {
                if (branch.author === authorName) {
                    branches.push({ tree: tree.root?.title || tree.id, workTitle: branch.workTitle, author: branch.author });
                }
            });
        });
        console.table(branches);
        return branches;
    };

    // Set author for branches matching a work title pattern
    (window as any).setAuthorByWorkTitle = async (workTitlePattern: string, newAuthor: string) => {
        console.log(`[SetAuthor] Setting author "${newAuthor}" for branches matching "${workTitlePattern}"`);
        const batch = writeBatch(db);
        let updatedCount = 0;
        let treesToUpdate = 0;

        receptionForest.forEach(tree => {
            if (!tree.branches) return;
            let treeUpdated = false;

            const updatedBranches = tree.branches.map(branch => {
                if (branch.workTitle.toLowerCase().includes(workTitlePattern.toLowerCase())) {
                    console.log(`[SetAuthor] Updating "${branch.workTitle}" from "${branch.author}" to "${newAuthor}"`);
                    treeUpdated = true;
                    updatedCount++;
                    return { ...branch, author: newAuthor };
                }
                return branch;
            });

            if (treeUpdated) {
                treesToUpdate++;
                const treeRef = doc(db, 'receptionTrees', tree.id);
                batch.update(treeRef, { branches: updatedBranches, updatedAt: new Date() });
            }
        });

        if (updatedCount > 0) {
            await batch.commit();
            console.log(`[SetAuthor] Updated ${updatedCount} branches.`);
            alert(`Set author "${newAuthor}" for ${updatedCount} branches.`);
        } else {
            alert(`No branches found matching "${workTitlePattern}".`);
        }
    };

    // Delete branches matching a work title pattern
    (window as any).deleteBranchesByWorkTitle = async (workTitlePattern: string) => {
        console.log(`[DeleteBranches] Deleting branches matching "${workTitlePattern}"`);
        const batch = writeBatch(db);
        let deletedCount = 0;
        let treesToUpdate = 0;

        receptionForest.forEach(tree => {
            if (!tree.branches) return;
            const originalCount = tree.branches.length;

            const filteredBranches = tree.branches.filter(branch => {
                if (branch.workTitle.toLowerCase().includes(workTitlePattern.toLowerCase())) {
                    console.log(`[DeleteBranches] Removing branch "${branch.workTitle}"`);
                    deletedCount++;
                    return false; // Remove this branch
                }
                return true; // Keep this branch
            });

            if (filteredBranches.length < originalCount) {
                treesToUpdate++;
                const treeRef = doc(db, 'receptionTrees', tree.id);
                batch.update(treeRef, { branches: filteredBranches, updatedAt: new Date() });
            }
        });

        if (deletedCount > 0) {
            await batch.commit();
            console.log(`[DeleteBranches] Deleted ${deletedCount} branches from ${treesToUpdate} trees.`);
            alert(`Deleted ${deletedCount} branches matching "${workTitlePattern}".`);
        } else {
            alert(`No branches found matching "${workTitlePattern}".`);
        }
    };

    // Delete trees that have zero branches
    (window as any).deleteEmptyTrees = async () => {
        console.log('[DeleteEmptyTrees] Finding trees with 0 branches...');
        const batch = writeBatch(db);
        let deletedCount = 0;

        receptionForest.forEach(tree => {
            if (!tree.branches || tree.branches.length === 0) {
                console.log(`[DeleteEmptyTrees] Deleting tree "${tree.root?.title || tree.id}" with 0 branches`);
                const treeRef = doc(db, 'receptionTrees', tree.id);
                batch.delete(treeRef);
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            await batch.commit();
            console.log(`[DeleteEmptyTrees] Deleted ${deletedCount} empty trees.`);
            alert(`Deleted ${deletedCount} empty trees. Refresh to see changes.`);
        } else {
            alert('No empty trees found.');
        }
    };

    // Delete author profiles that no longer have branches
    (window as any).cleanupOrphanAuthorProfiles = async () => {
        console.log('[CleanupAuthors] Finding orphan author profiles...');

        // Get all current authors from branches (using normalized names)
        const currentAuthors = new Set<string>();
        receptionForest.forEach(tree => {
            tree.branches?.forEach(branch => {
                if (branch.author) {
                    // Use same normalization: lowercase + trim
                    currentAuthors.add(branch.author.toLowerCase().trim());
                }
            });
        });

        console.log(`[CleanupAuthors] Found ${currentAuthors.size} active authors in branches:`, Array.from(currentAuthors));

        // Fetch all profiles directly from Firestore to avoid stale state
        const snapshot = await getDocs(collection(db, 'authorProfiles'));
        const allProfiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`[CleanupAuthors] Found ${allProfiles.length} profiles in Firestore:`, allProfiles.map(p => p.id));

        // Find profiles to delete - compare by document ID (normalized name)
        const profilesToDelete: string[] = [];
        allProfiles.forEach(profile => {
            const profileNameNormalized = profile.id.toLowerCase().trim();
            if (!currentAuthors.has(profileNameNormalized)) {
                profilesToDelete.push(profile.id);
            }
        });

        if (profilesToDelete.length === 0) {
            alert('No orphan author profiles found. All profiles have matching branches.');
            return;
        }

        console.log(`[CleanupAuthors] Found ${profilesToDelete.length} orphan profiles:`, profilesToDelete);

        // Delete from Firestore
        const batch = writeBatch(db);
        profilesToDelete.forEach(name => {
            console.log(`[CleanupAuthors] Deleting profile: ${name}`);
            const profileRef = doc(db, 'authorProfiles', name);
            batch.delete(profileRef);
        });

        await batch.commit();

        // Update local state
        setAuthorProfiles(prev => {
            const updated = { ...prev };
            profilesToDelete.forEach(name => delete updated[name]);
            return updated;
        });

        console.log(`[CleanupAuthors] Deleted ${profilesToDelete.length} orphan profiles`);
        alert(`Deleted ${profilesToDelete.length} orphan author profiles. Refresh to see changes.`);
    };

    const handleLibraryTextUpdate = async (originalText: UserText, updatedFields: Partial<UserText>) => {
        console.log('[Library Sync] Starting sync for text:', originalText.title);
        console.log('[Library Sync] Updated fields:', updatedFields);
        setIsLoading(true);
        try {
            const batch = writeBatch(db);
            let updatedCount = 0;
            let treesToUpdate = 0;
            let checkedBranches = 0;

            // Normalize for matching
            const normalizeTitle = (t: string) => t?.toLowerCase().trim().replace(/[^\w\s]/g, '') || '';
            const originalTitleNorm = normalizeTitle(originalText.title);

            receptionForest.forEach(tree => {
                if (!tree.branches) return;
                let treeUpdated = false;

                const updatedBranches = tree.branches.map(branch => {
                    checkedBranches++;

                    // PRIORITY 1: Direct link via sourceDocumentId (most reliable)
                    const isDirectLink = branch.sourceDocumentId === originalText.id;

                    // PRIORITY 2: Title-based matching (STRICT - exact or normalized only)
                    const branchTitleNorm = normalizeTitle(branch.workTitle);
                    const isExactMatch = branch.workTitle === originalText.title;
                    const isNormalizedMatch = branchTitleNorm === originalTitleNorm && originalTitleNorm.length > 5;
                    // Note: Removed partial matching as it was too aggressive and caused incorrect syncs
                    const isTitleMatch = isExactMatch || isNormalizedMatch;

                    // Strict author check (for title-based matching)
                    const isAuthorMatch = !originalText.author ||
                        branch.author === originalText.author ||
                        branch.author === 'Discovered Author' ||
                        branch.author === 'Unknown' ||
                        normalizeTitle(branch.author) === normalizeTitle(originalText.author || '');

                    // Match if direct link OR (EXACT title matches AND author matches)
                    const shouldUpdate = isDirectLink || (isTitleMatch && isAuthorMatch);

                    if (shouldUpdate) {
                        const matchReason = isDirectLink ? 'sourceDocumentId' : 'title+author';
                        console.log(`[Library Sync] Found matching branch (${matchReason}): "${branch.workTitle}" by ${branch.author}`);
                        const newBranch = { ...branch };
                        let changed = false;

                        if (updatedFields.title && newBranch.workTitle !== updatedFields.title) {
                            console.log(`[Library Sync] Updating workTitle: "${newBranch.workTitle}" -> "${updatedFields.title}"`);
                            newBranch.workTitle = updatedFields.title;
                            changed = true;
                        }
                        if (updatedFields.author && newBranch.author !== updatedFields.author) {
                            console.log(`[Library Sync] Updating author: "${newBranch.author}" -> "${updatedFields.author}"`);
                            newBranch.author = updatedFields.author;
                            changed = true;
                        }
                        if (updatedFields.publicationDate && newBranch.year !== updatedFields.publicationDate) {
                            newBranch.year = updatedFields.publicationDate;
                            changed = true;
                        }

                        if (changed) {
                            treeUpdated = true;
                            updatedCount++;
                            return newBranch;
                        }
                    }
                    return branch;
                });

                if (treeUpdated) {
                    treesToUpdate++;
                    const treeRef = doc(db, 'receptionTrees', tree.id);
                    batch.update(treeRef, { branches: updatedBranches, updatedAt: new Date() });
                }
            });

            console.log(`[Library Sync] Checked ${checkedBranches} branches, found ${updatedCount} matches`);

            if (updatedCount > 0) {
                await batch.commit();
                console.log(`[Library Sync] Updated ${updatedCount} branches across ${treesToUpdate} trees.`);
                alert(`Synced changes to ${updatedCount} related branches in your graph.`);
            } else {
                console.log('[Library Sync] No matching branches found. Branches may have different titles.');
                // Don't show alert for no matches - this is expected if text isn't linked to branches
            }
        } catch (error) {
            console.error("Failed to sync library changes to graph:", error);
            alert("Updated library, but failed to sync changes to the graph branches.");
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Cascade delete: Remove branches from the graph when a Library text is deleted.
     * Uses same matching logic as handleLibraryTextUpdate for consistency.
     */
    const handleLibraryTextDelete = async (textToDelete: UserText): Promise<{ deleted: number; trees: number }> => {
        console.log('[Library Delete] Starting cascade delete for text:', textToDelete.title);

        const batch = writeBatch(db);
        let deletedCount = 0;
        let treesToUpdate = 0;
        let checkedBranches = 0;

        // Normalize for matching (same logic as update)
        const normalizeTitle = (t: string) => t?.toLowerCase().trim().replace(/[^\w\s]/g, '') || '';
        const originalTitleNorm = normalizeTitle(textToDelete.title);

        receptionForest.forEach(tree => {
            if (!tree.branches) return;
            const originalCount = tree.branches.length;

            const remainingBranches = tree.branches.filter(branch => {
                checkedBranches++;

                // PRIORITY 1: Direct link via sourceDocumentId (most reliable)
                const isDirectLink = branch.sourceDocumentId === textToDelete.id;

                // PRIORITY 2: Title-based matching (STRICT - exact or normalized only)
                const branchTitleNorm = normalizeTitle(branch.workTitle);
                const isExactMatch = branch.workTitle === textToDelete.title;
                const isNormalizedMatch = branchTitleNorm === originalTitleNorm && originalTitleNorm.length > 5;
                const isTitleMatch = isExactMatch || isNormalizedMatch;

                // Strict author check (for title-based matching)
                const isAuthorMatch = !textToDelete.author ||
                    branch.author === textToDelete.author ||
                    branch.author === 'Discovered Author' ||
                    branch.author === 'Unknown' ||
                    normalizeTitle(branch.author) === normalizeTitle(textToDelete.author || '');

                // Match if direct link OR (EXACT title matches AND author matches)
                const shouldDelete = isDirectLink || (isTitleMatch && isAuthorMatch);

                if (shouldDelete) {
                    const matchReason = isDirectLink ? 'sourceDocumentId' : 'title+author';
                    console.log(`[Library Delete] Removing branch (${matchReason}): "${branch.workTitle}" by ${branch.author}`);
                    deletedCount++;
                    return false; // Remove this branch
                }
                return true; // Keep this branch
            });

            if (remainingBranches.length < originalCount) {
                treesToUpdate++;
                const treeRef = doc(db, 'receptionTrees', tree.id);
                batch.update(treeRef, { branches: remainingBranches, updatedAt: new Date() });
            }
        });

        console.log(`[Library Delete] Checked ${checkedBranches} branches, found ${deletedCount} to delete`);

        if (deletedCount > 0) {
            await batch.commit();
            console.log(`[Library Delete] Deleted ${deletedCount} branches from ${treesToUpdate} trees.`);
        }

        return { deleted: deletedCount, trees: treesToUpdate };
    };

    const handleAskAI = (node: GraphNode) => {
        handleViewChange('assistant');

        let contextMessage = "";
        if (node.type === 'root') {
            const root = node as RootNode;
            contextMessage = `I'd like to discuss the Talmudic page "${root.title}" (${root.sourceText}).\n\nHere is the content for context:\nHebrew: ${root.hebrewText}\nTranslation: ${root.translation}`;
        } else {
            const branch = node as BranchNode;
            contextMessage = `I'd like to discuss the interpretation by ${branch.author} in "${branch.workTitle}".\n\nReference Text: ${branch.referenceText}\nUser Notes: ${branch.userNotes}`;
        }

        // Send the context message to the AI
        handleSendMessage(contextMessage);
    };

    const renderView = () => {
        if (isDbLoading) {
            return (
                <div className="flex-1 flex items-center justify-center h-full">
                    <div className="flex items-center gap-2 text-text-muted">
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Loading Talmudic Ilanot...</span>
                    </div>
                </div>
            )
        }
        switch (currentView) {
            case 'library':
                return <LibraryView onViewChange={(view) => {
                    if (view === 'analyzer') {
                        setPendingAnalysis(null);
                    }
                    handleViewChange(view);
                }} onAnalyze={handleAnalyzeFromLibrary} onOpenBatchImport={handleOpenBatchImport} onTextMetadataUpdate={handleLibraryTextUpdate} onTextDelete={handleLibraryTextDelete} />;

            case 'split-pane':
                return (
                    <SplitPaneView
                        forest={receptionForest}
                        selectedNode={selectedGraphNode}
                        onSelectNode={handleSelectNode}
                        onSaveNode={handleSaveNodeChanges}
                        onDeleteNode={handleDeleteNode}
                        onAddBranch={(parentNode) => {
                            setAddBranchParent(parentNode);
                            setIsAddPassageModalOpen(true);
                        }}
                        onRegenerateRoot={handleRegenerateRootData}
                        onMoveBranch={handleMoveBranch}
                        allNodes={allNodes}
                        onAskAI={handleAskAI}
                        chatHistory={chatHistory}
                        onSendMessage={handleSendMessage}
                        isAiLoading={isAiLoading}
                    />
                );

            case 'analyzer':
                return (
                    <TextAnalyzerView
                        onApproveFinding={handleApproveAIFinding}
                        existingRoots={allNodes.filter(n => n.type === 'root').map(n => (n as RootNode).sourceText)}
                        onAnalysisComplete={handleSaveAnalysisToLibrary}
                        initialText={pendingAnalysis?.text}
                        initialAuthor={pendingAnalysis?.author}
                        initialTitle={pendingAnalysis?.title}
                        initialFindings={pendingAnalysis?.findings}
                        textId={pendingAnalysis?.id}
                        onResetAnalysis={() => setPendingAnalysis(null)}
                        initialPdfUrl={pendingAnalysis?.pdfUrl}
                        initialFullText={pendingAnalysis?.fullTranscribedText}
                        existingAuthors={Object.keys(authorProfiles)}
                    />
                );
            case 'assistant':
                return (
                    <AIAssistantView
                        history={chatHistory}
                        onSendMessage={handleSendMessage}
                        isLoading={isAiLoading}
                        onSyncLibrary={handleSyncLibrary}
                        activeNode={selectedGraphNode || undefined}
                    />
                );
            case 'connections':
                return (
                    <SimilarInterpretationsView
                        onNavigateToTree={(treeId) => {
                            const tree = receptionForest.find(t => t.id === treeId);
                            if (tree) {
                                handleSelectNode(tree.root);
                            }
                            setCurrentView('split-pane');
                        }}
                    />
                );
            case 'dashboard':
            default:
                return (
                    <>
                        {selectedTractate ? (
                            <TractateDetailPage
                                tractate={selectedTractate}
                                trees={receptionForest.filter(tree => {
                                    const sourceText = tree.root?.sourceText?.toLowerCase() || '';
                                    const tractateNormalized = selectedTractate.toLowerCase();
                                    return sourceText.includes(tractateNormalized) ||
                                        sourceText.startsWith(tractateNormalized.split(' ')[0]);
                                })}
                                profile={tractateProfiles[selectedTractate.toLowerCase().replace(/\s+/g, '_')]}
                                onBack={() => setSelectedTractate(null)}
                                onNavigate={(treeId) => {
                                    const tree = receptionForest.find(t => t.id === treeId);
                                    if (tree) {
                                        handleSelectNode(tree.root);
                                    }
                                    setSelectedTractate(null);
                                    setCurrentView('split-pane');
                                }}
                                onSaveProfile={async (profile) => {
                                    setTractateProfiles(prev => ({
                                        ...prev,
                                        [profile.normalizedName]: profile
                                    }));
                                    // Persist to Firestore
                                    try {
                                        await setDoc(
                                            doc(db, 'tractateProfiles', profile.normalizedName),
                                            profile
                                        );
                                        console.log('[Tractate Profiles] Saved profile for:', profile.normalizedName);
                                    } catch (error) {
                                        console.error('[Tractate Profiles] Failed to save:', error);
                                        alert('Failed to save tractate profile. Please try again.');
                                    }
                                }}
                            />
                        ) : selectedAuthor ? (
                            <AuthorDetailPage
                                author={selectedAuthor}
                                profile={authorProfiles[selectedAuthor.name]}
                                onBack={() => setSelectedAuthor(null)}
                                onNavigate={(treeId, nodeId) => {
                                    const tree = receptionForest.find(t => t.id === treeId);
                                    if (tree) {
                                        if (nodeId) {
                                            handleSelectNode(allNodes.find(n => n.id === nodeId) || tree.root);
                                        } else {
                                            handleSelectNode(tree.root);
                                        }
                                    }
                                    setSelectedAuthor(null);
                                    setCurrentView('split-pane');
                                }}
                                onSaveProfile={async (profile) => {
                                    setAuthorProfiles(prev => ({
                                        ...prev,
                                        [profile.normalizedName]: profile
                                    }));
                                    // Persist to Firestore
                                    try {
                                        await setDoc(
                                            doc(db, 'authorProfiles', profile.normalizedName),
                                            profile
                                        );
                                        console.log('[Author Profiles] Saved profile for:', profile.normalizedName);
                                    } catch (error) {
                                        console.error('[Author Profiles] Failed to save:', error);
                                        alert('Failed to save author profile. Please try again.');
                                    }
                                }}
                            />
                        ) : (
                            <Dashboard
                                receptionForest={receptionForest}
                                onNavigate={(treeId, nodeId) => {
                                    const tree = receptionForest.find(t => t.id === treeId);
                                    if (tree) {
                                        if (nodeId) {
                                            handleSelectNode(allNodes.find(n => n.id === nodeId) || tree.root);
                                        } else {
                                            handleSelectNode(tree.root);
                                        }
                                    }
                                    setCurrentView('split-pane');
                                }}
                                onAddPassage={() => setIsAddPassageModalOpen(true)}
                                onOpenMergeModal={() => setIsMergeModalOpen(true)}
                                onStandardizeTitles={handleStandardizeTitles}
                                onDiagnoseOrphans={handleDiagnoseOrphanBranches}
                                onDeleteTree={handleDeleteTree}
                                onImportFromBenYehuda={() => setIsBenYehudaModalOpen(true)}
                                onScanPdf={() => setIsPdfAnalysisModalOpen(true)}
                                onAuthorClick={(author) => setSelectedAuthor(author)}
                                onTractateClick={(tractate) => setSelectedTractate(tractate)}
                                tractateProfiles={tractateProfiles}
                            />
                        )}
                    </>
                );
        }
    };

    return (
        <Layout
            sidebar={
                <Sidebar
                    currentView={currentView}
                    onViewChange={handleViewChange}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    onOpenHelp={() => setIsHelpOpen(true)}
                />
            }
            showRightPanel={false}
            aiFindings={aiFindings}
            onApproveFinding={handleApproveAIFinding}
            onDismissFinding={(id) => handleUpdateFinding(id, AIFindingStatus.Rejected)}
            // Use horizontal layout (top navbar) for analyzer view to maximize space
            orientation={currentView === 'analyzer' ? 'horizontal' : 'vertical'}
        >
            {isAiLoading && currentView !== 'assistant' && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-ai-primary/90 text-white px-4 py-2 rounded-full flex items-center gap-2 backdrop-blur-sm shadow-lg shadow-ai-primary/20">
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm font-medium">AI is thinking...</span>
                </div>
            )}

            {renderView()}

            {isAddPassageModalOpen && (
                <AddPassageModal
                    receptionForest={receptionForest}
                    onClose={() => {
                        setIsAddPassageModalOpen(false);
                        setAddBranchParent(null);
                    }}
                    onCreateRoot={handleCreateRootNode}
                    onCreateBranch={handleCreateBranchNode}
                    parentNodeForBranch={addBranchParent}
                />
            )}

            {isMergeModalOpen && (
                <MergeDuplicatesModal
                    receptionForest={receptionForest}
                    onClose={() => setIsMergeModalOpen(false)}
                    onMerge={handleMergeTrees}
                />
            )}

            {isAnalysisModalOpen && (
                <FullTextAnalysisModal
                    onClose={() => setIsAnalysisModalOpen(false)}
                    onAnalyze={handleRunFullAnalysis}
                    isLoading={isAiLoading}
                />
            )}

            {isBenYehudaModalOpen && (
                <BenYehudaSearchModal
                    isOpen={isBenYehudaModalOpen}
                    onClose={() => setIsBenYehudaModalOpen(false)}
                    onImport={handleBenYehudaImport}
                />
            )}

            {isBatchImportModalOpen && (
                <BatchImportModal
                    isOpen={isBatchImportModalOpen}
                    onClose={() => setIsBatchImportModalOpen(false)}
                    onImportComplete={() => {
                        // Refresh logic handled by Firestore subscriptions
                    }}
                />
            )}

            {isPdfAnalysisModalOpen && (
                <PdfAnalysisModal
                    isOpen={isPdfAnalysisModalOpen}
                    onClose={() => setIsPdfAnalysisModalOpen(false)}
                    onAnalysisComplete={async (findings, transcribedText) => {
                        console.log('[PDF Analysis] Received findings:', findings.length, 'text chars:', transcribedText?.length);

                        // Helper to remove undefined values (Firebase doesn't accept them)
                        const removeUndefined = (obj: any): any => {
                            if (Array.isArray(obj)) {
                                return obj.map(item => removeUndefined(item));
                            } else if (obj !== null && typeof obj === 'object' && !(obj instanceof Timestamp)) {
                                return Object.fromEntries(
                                    Object.entries(obj)
                                        .filter(([_, v]) => v !== undefined)
                                        .map(([k, v]) => [k, removeUndefined(v)])
                                );
                            }
                            return obj;
                        };

                        try {
                            // Save to user_texts collection for Library review (same pattern as BatchImportModal)
                            const workTitle = findings[0]?.workTitle || 'PDF Import';
                            const author = findings[0]?.author || 'Unknown Author';

                            const newText = removeUndefined({
                                title: workTitle,
                                author: author,
                                text: transcribedText || `[PDF Vision Import - ${findings.length} citations extracted]`,
                                dateAdded: Date.now(),
                                createdAt: Timestamp.now(),
                                status: 'pending',
                                findings: removeUndefined(findings),
                                keywords: ['PDF Import', 'Vision Analysis']
                            });

                            await addDoc(collection(db, 'user_texts'), newText);

                            const textPreview = transcribedText ? `Transcribed ${transcribedText.length} characters.` : '';
                            alert(`Successfully extracted ${findings.length} citations from PDF!\n\n${textPreview}\n\nThe text "${workTitle}" has been added to your Library.\n\nGo to Library → click on the text → review and approve findings.`);
                        } catch (error) {
                            console.error('[PDF Analysis] Error saving to library:', error);
                            alert('Error saving to library. Check console for details.');
                        }
                    }}
                />
            )}

            {/* Settings & Help Modals */}
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                isDarkMode={darkMode}
                toggleTheme={() => setDarkMode(!darkMode)}
                currentFont={currentFont}
                onChangeFont={setCurrentFont}
                onOpenSyncDebug={() => setIsSyncDebugOpen(true)}
            />
            <HelpModal
                isOpen={isHelpOpen}
                onClose={() => setIsHelpOpen(false)}
            />

            {isSyncDebugOpen && (
                <SyncDebugView
                    onApproveFinding={handleApproveAIFinding}
                    onClose={() => setIsSyncDebugOpen(false)}
                />
            )}
        </Layout>
    );
};

export default App;
