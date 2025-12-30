
import React, { useState, useMemo, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { RootNode, BranchNode, ReceptionTree, GraphNode } from '../types';

interface AddPassageModalProps {
    receptionForest: ReceptionTree[];
    onClose: () => void;
    onCreateRoot: (node: Omit<RootNode, 'id' | 'position'>, initialBranch?: Omit<BranchNode, 'id' | 'position' | 'type'>) => void;
    onCreateBranch: (branchData: Omit<BranchNode, 'id' | 'position' | 'type'>, parentTreeId: string, parentNodeId?: string) => void;
    parentNodeForBranch?: GraphNode | null;
}

const AddPassageModal: React.FC<AddPassageModalProps> = ({ receptionForest, onClose, onCreateRoot, onCreateBranch, parentNodeForBranch }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Unified Form State
    const [citation, setCitation] = useState(''); // Acts as Root Source Text
    const [topicTitle, setTopicTitle] = useState(''); // Acts as Branch Work Title (or Root Title if creating new)
    const [author, setAuthor] = useState('');
    const [publicationDetails, setPublicationDetails] = useState('');
    const [referenceText, setReferenceText] = useState('');
    const [userNotes, setUserNotes] = useState('');

    // Pre-fill if adding a branch to a specific node
    useEffect(() => {
        if (parentNodeForBranch) {
            if (parentNodeForBranch.type === 'root') {
                setCitation((parentNodeForBranch as RootNode).sourceText);
            } else {
                // Find the root of this branch's tree
                const tree = receptionForest.find(t => t.branches?.some(b => b.id === parentNodeForBranch.id));
                const root = tree?.root;
                if (root) setCitation(root.sourceText);
            }
        }
    }, [parentNodeForBranch, receptionForest]);

    const handleCreateEntry = async () => {
        if (!citation.trim() || !topicTitle.trim() || !referenceText.trim()) {
            setError('Please fill in the Citation, Topic Title, and Reference Text.');
            return;
        }
        setIsLoading(true);
        setError(null);

        try {
            // 1. Prepare Branch Data (The Topic)
            const branchData: Omit<BranchNode, 'id' | 'position' | 'type'> = {
                author: author || 'Unknown Author',
                workTitle: topicTitle,
                publicationDetails: publicationDetails || 'N/A',
                referenceText: referenceText,
                userNotes: userNotes
            };

            // 2. Check if Root exists
            // Normalize logic duplicated from App.tsx (should ideally be shared)
            const normalizeSourceText = (text: string) => {
                return text.toLowerCase()
                    .replace(/\b(bavli|yerushalmi|masechet|tractate|talmud|b\.|y\.|t\.)\b/g, '')
                    .replace(/[.,\-:;()]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            };
            const normalizedCitation = normalizeSourceText(citation);

            const existingTree = receptionForest.find(tree => {
                const root = tree.root;
                return root && normalizeSourceText(root.sourceText) === normalizedCitation;
            });

            if (existingTree) {
                // Case A: Root Exists -> Add Branch
                const rootNode = existingTree.root;
                if (rootNode) {
                    onCreateBranch(branchData, existingTree.id, rootNode.id);
                    onClose();
                } else {
                    throw new Error("Found tree but no root node.");
                }
            } else {
                // Case B: New Root -> Fetch Data & Create Root + Branch
                const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
                const response = await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: `Extract information for the Talmudic passage: ${citation}`,
                    config: {
                        systemInstruction: `You are an expert in Talmudic literature with access to comprehensive rabbinic text databases. 

For the given Talmudic passage citation, you MUST provide COMPLETE, FULL texts - not summaries or excerpts:

1. "hebrewText": The COMPLETE original Hebrew/Aramaic text of the ENTIRE Talmudic page or section. Include ALL the text from that page/section, not a summary. This should be the full primary text as it appears in the Talmud.

2. "hebrewTranslation": The COMPLETE Steinsaltz Hebrew translation/explanation of the ENTIRE page. Include the full Steinsaltz commentary, not just excerpts. This should be a comprehensive modern Hebrew explanation of the Aramaic text.

3. "translation": A COMPLETE standard English translation of the ENTIRE passage. Provide the full English text of the page, not a summary or partial translation.

4. "keywords": 3-5 relevant keywords or themes from this passage.

CRITICAL: All texts must be COMPLETE and COMPREHENSIVE. Do not provide summaries, excerpts, or shortened versions. Return all data in a JSON object with these exact field names.`,
                        responseMimeType: "application/json",
                    }
                });

                const jsonString = response.text.trim();
                const aiData = JSON.parse(jsonString);

                // Validate AI response
                if (!aiData.hebrewText || !aiData.translation) {
                    console.warn('[AI] Incomplete AI response:', aiData);
                    setError('AI returned incomplete data. Please try again or use the Sync button after creating.');
                }

                console.log('[AI] Successfully fetched root content:', {
                    hebrewTextLength: aiData.hebrewText?.length || 0,
                    hebrewTranslationLength: aiData.hebrewTranslation?.length || 0,
                    translationLength: aiData.translation?.length || 0,
                    keywords: aiData.keywords
                });

                const keywords = Array.isArray(aiData.keywords) ? aiData.keywords : [];
                const userNotesKeywords = `<h3>Suggested Keywords</h3><ul>${keywords.map((kw: string) => `<li>${kw}</li>`).join('')}</ul>`;

                const newRootNode: Omit<RootNode, 'id' | 'position'> = {
                    title: citation, // The Citation IS the title for the Page Root
                    sourceText: citation,
                    type: 'root',
                    hebrewText: aiData.hebrewText || '',
                    hebrewTranslation: aiData.hebrewTranslation || '',
                    translation: aiData.translation || '',
                    userNotesKeywords: userNotesKeywords
                };

                // Pass both Root and Branch to App.tsx
                onCreateRoot(newRootNode, branchData);
            }

        } catch (err) {
            console.error("Error creating entry:", err);
            setError("Failed to create entry. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" aria-modal="true" role="dialog">
            <div className="relative z-10 mx-auto w-full max-w-lg">
                <div className="flex flex-col rounded-xl border border-primary/20 bg-[#1f2335] text-white shadow-2xl shadow-primary/10">
                    <div className="flex flex-col gap-2 p-6 sm:pb-0 sm:pt-8 sm:px-8">
                        <h1 className="text-3xl font-bold tracking-tight text-white">Add New Entry</h1>
                        <p className="text-white/70">Enter the Talmudic Citation and your Topic. We'll handle the rest.</p>
                    </div>

                    <div className="flex flex-col gap-6 px-6 sm:px-8 py-6 max-h-[60vh] overflow-y-auto">
                        <ModalField label="Talmudic Citation (Page)">
                            <input
                                className="modal-input"
                                placeholder="e.g., Bavli Ketubot 111a"
                                value={citation}
                                onChange={(e) => setCitation(e.target.value)}
                                disabled={isLoading || !!parentNodeForBranch}
                            />
                            <p className="text-xs text-white/50 mt-1">This will be the main Page card.</p>
                        </ModalField>

                        <div className="border-t border-white/10 pt-4">
                            <h3 className="text-lg font-bold text-primary mb-4">Topic Details</h3>

                            <div className="space-y-4">
                                <ModalField label="Topic Title">
                                    <input
                                        className="modal-input"
                                        placeholder="e.g., Prohibition of Aliyah"
                                        value={topicTitle}
                                        onChange={(e) => setTopicTitle(e.target.value)}
                                    />
                                </ModalField>
                                <ModalField label="Author">
                                    <input
                                        className="modal-input"
                                        placeholder="e.g., Maimonides"
                                        value={author}
                                        onChange={(e) => setAuthor(e.target.value)}
                                    />
                                </ModalField>
                                <ModalField label="Work / Source">
                                    <input
                                        className="modal-input"
                                        placeholder="e.g., Mishneh Torah, Kings 5:7"
                                        value={publicationDetails}
                                        onChange={(e) => setPublicationDetails(e.target.value)}
                                    />
                                </ModalField>
                                <ModalField label="Reference Text">
                                    <textarea
                                        className="modal-input min-h-24"
                                        placeholder="Paste the relevant text here..."
                                        value={referenceText}
                                        onChange={(e) => setReferenceText(e.target.value)}
                                    />
                                </ModalField>
                                <ModalField label="Your Notes">
                                    <textarea
                                        className="modal-input min-h-24"
                                        placeholder="Analysis, thoughts..."
                                        value={userNotes}
                                        onChange={(e) => setUserNotes(e.target.value)}
                                    />
                                </ModalField>
                            </div>
                        </div>

                        {error && <p className="text-red-400 text-sm">{error}</p>}
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 p-6 sm:p-8 bg-[#1a1b26]/50 rounded-b-xl">
                        <button onClick={onClose} disabled={isLoading} className="modal-button-secondary">
                            <span className="truncate">Cancel</span>
                        </button>
                        <button onClick={handleCreateEntry} disabled={isLoading} className="modal-button-primary">
                            {isLoading ? (
                                <><svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Processing...</span></>
                            ) : (
                                <span className="truncate">Add Entry</span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
            <div className="absolute inset-0 z-0" onClick={onClose}></div>
            <style>{`
                .modal-input {
                    display: block;
                    width: 100%;
                    resize: vertical;
                    overflow: hidden;
                    border-radius: 0.5rem;
                    border: 1px solid #414868;
                    background-color: #1f2335;
                    padding: 0.875rem;
                    font-size: 1rem;
                    line-height: 1.5rem;
                    color: #c0caf5;
                }
                .modal-input::placeholder {
                    color: #565f89;
                }
                .modal-input:focus {
                    border-color: #7aa2f7;
                    outline: 0;
                    box-shadow: 0 0 0 2px rgba(122, 162, 247, 0.3);
                }
                .modal-button-primary {
                    display: flex;
                    min-width: 84px;
                    max-width: 480px;
                    cursor: pointer;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    border-radius: 0.5rem;
                    height: 2.75rem;
                    padding-left: 1rem;
                    padding-right: 1rem;
                    background-color: #7aa2f7;
                    color: #1a1b26;
                    font-size: 0.875rem;
                    font-weight: 700;
                    line-height: 1.25rem;
                    letter-spacing: 0.025em;
                    transition-property: opacity;
                    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
                    transition-duration: 150ms;
                }
                .modal-button-primary:hover {
                    background-color: #89b4fa;
                }
                .modal-button-primary:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .modal-button-secondary {
                     display: flex;
                    min-width: 84px;
                    max-width: 480px;
                    cursor: pointer;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    border-radius: 0.5rem;
                    height: 2.75rem;
                    padding-left: 1rem;
                    padding-right: 1rem;
                    background-color: rgba(122, 162, 247, 0.2);
                    color: #c0caf5;
                    font-size: 0.875rem;
                    font-weight: 700;
                    line-height: 1.25rem;
                    letter-spacing: 0.025em;
                    transition-property: background-color;
                    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
                    transition-duration: 150ms;
                }
                .modal-button-secondary:hover {
                    background-color: rgba(122, 162, 247, 0.3);
                }
                 .modal-button-secondary:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
};


const ModalField: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex w-full flex-col">
        <label className="pb-2 text-base font-medium text-white">
            {label}
        </label>
        {children}
    </div>
);


export default AddPassageModal;
