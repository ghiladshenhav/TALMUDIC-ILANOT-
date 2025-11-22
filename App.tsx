import React, { useState, useEffect, useMemo } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDoc, arrayUnion, arrayRemove, writeBatch } from "firebase/firestore";
import { ReceptionTree, GraphNode, AIFinding, AIFindingStatus, GraphEdge, RootNode, BranchNode, AIFindingType, LinkCategory, IDHelpers } from './types';
import { generateContentWithRetry } from './utils/ai-helpers';
import { generateUUID } from './utils/id-helpers';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import TextAnalyzerView from './views/TextAnalyzerView';
import AIAssistantView from './views/AIAssistantView';
import AddPassageModal from './components/AddPassageModal';
import MergeDuplicatesModal from './components/MergeDuplicatesModal';
import FullTextAnalysisModal from './components/ai/FullTextAnalysisModal';
import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { app } from './firebase'; // Assuming firebase is initialized in firebase.ts and exported as app
import { Chat, GoogleGenAI } from "@google/genai";
import Layout from './components/Layout';



import LibraryView from './views/LibraryView';

import SplitPaneView from './views/SplitPaneView';



type View = 'dashboard' | 'split-pane' | 'analyzer' | 'assistant' | 'library';

// ... (rest of imports and code)

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

