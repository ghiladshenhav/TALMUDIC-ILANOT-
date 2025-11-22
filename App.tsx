import React, { useState, useEffect, useMemo } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDoc, arrayUnion, arrayRemove, writeBatch } from "firebase/firestore";
import { ReceptionTree, GraphNode, AIFinding, AIFindingStatus, GraphEdge, RootNode, BranchNode, AIFindingType, LinkCategory } from './types';
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

    // Combine all nodes and edges from the forest for the graph view
    const allNodes = useMemo(() => receptionForest.flatMap(tree => tree.nodes), [receptionForest]);
    const allEdges = useMemo(() => receptionForest.flatMap(tree => tree.edges), [receptionForest]);
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
                const root = tree.nodes.find(n => n.type === 'root') as RootNode;
                if (!root) return null;
                return {
                    sourceText: root.sourceText,
                    title: root.title,
                    keywords: root.userNotesKeywords.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).join(', '),
                    branchCount: tree.nodes.length - 1,
                };
            }).filter(Boolean);

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
                    const newRootId = `node-root-${generateUUID()}`;
                    const newBranchId = `branch-${generateUUID()}`;

                    const PADDING_X = 100;
                    const PADDING_Y = 100;
                    let maxX = 50;
                    allNodes.forEach(n => { if (n.position.x > maxX) maxX = n.position.x; });
                    const newRootX = maxX + PADDING_X;
                    const newRootY = PADDING_Y;

                    const newRootNode: RootNode = {
                        id: newRootId,
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
                        id: newBranchId,
                        type: 'branch',
                        position: { x: newRootX + 5 + (Math.random() * 5), y: newRootY + 15 + (Math.random() * 5) },
                        author: finding.author || 'Discovered Author',
                        workTitle: finding.workTitle || 'Discovered Work',
                        publicationDetails: 'From analyzed text',
                        referenceText: finding.snippet,
                        userNotes: `Added from Reference Detector.\n\nJustification: ${finding.justification || 'N/A'}`,
                        style: { borderColor: '#2B3A67', borderWidth: 2 }
                    };

                    const newEdge: GraphEdge = {
                        id: `edge-${generateUUID()}`,
                        source: newRootId,
                        target: newBranchId,
                        category: LinkCategory.DirectQuote, // Default
                        label: ''
                    };

                    const newTree: ReceptionTree = {
                        id: newTreeId,
                        nodes: [newRootNode, newBranchNode],
                        edges: [newEdge]
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
            const tree = receptionForest.find(t => t.nodes.some(n => (n as RootNode).sourceText === finding.source));

            if (!tree) {
                console.error("Cannot add branch: parent tree or root node not found for source:", finding.source);
                alert(`Could not find the parent passage "${finding.source}" in your forest to add this connection.`);
                throw new Error("Parent tree not found"); // Throw to indicate failure
            }

            const rootNode = tree.nodes.find(n => n.type === 'root'); // Find root to attach to by default for AI suggestions

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
            await handleCreateBranchNode(newBranchData, tree.id, rootNode?.id, true);
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
            return;
        }

        // If no parentNodeId is provided, default to the root (legacy behavior, but we should try to avoid this)
        let sourceNodeId = parentNodeId;
        if (!sourceNodeId) {
            const rootNode = treeToUpdate.nodes.find(node => node.type === 'root');
            if (rootNode) sourceNodeId = rootNode.id;
        }

        if (!sourceNodeId) {
            console.error(`Could not find a source node in the parent tree with id "${parentTreeId}".`);
            return;
        }

        const sourceNode = treeToUpdate.nodes.find(n => n.id === sourceNodeId);
        const sourcePos = sourceNode?.position || { x: 0, y: 0 };

        const newNodeId = `branch-${generateUUID()}`;
        const newBranchNode: BranchNode = {
            ...branchData,
            id: newNodeId,
            type: 'branch',
            // Position relative to source node
            position: { x: sourcePos.x + 50 + (Math.random() * 50), y: sourcePos.y + 200 + (Math.random() * 50) },
        };

        const newEdge: GraphEdge = {
            id: `edge-${generateUUID()}`,
            source: sourceNodeId,
            target: newBranchNode.id,
            category: LinkCategory.DirectQuote,
            label: LinkCategory.DirectQuote,
        };

        const treeDocRef = doc(db, "receptionTrees", parentTreeId);
        await updateDoc(treeDocRef, {
            nodes: arrayUnion(newBranchNode),
            edges: arrayUnion(newEdge)
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
            alert(`Failed to save text to library history: ${error.message || "Unknown error"}`);
        }
    };

    const handleRunFullAnalysis = async (fullText: string) => {
        setIsAnalysisModalOpen(false);
        setIsLoading(true);

        const graphSummary = receptionForest.map(tree => {
            const root = tree.nodes.find(n => n.type === 'root') as RootNode;
            if (!root) return null;
            return {
                sourceText: root.sourceText,
                title: root.title,
                keywords: root.userNotesKeywords.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).join(', ')
            };
        }).filter(Boolean);

        try {
            const ai = getAI(app, { backend: new GoogleAIBackend() });
            const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
            const prompt = `You are a Talmudic research assistant. Analyze the following user-provided text based on their current research graph.
--- USER TEXT ---
${fullText}
--- END USER TEXT ---

--- USER'S GRAPH SUMMARY ---
${JSON.stringify(graphSummary, null, 2)}
--- END GRAPH SUMMARY ---

Scan the user's text and identify three types of connections. Return a single JSON object with three arrays: "rootMatches", "thematicFits", and "newRoots".
For "rootMatches" and "thematicFits", each item must have: 
- "snippet" (a relevant quote from the user text)
- "contextBefore" (the two sentences immediately preceding the snippet)
- "contextAfter" (the two sentences immediately following the snippet)
- "confidence" (a number 0-100)
- "source" (the Talmudic passage it matches, e.g., "Bavli Kiddushin 40b")
- "originalText" (the full quote in the original Hebrew/Aramaic)
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
                id: `finding-rm-${crypto.randomUUID()}-${i}`,
                type: AIFindingType.RootMatch,
                status: AIFindingStatus.Pending,
                ...item
            }));
            results.thematicFits?.forEach((item: any, i: number) => findings.push({
                id: `finding-tf-${crypto.randomUUID()}-${i}`,
                type: AIFindingType.ThematicFit,
                status: AIFindingStatus.Pending,
                ...item
            }));
            results.newRoots?.forEach((item: any, i: number) => findings.push({
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
                createdAt: new Date(), // Firestore will convert this
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
            const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
            const response = await generateContentWithRetry(ai.models, {
                model: 'gemini-2.5-flash',
                contents: `Extract information for the Talmudic passage: ${rootNode.title} (${rootNode.sourceText})`,
                config: {
                    systemInstruction: `You are a helpful assistant specialized in rabbinic literature. For a given Talmudic source, you must provide:
                    1. The original Hebrew/Aramaic text ("hebrewText").
                    2. The Steinsaltz Hebrew translation/explanation ("hebrewTranslation").
                    3. A standard English translation ("translation").
                    4. A list of 3-5 keywords ("keywords").
                    
                    Return the data in a JSON object.`,
                    responseMimeType: "application/json",
                }
            });

            const jsonString = response.text.trim();
            const aiData = JSON.parse(jsonString);
            const keywords = Array.isArray(aiData.keywords) ? aiData.keywords : [];
            const userNotesKeywords = `<h3>Suggested Keywords</h3><ul>${keywords.map((kw: string) => `<li>${kw}</li>`).join('')}</ul>`;

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
                    id: `branch-from-root-${sourceRoot.id}`,
                    type: 'branch',
                    workTitle: sourceRoot.title,
                    author: 'Unknown',
                    publicationDetails: 'Merged from Root',
                    referenceText: sourceRoot.translation || '',
                    userNotes: `Original Source: ${sourceRoot.sourceText}\n\n${sourceRoot.userNotesKeywords}`,
                    position: { x: targetRoot.position.x + 100, y: targetRoot.position.y + 100 }
                };

                newEdgeFromRoot = {
                    id: `edge-merged-root-${crypto.randomUUID()}`,
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
                id: `edge-merged-${crypto.randomUUID()}`,
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

    const handleCleanupTree = async (treeId: string) => {
        const tree = receptionForest.find(t => t.id === treeId);
        if (!tree) return;

        const root = tree.nodes.find(n => n.type === 'root');
        if (!root) return;

        const branches = tree.nodes.filter(n => n.type === 'branch') as BranchNode[];

        // 1. Deduplicate Branches (keep first occurrence of unique title+text)
        const uniqueBranches: BranchNode[] = [];
        const seen = new Set<string>();

        branches.forEach(b => {
            const key = `${b.workTitle}|${b.referenceText}`.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                uniqueBranches.push(b);
            }
        });

        // 2. Flatten Edges (connect all unique branches to Root)
        const newEdges: GraphEdge[] = uniqueBranches.map(b => ({
            id: `edge-cleanup-${crypto.randomUUID()}`,
            source: root.id,
            target: b.id,
            category: LinkCategory.DirectQuote,
            label: LinkCategory.DirectQuote
        }));

        // 3. Update Tree
        const treeDocRef = doc(db, "receptionTrees", treeId);
        await updateDoc(treeDocRef, {
            nodes: [root, ...uniqueBranches],
            edges: newEdges
        });

        alert(`Cleanup complete! Removed ${branches.length - uniqueBranches.length} duplicates.`);
    };

    const handleRepairAll = async () => {
        if (!confirm("This will scan ALL pages in your library. It will:\n1. Fix internal ID collisions (Critical).\n2. Convert Page Headers into Topics.\n3. Merge all split pages into single, unified pages.\n4. Remove duplicates.\n\nThis is a destructive operation. Continue?")) return;

        setIsLoading(true);
        try {
            // --- Phase 1: ID Repair (Local & Global) ---
            // We perform all ID fixes in-memory on a clone first, then commit the final state.
            // This prevents race conditions where Global fix overwrites Local fix.

            let workingTrees = JSON.parse(JSON.stringify(receptionForest)) as typeof receptionForest;
            let idCollisionsFixed = 0;
            const treesToUpdate = new Map<string, { nodes: GraphNode[], edges: GraphEdge[] }>();

            // Helper to mark a tree for update
            const markForUpdate = (tree: typeof receptionForest[0]) => {
                treesToUpdate.set(tree.id, { nodes: tree.nodes, edges: tree.edges });
            };

            // Step -1: Fix Local ID Collisions (Same ID within same tree)
            workingTrees.forEach(tree => {
                const seenIds = new Set<string>();
                let treeModified = false;
                const idRemapping = new Map<string, string[]>(); // oldId -> [newId1, newId2, ...]

                // 1. Identify and rename duplicate nodes
                const newNodes = tree.nodes.map(node => {
                    if (seenIds.has(node.id)) {
                        treeModified = true;
                        const newId = `repaired-local-${crypto.randomUUID()}`;
                        console.log(`[Repair] Fixing duplicate node ID in tree ${tree.id}: ${node.id} -> ${newId}`);
                        idCollisionsFixed++;

                        // Track remapping for edge fixing
                        const existing = idRemapping.get(node.id) || [];
                        idRemapping.set(node.id, [...existing, newId]);

                        return { ...node, id: newId };
                    } else {
                        seenIds.add(node.id);
                        return node;
                    }
                });

                // 2. Fix Edges for renamed nodes
                // If we have duplicate nodes A1(id=X) and A2(id=X), and edges E1(target=X) and E2(target=X).
                // We renamed A2 to Y. We need to move *one* edge to target Y.
                // Since we can't know which edge belongs to which node (ambiguous), we distribute them.
                if (idRemapping.size > 0) {
                    let edges = [...tree.edges];

                    idRemapping.forEach((newIds, oldId) => {
                        // Find all edges targeting the old ID
                        const targetEdges = edges.filter(e => e.target === oldId);
                        const sourceEdges = edges.filter(e => e.source === oldId);

                        // Distribute edges to new IDs
                        // We keep the first edge pointing to the original (kept) ID (which is still oldId)
                        // We move subsequent edges to the new IDs.

                        // Note: This is a heuristic. We assume 1 edge per branch usually.
                        // If there are more edges than nodes, some stay with original.
                        // If there are fewer, some nodes become orphans (unavoidable without more info).

                        newIds.forEach((newId, index) => {
                            // Try to find an edge to move
                            // We skip index 0 because that corresponds to the *first* duplicate which we renamed?
                            // Wait, logic check:
                            // Original: Node A (id=X), Node B (id=X).
                            // Loop 1 (Node A): seenIds.add(X). Node A keeps ID X.
                            // Loop 2 (Node B): seenIds.has(X). Node B gets ID Y. idRemapping.set(X, [Y]).

                            // So we have 1 new ID "Y" for old ID "X".
                            // We need to move *one* edge from X to Y.

                            // Target Edges
                            if (index < targetEdges.length) {
                                // We take the (index + 1)th edge, leaving the 0th for the original Node A
                                // Actually, we can just pop from the list of edges targeting X?
                                // Let's just take the *last* available edge to minimize disruption to the first one.
                                const edgeToMove = targetEdges.pop();
                                if (edgeToMove) {
                                    edgeToMove.target = newId;
                                    treeModified = true;
                                }
                            }

                            // Source Edges (same logic)
                            if (index < sourceEdges.length) {
                                const edgeToMove = sourceEdges.pop();
                                if (edgeToMove) {
                                    edgeToMove.source = newId;
                                    treeModified = true;
                                }
                            }
                        });
                    });
                }

                if (treeModified) {
                    tree.nodes = newNodes; // Update in-memory
                    markForUpdate(tree);
                }
            });

            // Step 0: Fix Global ID Collisions (Same ID across different trees)
            // Now we use `workingTrees` which has unique local IDs.

            const rootIdMap = new Map<string, string[]>();
            const branchIdMap = new Map<string, string[]>();

            workingTrees.forEach(tree => {
                // Check Roots
                const root = tree.nodes.find(n => n.type === 'root');
                if (root) {
                    const existing = rootIdMap.get(root.id) || [];
                    rootIdMap.set(root.id, [...existing, tree.id]);
                }

                // Check Branches
                tree.nodes.filter(n => n.type === 'branch').forEach(branch => {
                    const existing = branchIdMap.get(branch.id) || [];
                    branchIdMap.set(branch.id, [...existing, tree.id]);
                });
            });

            // Fix Root Collisions
            for (const [rootId, treeIds] of rootIdMap) {
                if (treeIds.length > 1) {
                    console.log(`[Repair] Found ID collision for Root ID ${rootId} in trees:`, treeIds);

                    // Keep the first tree as is. Fix the others.
                    for (let i = 1; i < treeIds.length; i++) {
                        const treeId = treeIds[i];
                        const tree = workingTrees.find(t => t.id === treeId);
                        if (!tree) continue;

                        const root = tree.nodes.find(n => n.type === 'root');
                        if (!root) continue;

                        const newRootId = `repaired-root-${crypto.randomUUID()}`;

                        // Update Root ID
                        tree.nodes = tree.nodes.map(n => n.id === root.id ? { ...n, id: newRootId } : n);
                        // Update Edges
                        tree.edges = tree.edges.map(e => e.source === root.id ? { ...e, source: newRootId } : (e.target === root.id ? { ...e, target: newRootId } : e));

                        markForUpdate(tree);
                        idCollisionsFixed++;
                    }
                }
            }

            // Fix Branch Collisions
            for (const [branchId, treeIds] of branchIdMap) {
                if (treeIds.length > 1) {
                    console.log(`[Repair] Found ID collision for Branch ID ${branchId} in trees:`, treeIds);

                    // Keep the first one. Fix others.
                    for (let i = 1; i < treeIds.length; i++) {
                        const treeId = treeIds[i];
                        const tree = workingTrees.find(t => t.id === treeId);
                        if (!tree) continue;

                        const newBranchId = `repaired-branch-${crypto.randomUUID()}`;

                        // Update Branch ID
                        tree.nodes = tree.nodes.map(n => n.id === branchId ? { ...n, id: newBranchId } : n);
                        // Update Edges
                        tree.edges = tree.edges.map(e => e.source === branchId ? { ...e, source: newBranchId } : (e.target === branchId ? { ...e, target: newBranchId } : e));

                        markForUpdate(tree);
                        idCollisionsFixed++;
                    }
                }
            }

            if (idCollisionsFixed > 0) {
                // CHUNKED BATCH UPDATES
                // Firestore limits batches to 500 operations. We use 400 to be safe.
                const BATCH_SIZE = 400;
                const updates = Array.from(treesToUpdate.entries());

                for (let i = 0; i < updates.length; i += BATCH_SIZE) {
                    const chunk = updates.slice(i, i + BATCH_SIZE);
                    const batch = writeBatch(db);

                    chunk.forEach(([treeId, data]) => {
                        const treeRef = doc(db, 'receptionTrees', treeId);
                        batch.update(treeRef, {
                            nodes: data.nodes,
                            edges: data.edges
                        });
                    });

                    await batch.commit();
                    console.log(`[Repair] Committed batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(updates.length / BATCH_SIZE)}`);
                }

                alert(`Fixed ${idCollisionsFixed} ID collisions across ${treesToUpdate.size} pages.`);
                window.location.reload();
                return;
            }



            // --- Step 1: Normalize all Roots individually ---
            // (Demote Topic Titles to Branches, Rename Roots to Citation)

            // Actually, let's do a "Stop the World" approach.
            // We can't easily stop the world with Firestore real-time listeners.
            // But we can just process the current `receptionForest` state and perform a batch of writes.

            // Helper
            const normalizeSourceText = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
            const treesToDelete = new Set<string>();

            // 1. Normalize Roots
            const normalizedTrees = workingTrees.map(tree => {
                const root = tree.nodes.find(n => n.type === 'root') as RootNode;
                if (!root) return tree; // Skip invalid

                let nodes = [...tree.nodes];
                let edges = [...tree.edges];
                let modified = false;

                const normalizedTitle = normalizeSourceText(root.title);
                const normalizedSource = normalizeSourceText(root.sourceText);

                if (normalizedTitle !== normalizedSource && root.title !== root.sourceText) {
                    // Demote Root Title to Branch
                    const existingBranch = nodes.find(n => n.type === 'branch' && (n as BranchNode).workTitle === root.title);

                    if (!existingBranch) {
                        const newBranch: BranchNode = {
                            id: `branch-from-root-${root.id}-${crypto.randomUUID()}`,
                            type: 'branch',
                            workTitle: root.title,
                            author: 'Unknown',
                            publicationDetails: 'Original Page Topic',
                            referenceText: root.translation || '',
                            userNotes: root.userNotesKeywords,
                            position: { x: root.position.x + 200, y: root.position.y }
                        };

                        const newEdge: GraphEdge = {
                            id: `edge-demoted-${crypto.randomUUID()}`,
                            source: root.id,
                            target: newBranch.id,
                            category: LinkCategory.DirectQuote,
                            label: LinkCategory.DirectQuote
                        };

                        nodes.push(newBranch);
                        edges.push(newEdge);
                    }

                    // Rename Root
                    nodes = nodes.map(n => n.id === root.id ? { ...n, title: n.sourceText } : n);
                    modified = true;
                }

                return { ...tree, nodes, edges, _modified: modified };
            });

            // 2. Group by Root Citation (Source Text)
            const groups = new Map<string, typeof normalizedTrees>();

            normalizedTrees.forEach(tree => {
                const root = tree.nodes.find(n => n.type === 'root') as RootNode;
                if (!root) return;

                const key = normalizeSourceText(root.sourceText); // Group by normalized citation
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(tree);
            });

            // 3. Merge Groups
            let mergedCount = 0;

            for (const [key, group] of groups) {
                if (group.length === 0) continue;

                // Target is the first tree in the group
                const targetTree = group[0];
                const targetRoot = targetTree.nodes.find(n => n.type === 'root') as RootNode;

                let allNodes = [...targetTree.nodes];
                let allEdges = [...targetTree.edges];

                // Merge other trees into target
                for (let i = 1; i < group.length; i++) {
                    const sourceTree = group[i];
                    const sourceRoot = sourceTree.nodes.find(n => n.type === 'root') as RootNode;

                    // Get branches from source
                    const sourceBranches = sourceTree.nodes.filter(n => n.type === 'branch') as BranchNode[];

                    // Re-link source branches to target root
                    const movedEdges = sourceBranches.map(b => ({
                        id: `edge-merged-${crypto.randomUUID()}`,
                        source: targetRoot.id,
                        target: b.id,
                        category: LinkCategory.DirectQuote,
                        label: LinkCategory.DirectQuote
                    }));

                    allNodes.push(...sourceBranches);
                    allEdges.push(...movedEdges);

                    // Mark source tree for deletion
                    treesToDelete.add(sourceTree.id);
                    mergedCount++;
                }

                // 4. Deduplicate Branches in the merged tree
                const branches = allNodes.filter(n => n.type === 'branch') as BranchNode[];
                const uniqueBranches: BranchNode[] = [];
                const seen = new Set<string>();

                branches.forEach(b => {
                    const branchKey = `${b.workTitle}|${b.referenceText}`.toLowerCase().trim();
                    if (!seen.has(branchKey)) {
                        seen.add(branchKey);
                        uniqueBranches.push(b);
                    }
                });

                // Reconstruct tree with unique branches
                const finalNodes = [targetRoot, ...uniqueBranches];
                // Re-link edges
                const finalEdges = uniqueBranches.map(b => ({
                    id: `edge-final-${crypto.randomUUID()}`,
                    source: targetRoot.id,
                    target: b.id,
                    category: LinkCategory.DirectQuote,
                    label: LinkCategory.DirectQuote
                }));

                // Queue update for target tree
                treesToUpdate.set(targetTree.id, { nodes: finalNodes, edges: finalEdges });
            }

            // 5. Execute Writes
            const batch2 = writeBatch(db); // Use a new batch for the merge part

            // Updates
            for (const [treeId, data] of treesToUpdate) {
                const ref = doc(db, "receptionTrees", treeId);
                batch2.update(ref, data);
            }

            // Deletions
            for (const treeId of treesToDelete) {
                const ref = doc(db, "receptionTrees", treeId);
                batch2.delete(ref);
            }

            await batch2.commit();

            alert(`Library Repair Complete!\n- Merged ${mergedCount} split pages.\n- Normalized and deduplicated all topics.`);

            // Force view reset to avoid stale state
            setSelectedGraphNodeId(null);

        } catch (error) {
            console.error("Repair failed:", error);
            alert("Repair failed. See console.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddEdge = async (edge: GraphEdge) => {
        const sourceNodeTree = receptionForest.find(tree => tree.nodes.some(n => n.id === edge.source));
        if (!sourceNodeTree) return;

        const treeDocRef = doc(db, "receptionTrees", sourceNodeTree.id);
        await updateDoc(treeDocRef, { edges: arrayUnion(edge) });
        // cancelConnection(); // Removed
    };

    const handleDeleteEdge = async (edgeId: string) => {
        const tree = receptionForest.find(t => t.edges.some(e => e.id === edgeId));
        if (!tree) return;

        const edgeToDelete = tree.edges.find(e => e.id === edgeId);
        if (!edgeToDelete) return;

        const treeDocRef = doc(db, "receptionTrees", tree.id);
        await updateDoc(treeDocRef, { edges: arrayRemove(edgeToDelete) });
        setSelectedGraphNodeId(null); // Deselect to close sidebar
    };

    const handleUpdateEdge = async (updatedEdge: GraphEdge) => {
        const tree = receptionForest.find(t => t.edges.some(e => e.id === updatedEdge.id));
        if (!tree) return;

        const updatedEdges = tree.edges.map(e => e.id === updatedEdge.id ? updatedEdge : e);
        const treeDocRef = doc(db, "receptionTrees", tree.id);
        await updateDoc(treeDocRef, { edges: updatedEdges });
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



    const handleForceRegenerateBranchIds = async (treeId: string) => {
        console.log('[handleForceRegenerateBranchIds] Called with treeId:', treeId);
        if (!confirm("This will regenerate IDs for ALL branches in this page. Use this if branches are hidden or merged incorrectly due to ID collisions.")) {
            console.log('[handleForceRegenerateBranchIds] User cancelled');
            return;
        }
        console.log('[handleForceRegenerateBranchIds] User confirmed, starting regeneration...');

        setIsLoading(true);
        try {
            const treeRef = doc(db, 'receptionTrees', treeId);
            const treeDoc = await getDoc(treeRef);
            if (!treeDoc.exists()) throw new Error("Tree not found");

            const tree = { id: treeDoc.id, ...treeDoc.data() } as ReceptionTree;
            const idMap = new Map<string, string[]>(); // oldId -> [newId1, newId2, ...]

            // 1. Rename ALL branches
            const newNodes = tree.nodes.map(node => {
                if (node.type === 'branch') {
                    const newId = `forced-regen-${crypto.randomUUID()}`;
                    const existing = idMap.get(node.id) || [];
                    idMap.set(node.id, [...existing, newId]);
                    return { ...node, id: newId };
                }
                return node;
            });

            // 2. Update Edges
            const newEdges = tree.edges.map(edge => ({ ...edge })); // Deep copy edges

            idMap.forEach((newIds, oldId) => {
                const targetEdges = newEdges.filter(e => e.target === oldId);
                const sourceEdges = newEdges.filter(e => e.source === oldId);

                newIds.forEach((newId, index) => {
                    if (index < targetEdges.length) targetEdges[index].target = newId;
                    if (index < sourceEdges.length) sourceEdges[index].source = newId;
                });
            });

            await updateDoc(treeRef, { nodes: newNodes, edges: newEdges });
            alert("Regenerated all branch IDs! The page will now reload.");
            window.location.reload();

        } catch (error) {
            console.error("Error regenerating IDs:", error);
            alert("Failed to regenerate IDs. See console for details.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRepairNodeIds = async (treeId: string) => {
        const tree = receptionForest.find(t => t.id === treeId);
        if (!tree) return;

        console.log(`[Repair] Scanning tree ${tree.id} for duplicates...`);

        const nodesById = new Map<string, GraphNode[]>();
        tree.nodes.forEach(node => {
            const existing = nodesById.get(node.id) || [];
            nodesById.set(node.id, [...existing, node]);
        });

        const edgesByTarget = new Map<string, GraphEdge[]>();
        tree.edges.forEach(edge => {
            const existing = edgesByTarget.get(edge.target) || [];
            edgesByTarget.set(edge.target, [...existing, edge]);
        });

        let nodesFixed = 0;
        const newNodes = [...tree.nodes];
        const newEdges = [...tree.edges];

        for (const [id, nodes] of nodesById) {
            if (nodes.length > 1) {
                console.log(`[Repair] Found ${nodes.length} nodes with ID ${id}`);

                // Keep the first one as is
                // Fix the rest
                const edges = edgesByTarget.get(id) || [];

                for (let i = 1; i < nodes.length; i++) {
                    const nodeToFix = nodes[i];
                    const newId = `repaired-${crypto.randomUUID()}`;

                    // Update Node
                    const nodeIndex = newNodes.indexOf(nodeToFix);
                    if (nodeIndex !== -1) {
                        newNodes[nodeIndex] = { ...nodeToFix, id: newId };
                        nodesFixed++;
                    }

                    // Update corresponding Edge (if available)
                    // We assume the edges are in the same order as nodes if they were created sequentially
                    // This is a heuristic but better than leaving them broken
                    if (i < edges.length) {
                        const edgeToFix = edges[i];
                        const edgeIndex = newEdges.indexOf(edgeToFix);
                        if (edgeIndex !== -1) {
                            newEdges[edgeIndex] = { ...edgeToFix, target: newId };
                        }
                    }
                }
            }
        }

        if (nodesFixed > 0) {
            console.log(`[Repair] Fixed ${nodesFixed} duplicates. Saving...`);
            const treeDocRef = doc(db, "receptionTrees", tree.id);
            await updateDoc(treeDocRef, { nodes: newNodes, edges: newEdges });
            alert(`Repaired ${nodesFixed} duplicate nodes! Please reload the page if things look weird.`);
        } else {
            alert("No duplicate IDs found in this tree.");
        }
    };

    const handleStandardizeTitles = async () => {
        if (!confirm("This will rename all pages to match their source citation (e.g., 'Morning Prayer' -> 'Bavli Berachot 5a'). Old titles will be saved in the notes. Continue?")) return;

        setIsLoading(true);
        try {
            const batch = writeBatch(db);
            let updatedCount = 0;

            receptionForest.forEach(tree => {
                const rootNode = tree.nodes.find(n => n.type === 'root') as RootNode;
                if (!rootNode) return;

                // Check if title needs standardization
                if (rootNode.title.trim() !== rootNode.sourceText.trim()) {
                    const oldTitle = rootNode.title;
                    const newTitle = rootNode.sourceText;

                    // Append old title to user notes if it's not already there
                    let newNotes = rootNode.userNotesKeywords || "";
                    if (!newNotes.includes(`Old Title: ${oldTitle}`)) {
                        newNotes = `<h3>Old Title: ${oldTitle}</h3>` + newNotes;
                    }

                    const updatedRoot = {
                        ...rootNode,
                        title: newTitle,
                        userNotesKeywords: newNotes
                    };

                    const updatedNodes = tree.nodes.map(n => n.id === rootNode.id ? updatedRoot : n);
                    const treeRef = doc(db, "receptionTrees", tree.id);
                    batch.update(treeRef, { nodes: updatedNodes });
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
                        allEdges={allEdges}
                        onUpdateEdge={handleUpdateEdge}
                        onDeleteEdge={handleDeleteEdge}
                        onRegenerateRoot={handleRegenerateRootData}
                        onCleanup={handleCleanupTree}
                        onRepair={handleRepairNodeIds}
                        onRepairAll={handleRepairAll}
                        onStandardizeTitles={handleStandardizeTitles}
                        onForceRegenerateBranchIds={handleForceRegenerateBranchIds}
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
                                const root = tree.nodes.find(n => n.type === 'root');
                                if (root) handleSelectNode(root);
                            }
                            setCurrentView('split-pane');
                        }}
                        onAddPassage={() => setIsAddPassageModalOpen(true)}
                        onOpenMergeModal={() => setIsMergeModalOpen(true)}
                        onRepairAll={handleRepairAll}
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