const App: React.FC = () => {
    const [darkMode, setDarkMode] = useState(true);
    const [currentView, setCurrentView] = useState<View>('split-pane');
    const [receptionForest, setReceptionForest] = useState<ReceptionTree[]>([]);
    const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
    const [aiFindings, setAIFindings] = useState<AIFinding[]>([]);
    const [isAddPassageModalOpen, setIsAddPassageModalOpen] = useState(false);
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
    const [addBranchParent, setAddBranchParent] = useState<GraphNode | null>(null);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [isAiLoading, setIsLoading] = useState(false);
    const [isDbLoading, setIsDbLoading] = useState(true);


    // AI Assistant State
    const [chat, setChat] = useState<Chat | null>(null);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

    const [selectedTractate, setSelectedTractate] = useState<string | null>(null);

    // Combine all nodes from the forest (roots + branches)
    const allNodes = useMemo(() => {
        const nodes: GraphNode[] = [];
        receptionForest.forEach(tree => {
            nodes.push(tree.root);
            nodes.push(...tree.branches);
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

    // Initialize Chat session when forest data is loaded
    useEffect(() => {
        if (receptionForest.length > 0 && !chat) {
            console.log("Initializing AI Chat...");
            const graphSummary = receptionForest.map(tree => {
                const root = tree.root;
                return {
                    sourceText: root.sourceText,
                    title: root.title,
                    keywords: root.userNotesKeywords.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).join(', '),
                    branchCount: tree.branches.length,
                };
            });

            const ai = getAI(app, { backend: new GoogleAIBackend() });
            const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
            const initialHistory = [
                { role: 'user', parts: [{ text: `Here is a summary of my current research graph. Use this as context for my questions:\n\n${JSON.stringify(graphSummary, null, 2)}` }] },
                { role: 'model', parts: [{ text: "Understood. I have reviewed your research graph and am ready to assist. How can I help you explore the connections in your research today?" }] }
            ];

            const newChat = model.startChat({
                history: initialHistory as any, // Cast to any to bypass strict type check if SDK types are slightly off
                systemInstruction: "You are a helpful and insightful digital humanities research assistant specializing in Talmudic reception history. Your goal is to help the user uncover and understand connections within their research graph. Be concise and clear in your responses."
            });
            setChat(newChat);
            setChatHistory([
                { role: 'model', text: "Understood. I have reviewed your research graph and am ready to assist. How can I help you explore the connections in your research today?" }
            ]);
            console.log("AI Chat initialized successfully.");
        }
    }, [receptionForest, chat]);

    // Fetch data from Firestore on mount
    useEffect(() => {
        setIsDbLoading(true);
        const unsubscribe = onSnapshot(collection(db, "receptionTrees"), (snapshot) => {
            console.log("Firestore snapshot update received. Docs:", snapshot.docs.length);
            const forestData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReceptionTree));

            // Validation: Check for legacy data structure
            forestData.forEach(tree => {
                if (!tree.root || !tree.branches) {
                    console.error(`[Data Validation] Tree "${tree.id}" uses LEGACY structure (nodes/edges). Migration needed!`);
                    console.error('  Run migration script or delete this tree and recreate it.');
                } else {
                    // Validate root ID
                    IDHelpers.validateAndWarn(tree.root.id, `Tree ${tree.id} root`);

                    // Validate branch IDs
                    tree.branches.forEach(branch => {
                        IDHelpers.validateAndWarn(branch.id, `Tree ${tree.id} branch`);
                    });

                    // Success message for properly formatted trees
                    const hasValidIds = IDHelpers.isValidCompositeId(tree.root.id) &&
                        tree.branches.every(b => IDHelpers.isValidCompositeId(b.id));
                    if (hasValidIds) {
                        console.log(`[Data Validation] ✅ Tree "${tree.id}" uses new composite ID format`);
                    }
                }
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


    // Keyboard shortcut for adding a new passage
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
            if (currentView === 'dashboard' && event.key.toLowerCase() === 'n') {
                event.preventDefault();
                setIsAddPassageModalOpen(true);
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
        // Always clear selection when leaving split-pane
        if (view !== 'split-pane') {
            setSelectedGraphNodeId(null);
        }
    };

    const handleSelectNode = (node: GraphNode | null) => {
        setSelectedGraphNodeId(node?.id || null);
    };

    const addAIFoundRootNode = async (finding: AIFinding, markAsLoading: boolean = true) => {
        if (markAsLoading) setIsLoading(true);
        try {
            const ai = getAI(app, { backend: new GoogleAIBackend() });
            const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: `Extract information for the Talmudic passage: ${finding.title} (${finding.source})` }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                },
                systemInstruction: `You are a helpful assistant specialized in rabbinic literature. For a given Talmudic source, you must provide:
            1. The original Hebrew/Aramaic text ("hebrewText").
            2. The Steinsaltz Hebrew translation/explanation ("hebrewTranslation").
            3. A standard English translation ("translation").
            4. A list of 3-5 keywords ("keywords").
            
            Return the data in a JSON object.`,
            });

            const response = result.response;
            const aiData = JSON.parse(response.text());
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
            await handleCreateRootNode(newNodeData);
            setCurrentView('split-pane');

        } catch (error) {
            console.error("Failed to create AI-found root node:", error);
            alert("Failed to process the AI suggestion. Please try creating the node manually.");
            throw error; // re-throw to be caught by caller
        } finally {
            if (markAsLoading) setIsLoading(false);
        }
    }

    const handleApproveAIFinding = async (finding: AIFinding) => {
        console.log("handleApproveAIFinding called with:", finding);
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
                await handleAddEdge(newEdge);
                setCurrentView('split-pane');
                return;
            }

            // Helper to normalize source text for comparison
            const normalizeSourceText = (text: string) => {
                return text.toLowerCase()
                    .replace(/^(bavli|yerushalmi|masechet|tractate|b\.|y\.)\s*/g, '')
                    .replace(/[.,\-:;]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            };

            if (finding.type === AIFindingType.Reference) {
                const normalizedFindingSource = normalizeSourceText(finding.source);

                const existingRoot = allNodes.find(n => {
                    if (n.type !== 'root') return false;
                    const root = n as RootNode;
                    return normalizeSourceText(root.sourceText) === normalizedFindingSource;
                });

                // Determine action based on status or auto-detect
                let shouldAddToExisting = false;
                let shouldCreateNew = false;

                if (finding.status === AIFindingStatus.AddedToExistingRoot) {
                    shouldAddToExisting = true;
                } else if (finding.status === AIFindingStatus.AddedAsNewRoot) {
                    shouldCreateNew = true;
                } else {
                    // Default/Auto behavior (legacy or simple 'Added' status)
                    if (existingRoot) {
                        shouldAddToExisting = true;
                    } else {
                        shouldCreateNew = true;
                    }
                }

                if (shouldAddToExisting) {
                    if (existingRoot) {
                        // Case 1: Root already exists. Add a new branch to its tree.
                        const parentNode = existingRoot as RootNode;
                        const parentTree = receptionForest.find(t => t.nodes.some(n => n.id === parentNode.id));

                        if (!parentTree) {
                            console.error("Could not find a tree for the existing root node.");
                            throw new Error("Parent tree not found for existing root.");
                        }

                        // Check for duplicates
                        const duplicateBranch = parentTree.nodes.find(n =>
                            n.type === 'branch' &&
                            (n as BranchNode).referenceText.trim() === finding.snippet.trim()
                        );

                        if (duplicateBranch) {
                            alert("This reference already exists in the graph.");
                            return;
                        }

                        const newBranchNode: Omit<BranchNode, 'id' | 'position' | 'type'> = {
                            author: finding.author || 'Discovered Author',
                            workTitle: finding.workTitle || 'Discovered Work',
                            publicationDetails: 'From analyzed text',
                            referenceText: finding.snippet,
                            userNotes: `Added from Reference Detector.\n\nJustification: ${finding.justification || 'N/A'}`,
                            style: { borderColor: '#2B3A67', borderWidth: 2 }
                        };
                        await handleCreateBranchNode(newBranchNode, parentTree.id, parentNode.id, true);
                        alert(`Successfully added reference to "${finding.source}"!`);
                    } else {
                        // User wanted to add to existing, but it wasn't found.
                        // Fallback to creating new, or alert?
                        // The user explicitly asked for "Add to Existing".
                        // If we can't find it, we should probably ask them or fail.
                        // For now, let's alert and offer to create new? 
                        // Or just alert and fail, letting them choose "Add as New Page" instead.
                        alert(`Could not find an existing page for "${finding.source}". Please use "Add as New Page" instead.`);
                        return;
                    }
                } else if (shouldCreateNew) {
                    // Case 2: Create a new tree with the root and the branch together.
                    if (!finding.hebrewText || !finding.translation) {
                        console.error("Cannot create new root: Hebrew text or translation is missing from the AI finding.", finding);
                        alert("Could not create the new passage, as essential text is missing from the AI's analysis.");
                        throw new Error("Missing required text for new root node.");
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
                        hebrewText: finding.hebrewText || '',
                        hebrewTranslation: finding.hebrewTranslation || '',
                        translation: finding.translation || '',
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
                        referenceText: finding.snippet,
                        userNotes: `Added from Reference Detector.\n\nJustification: ${finding.justification || 'N/A'}`,
                        style: { borderColor: '#2B3A67', borderWidth: 2 }
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
                referenceText: finding.snippet,
                userNotes: `Added from AI Discovery.\n\nJustification: ${finding.justification || 'N/A'}`,
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

        // Find existing root with matching normalized source
        const existingRoot = allNodes.find(n =>
            n.type === 'root' &&
            normalizeSourceText((n as RootNode).sourceText) === normalizedNewSource
        );

        if (existingRoot) {
            // Found a match!
            if (initialBranch) {
                // If we have an initial branch, just add it to the existing root
                const parentTree = receptionForest.find(t => t.nodes.some(n => n.id === existingRoot.id));
                if (parentTree) {
                    await handleCreateBranchNode(initialBranch, parentTree.id, existingRoot.id);
                    setIsAddPassageModalOpen(false);
                    return;
                }
            }

            const shouldLink = window.confirm(
                `A page for "${existingRoot.sourceText}" already exists in the library.\n\n` +
                `To keep all references gathered in one place, we recommend viewing the existing page.\n` +
                `You can then add your new content as a commentary/branch to it.\n\n` +
                `Click OK to view the existing page.\n` +
                `Click Cancel to force create a duplicate (Not Recommended).`
            );

            if (shouldLink) {
                setSelectedGraphNodeId(existingRoot.id);
                setCurrentView('split-pane');
                setIsAddPassageModalOpen(false);
                return;
            }
            // If they say no, we proceed to create a duplicate
        }

        const newTreeId = node.sourceText.toLowerCase().replace(/\s/g, '_').replace(/\./g, '');
        const newNodeId = `node-root-${Date.now()}`;

        let maxX = 50;
        let maxY = 50;
        let count = 0;
        allNodes.forEach(n => {
            if (n.position.x > maxX) maxX = n.position.x;
            if (n.position.y > maxY) maxY = n.position.y;
            count++;
        });
        const newX = (count % 5) * 250 + 100;
        const newY = Math.floor(count / 5) * 200 + 100;

        const newRootNode: RootNode = {
            ...node,
            id: newNodeId,
            position: { x: newX, y: newY }
        };

        const newNodes: GraphNode[] = [newRootNode];
        const newEdges: GraphEdge[] = [];

        if (initialBranch) {
            const newBranchId = `branch-${crypto.randomUUID()}`;
            const newBranchNode: BranchNode = {
                ...initialBranch,
                id: newBranchId,
                type: 'branch',
                position: { x: newX + 50, y: newY + 150 } // Offset from root
            };
            const newEdge: GraphEdge = {
                id: `edge-${crypto.randomUUID()}`,
                source: newNodeId,
                target: newBranchId,
                category: LinkCategory.ThematicParallel,
                label: 'Initial Topic'
            };
            newNodes.push(newBranchNode);
            newEdges.push(newEdge);
        }

        const newTree: ReceptionTree = { id: newTreeId, nodes: newNodes, edges: newEdges };

        await setDoc(doc(db, "receptionTrees", newTreeId), newTree);

        setIsAddPassageModalOpen(false);
        setCurrentView('split-pane');
        setSelectedGraphNodeId(initialBranch ? newNodes[1].id : newRootNode.id);
    };





    const handleCreateBranchNode = async (branchData: Omit<BranchNode, 'id' | 'position' | 'type'>, parentTreeId: string, parentNodeId?: string, isFromAI: boolean = false) => {
        const treeToUpdate = receptionForest.find(tree => tree.id === parentTreeId);
        if (!treeToUpdate) {
            console.error(`Could not find parent tree with id "${parentTreeId}" to add branch to.`);
            ```
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
        console.log(`[Branch Creation] ✅ Generated composite ID: ${ newNodeId } `);

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
            branches: arrayUnion(newBranchNode)
        });

        if (!isFromAI) {
            setIsAddPassageModalOpen(false);
            setAddBranchParent(null);
            setCurrentView('split-pane');
        }
        setSelectedGraphNodeId(newBranchNode.id);
    };


    // ...

    const handleSaveAnalysisToLibrary = async (text: string, title: string, findings: AIFinding[]) => {
        try {
            await setDoc(doc(collection(db, 'user_texts')), {
                title,
                text,
                createdAt: new Date(),
                findings: findings
            });
        } catch (error: any) {
            console.error("Failed to save analysis to library:", error);
            alert(`Failed to save text to library history: ${ error.message || "Unknown error" } `);
        }
    };

    const handleRunFullAnalysis = async (fullText: string) => {
        setIsAnalysisModalOpen(false);
        setIsLoading(true);

        const graphSummary = receptionForest.map(tree => {
            const root = tree.root;
            return {
                sourceText: root.sourceText,
                title: root.title,
                keywords: root.userNotesKeywords.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).join(', ')
            };
        });

        try {
            const ai = getAI(app, { backend: new GoogleAIBackend() });
            const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
            const prompt = `You are a Talmudic research assistant.Analyze the following user - provided text based on their current research graph.
--- USER TEXT-- -
                ${ fullText }
            --- END USER TEXT-- -

                --- USER'S GRAPH SUMMARY ---
${ JSON.stringify(graphSummary, null, 2) }
            --- END GRAPH SUMMARY-- -

                Scan the user's text and identify three types of connections. Return a single JSON object with three arrays: "rootMatches", "thematicFits", and "newRoots".
For "rootMatches" and "thematicFits", each item must have:
            - "snippet"(a relevant quote from the user text)
                - "contextBefore"(the two sentences immediately preceding the snippet)
                - "contextAfter"(the two sentences immediately following the snippet)
                - "confidence"(a number 0 - 100)
                - "source"(the Talmudic passage it matches, e.g., "Bavli Kiddushin 40b")
                - "originalText"(the full quote in the original Hebrew / Aramaic)
                - "author"
                - "workTitle"
                - "justification"

For "newRoots", each item must have: "snippet", "contextBefore", "contextAfter", "confidence", "source", "originalText", "title", and "justification".`;

            const result = await generateContentWithRetry(model, {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                },
            });

            const response = result.response;
            const results = JSON.parse(response.text());
            const findings: AIFinding[] = [];

            results.rootMatches?.forEach((item: any, i: number) => findings.push({
                id: `finding - rm - ${ crypto.randomUUID() } -${ i } `,
                type: AIFindingType.RootMatch,
                status: AIFindingStatus.Pending,
                ...item
            }));
            results.thematicFits?.forEach((item: any, i: number) => findings.push({
                id: `finding - tf - ${ crypto.randomUUID() } -${ i } `,
                type: AIFindingType.ThematicFit,
                status: AIFindingStatus.Pending,
                ...item
            }));
            results.newRoots?.forEach((item: any, i: number) => findings.push({
                id: `finding - nr - ${ crypto.randomUUID() } -${ i } `,
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
                createdAt: new Date(), // Firestore will convert this
                findings: findings
            });

        } catch (error: any) {
            console.error("Full text analysis failed:", error);
            alert(`The AI analysis failed: ${ error.message || "Unknown error" }. Please check the console for details.`);
        } finally {
            setIsLoading(false);
        }
    };



    const handleRegenerateRootData = async (rootNode: RootNode) => {
        setIsLoading(true);
        try {
            const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
            const response = await generateContentWithRetry(ai.models, {
                model: 'gemini-2.5-flash',
                contents: `Extract information for the Talmudic passage: ${ rootNode.title } (${ rootNode.sourceText })`,
                config: {
                    systemInstruction: `You are a helpful assistant specialized in rabbinic literature.For a given Talmudic source, you must provide:
            1. The original Hebrew / Aramaic text("hebrewText").
                    2. The Steinsaltz Hebrew translation / explanation("hebrewTranslation").
                    3. A standard English translation("translation").
                    4. A list of 3 - 5 keywords("keywords").
                    
                    Return the data in a JSON object.`,
                    responseMimeType: "application/json",
                }
            });

            const jsonString = response.text.trim();
            const aiData = JSON.parse(jsonString);
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
        const tree = receptionForest.find(t => t.nodes.some(n => n.id === updatedNode.id));
        if (!tree) return;

        const updatedNodes = tree.nodes.map(node => node.id === updatedNode.id ? updatedNode : node);
        const treeDocRef = doc(db, "receptionTrees", tree.id);
        await updateDoc(treeDocRef, { nodes: updatedNodes });
    };

    const handleDeleteNode = async (nodeId: string) => {
        if (!window.confirm("Are you sure you want to delete this node and all its connections? This action cannot be undone.")) {
            return;
        }

        const tree = receptionForest.find(t => t.nodes.some(n => n.id === nodeId));
        if (!tree) {
            console.error("Tree not found for node ID:", nodeId);
            return;
        }

        const nodeToDelete = tree.nodes.find(n => n.id === nodeId);
        if (!nodeToDelete) return;

        try {
            if (nodeToDelete.type === 'root') {
                await deleteDoc(doc(db, "receptionTrees", tree.id));
            } else {
                // It's a branch
                const updatedNodes = tree.nodes.filter(n => n.id !== nodeId);
                const updatedEdges = tree.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
                const treeDocRef = doc(db, "receptionTrees", tree.id);
                await updateDoc(treeDocRef, { nodes: updatedNodes, edges: updatedEdges });
            }
            setSelectedGraphNodeId(null);
        } catch (error) {
            console.error("Error during deletion:", error);
            alert("Failed to delete node. Check console for details.");
        }
    };

    const handleMergeTrees = async (targetTreeId: string, sourceTreeIds: string[]) => {
        const targetTree = receptionForest.find(t => t.id === targetTreeId);
        if (!targetTree) return;

        const targetRoot = targetTree.nodes.find(n => n.type === 'root');
        if (!targetRoot) return;

        for (const sourceId of sourceTreeIds) {
            const sourceTree = receptionForest.find(t => t.id === sourceId);
            if (!sourceTree) continue;

            const sourceRoot = sourceTree.nodes.find(n => n.type === 'root') as RootNode;
            const sourceBranches = sourceTree.nodes.filter(n => n.type === 'branch') as BranchNode[];

            // 1. Check if we need to convert Source Root to a Branch
            // If the source tree ALREADY has a branch that effectively duplicates the root (same title),
            // then we should NOT convert the root, to avoid creating a duplicate.
            const hasEquivalentBranch = sourceBranches.some(b => b.workTitle === sourceRoot.title);

            let newBranchFromRoot: BranchNode | null = null;
            let newEdgeFromRoot: GraphEdge | null = null;

            if (!hasEquivalentBranch) {
                newBranchFromRoot = {
                    id: `branch - from - root - ${ sourceRoot.id } `,
                    type: 'branch',
                    workTitle: sourceRoot.title,
                    author: 'Unknown',
                    publicationDetails: 'Merged from Root',
                    referenceText: sourceRoot.translation || '',
                    userNotes: `Original Source: ${ sourceRoot.sourceText } \n\n${ sourceRoot.userNotesKeywords } `,
                    position: { x: targetRoot.position.x + 100, y: targetRoot.position.y + 100 }
                };

                newEdgeFromRoot = {
                    id: `edge - merged - root - ${ crypto.randomUUID() } `,
                    source: targetRoot.id,
                    target: newBranchFromRoot.id,
                    category: LinkCategory.DirectQuote,
                    label: LinkCategory.DirectQuote
                };
            }

            // 2. Re-link edges for existing branches to the target root
            // We attach them to the Target Root directly now, to keep it simple and flat.
            // (Unless we created a newBranchFromRoot, but even then, attaching to Target Root is safer for now)
            const edgesForMovedBranches: GraphEdge[] = sourceBranches.map(branch => ({
                id: `edge - merged - ${ crypto.randomUUID() } `,
                source: targetRoot.id, // Connect to the Target Root
                target: branch.id,
                category: LinkCategory.DirectQuote,
                label: LinkCategory.DirectQuote
            }));

            // 3. Update Target Tree
            const nodesToAdd = [...sourceBranches];
            if (newBranchFromRoot) nodesToAdd.push(newBranchFromRoot);

            const edgesToAdd = [...edgesForMovedBranches];
            if (newEdgeFromRoot) edgesToAdd.push(newEdgeFromRoot);

            const targetTreeRef = doc(db, "receptionTrees", targetTreeId);
            await updateDoc(targetTreeRef, {
                nodes: arrayUnion(...nodesToAdd),
                edges: arrayUnion(...edgesToAdd)
            });

            // 5. Delete Source Tree
            await deleteDoc(doc(db, "receptionTrees", sourceId));
        }

        setSelectedGraphNodeId(targetRoot.id);
        alert("Merge completed successfully!");
    };


    const handleSendMessage = async (message: string) => {
        if (!chat) return;

        setIsLoading(true);
        const userMessage: ChatMessage = { role: 'user', text: message };
        setChatHistory(prev => [...prev, userMessage]);

        try {
            const response = await chat.sendMessage({ message });
            const modelMessage: ChatMessage = { role: 'model', text: response.text };
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

                // Check if title needs standardization
                if (rootNode.title.trim() !== rootNode.sourceText.trim()) {
                    const oldTitle = rootNode.title;
                    const newTitle = rootNode.sourceText;

                    // Append old title to user notes if it's not already there
                    let newNotes = rootNode.userNotesKeywords || "";
                    if (!newNotes.includes(`Old Title: ${ oldTitle } `)) {
                        newNotes = `< h3 > Old Title: ${ oldTitle }</h3 > ` + newNotes;
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
                alert(`Successfully standardized ${ updatedCount } page titles!`);
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

    const renderView = () => {
        if (isDbLoading) {
            return (
                <div className="flex-1 flex items-center justify-center h-full">
                    <div className="flex items-center gap-2 text-text-muted">
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Loading Reception Forest...</span>
                    </div>
                </div>
            )
        }
        switch (currentView) {
            case 'library':
                return <LibraryView onViewChange={handleViewChange} />;

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
                    />
                );

            case 'analyzer':
                return (
                    <TextAnalyzerView
                        onApproveFinding={handleApproveAIFinding}
                        existingRoots={allNodes.filter(n => n.type === 'root').map(n => (n as RootNode).sourceText)}
                        onAnalysisComplete={handleSaveAnalysisToLibrary}
                    />
                );
            case 'assistant':
                return (
                    <AIAssistantView
                        history={chatHistory}
                        onSendMessage={handleSendMessage}
                        isLoading={isAiLoading}
                    />
                );
            case 'dashboard':
            default:
                return (
                    <Dashboard
                        receptionForest={receptionForest}
                        onSelectTree={(treeId) => {
                            const tree = receptionForest.find(t => t.id === treeId);
                            if (tree) {
                                handleSelectNode(tree.root);
                            }
                            setCurrentView('split-pane');
                        }}
                        onAddPassage={() => setIsAddPassageModalOpen(true)}
                        onOpenMergeModal={() => setIsMergeModalOpen(true)}
                        onStandardizeTitles={handleStandardizeTitles}
                    />
                );
        }
    };

    return (
        <Layout
            currentView={currentView}
            onViewChange={handleViewChange}
            showRightPanel={false}
            aiFindings={aiFindings}
            onApproveFinding={handleApproveAIFinding}
            onDismissFinding={(id) => handleUpdateFinding(id, AIFindingStatus.Rejected)}

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

        </Layout>
    );
};

export default App;
