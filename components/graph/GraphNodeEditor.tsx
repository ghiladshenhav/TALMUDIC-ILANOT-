
import React, { useState, useEffect } from 'react';
import { GraphNode, RootNode, BranchNode, NodeStyle, BranchCategory } from '../../types';

interface GraphNodeEditorProps {
    node: GraphNode;
    onSave: (node: GraphNode) => void;
    onDelete: (nodeId: string) => void;
    onClose: () => void;
    onAddBranch: (parentNode: GraphNode) => void;
    onViewChain?: (rootNode: RootNode) => void;
    onMoveBranch: (branchId: string, targetRootId: string) => void;
    allNodes: GraphNode[];
    onAskAI?: (node: GraphNode) => void;
}

interface EditorFieldProps {
    label: string; name: string; value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
    isTextarea?: boolean; placeholder?: string; dir?: 'rtl' | 'ltr'; isSerif?: boolean;
    isSelect?: boolean; children?: React.ReactNode; type?: string;
}

const EditorField: React.FC<EditorFieldProps> = ({ label, name, value, onChange, isTextarea = false, placeholder, dir = 'ltr', isSerif = false, isSelect = false, children, type = "text" }) => {
    const commonClasses = `form-input flex w-full min-w-0 flex-1 overflow-hidden rounded-xl text-[#f5f0e1] focus:outline-0 focus:ring-2 focus:ring-[#10B981]/50 border border-[#1a4d2e]/50 bg-[#0a140a] placeholder:text-[#f5f0e1]/30 p-3.5 text-base font-normal leading-relaxed focus:border-[#10B981]/60 transition-colors ${isSerif ? 'font-serif' : 'font-display'}`;

    return (
        <div className="w-full">
            <label className="flex flex-col w-full">
                <p className="text-[#f5f0e1]/80 text-sm font-bold leading-normal pb-2 flex items-center gap-2">
                    <span className="w-1 h-4 bg-gradient-to-b from-[#10B981]/60 to-transparent rounded-full"></span>
                    {label}
                </p>
                {isSelect ? (
                    <div className="relative">
                        <select id={name} className={`${commonClasses} appearance-none pr-10 cursor-pointer`} name={name} value={value} onChange={onChange}>
                            <option value="">-- Select --</option>
                            {children}
                        </select>
                        <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#10B981]/50">unfold_more</span>
                    </div>
                ) : isTextarea ? (
                    <textarea id={name} className={`${commonClasses} resize-y min-h-[300px]`} name={name} placeholder={placeholder || 'Enter text...'} value={value} onChange={onChange} dir={dir} />
                ) : (
                    <input id={name} className={commonClasses} name={name} placeholder={placeholder || 'Enter value...'} value={value} onChange={onChange} dir={dir} type={type} />
                )}
            </label>
        </div>
    );
};

const GraphNodeEditor: React.FC<GraphNodeEditorProps> = ({ node, onSave, onDelete, onClose, onAddBranch, onViewChain, onMoveBranch, allNodes, onAskAI }) => {
    const [title, setTitle] = useState(node.type === 'root' ? (node as RootNode).title : '');
    const [sourceText, setSourceText] = useState(node.type === 'root' ? (node as RootNode).sourceText : '');
    const [hebrewText, setHebrewText] = useState(node.type === 'root' ? (node as RootNode).hebrewText : '');
    const [hebrewTranslation, setHebrewTranslation] = useState(node.type === 'root' ? (node as RootNode).hebrewTranslation || '' : '');
    const [translation, setTranslation] = useState(node.type === 'root' ? (node as RootNode).translation : '');
    const [userNotesKeywords, setUserNotesKeywords] = useState(node.type === 'root' ? (node as RootNode).userNotesKeywords : '');

    const [author, setAuthor] = useState(node.type === 'branch' ? (node as BranchNode).author : '');
    const [workTitle, setWorkTitle] = useState(node.type === 'branch' ? (node as BranchNode).workTitle : '');
    const [publicationDetails, setPublicationDetails] = useState(node.type === 'branch' ? (node as BranchNode).publicationDetails : '');
    const [year, setYear] = useState(node.type === 'branch' ? (node as BranchNode).year || '' : '');
    const [referenceText, setReferenceText] = useState(node.type === 'branch' ? (node as BranchNode).referenceText : '');
    const [userNotes, setUserNotes] = useState(node.type === 'branch' ? (node as BranchNode).userNotes : '');
    const [category, setCategory] = useState(node.type === 'branch' ? (node as BranchNode).category : undefined);
    const [customCategory, setCustomCategory] = useState('');
    const [keywords, setKeywords] = useState(node.type === 'branch' ? ((node as BranchNode).keywords || []).join(', ') : '');

    // State for branch moving
    const [targetRootId, setTargetRootId] = useState<string>('');

    useEffect(() => {
        if (node.type === 'root') {
            const root = node as RootNode;
            setTitle(root.title);
            setSourceText(root.sourceText);
            setHebrewText(root.hebrewText);
            setHebrewTranslation(root.hebrewTranslation || '');
            setTranslation(root.translation);
            setUserNotesKeywords(root.userNotesKeywords);
        } else {
            const branch = node as BranchNode;
            setAuthor(branch.author);
            setWorkTitle(branch.workTitle);
            setPublicationDetails(branch.publicationDetails);
            setYear(branch.year || '');
            setReferenceText(branch.referenceText);
            setUserNotes(branch.userNotes);
            setCategory(branch.category);
            setCustomCategory('');
            setKeywords((branch.keywords || []).join(', '));
        }
    }, [node]);

    const handleReferenceTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setReferenceText(event.target.value);
    };

    const handleSave = () => {
        let updatedNode: GraphNode;

        if (node.type === 'root') {
            const rootNode: RootNode = { ...node, title, sourceText, hebrewText, hebrewTranslation, translation, userNotesKeywords };
            updatedNode = rootNode;
        } else {
            // Parse keywords from comma-separated string to array
            const keywordsArray = keywords
                .split(',')
                .map(k => k.trim())
                .filter(k => k.length > 0);

            // Use custom category if provided, otherwise use selected category
            const finalCategory = customCategory.trim() || category;

            const branchNode: BranchNode = {
                ...node,
                author,
                workTitle,
                publicationDetails,
                year: year || undefined,
                referenceText,
                userNotes,
                category: finalCategory as BranchCategory,
                keywords: keywordsArray
            };
            updatedNode = branchNode;
        }
        onSave(updatedNode);
    };

    const handleDelete = () => {
        onDelete(node.id);
    };

    const handleAddBranch = () => {
        onAddBranch(node);
        onClose();
    };

    const handleMoveBranch = () => {
        if (!targetRootId) {
            alert('Please select a target root');
            return;
        }
        onMoveBranch(node.id, targetRootId);
        onClose();
    };

    // Get available roots for dropdown (exclude current root if this is a branch)
    const availableRoots = allNodes.filter(n => {
        if (n.type !== 'root') return false;
        // If this is a branch, exclude its current parent root
        if (node.type === 'branch') {
            // We can't easily determine the parent here, so show all roots
            // The handleMoveBranch in App.tsx will handle the check
            return true;
        }
        return false; // Don't show dropdown for root nodes
    }) as RootNode[];

    const isRoot = node.type === 'root';

    return (
        <div className="h-full flex flex-col bg-gradient-to-b from-[#0a140a] to-[#0f1a0f] border-l border-[#1a4d2e]/30 overflow-hidden">
            <div className="p-5 border-b border-[#1a4d2e]/40 bg-gradient-to-r from-[#0a140a] via-[#0f1a0f] to-[#0a140a] sticky top-0 z-10 shadow-lg">
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-[#1a4d2e]/30">
                    <div className="flex items-center gap-3">
                        {/* Edit Icon with tree theme */}
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a4d2e]/60 to-[#0a140a] border border-[#10B981]/30 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[#10B981]">{isRoot ? 'psychiatry' : 'call_split'}</span>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-[#f5f0e1] font-serif">
                                {isRoot ? 'Edit Root Source' : 'Edit Branch'}
                            </h2>
                            <div className="text-[10px] text-[#f5f0e1]/40 font-mono">ID: {node.id.slice(0, 16)}...</div>
                        </div>
                    </div>
                    <div className="flex gap-1">
                        {onAskAI && (
                            <button
                                onClick={() => onAskAI(node)}
                                className="p-2 text-[#10B981] hover:bg-[#10B981]/10 rounded-xl transition-all"
                                title="Ask AI about this node"
                            >
                                <span className="material-symbols-outlined">smart_toy</span>
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 text-[#f5f0e1]/40 hover:text-[#f5f0e1] hover:bg-[#f5f0e1]/10 rounded-xl transition-all">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {isRoot ? (
                    <>
                        <EditorField label="Title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Oven of Akhnai" />
                        <EditorField label="Source Text" name="sourceText" value={sourceText} onChange={(e) => setSourceText(e.target.value)} placeholder="e.g. Bavli Bava Metzia 59b" />
                        <EditorField label="Hebrew/Aramaic Text" name="hebrewText" value={hebrewText} onChange={(e) => setHebrewText(e.target.value)} isTextarea dir="rtl" isSerif />
                        <EditorField label="Hebrew Translation (Steinsaltz)" name="hebrewTranslation" value={hebrewTranslation} onChange={(e) => setHebrewTranslation(e.target.value)} isTextarea dir="rtl" isSerif />
                        <EditorField label="English Translation" name="translation" value={translation} onChange={(e) => setTranslation(e.target.value)} isTextarea />
                        <EditorField label="Keywords & Notes" name="userNotesKeywords" value={userNotesKeywords} onChange={(e) => setUserNotesKeywords(e.target.value)} isTextarea />
                    </>
                ) : (
                    <>
                        <EditorField label="Author" name="author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g., David Hartman" />
                        <EditorField label="Work Title" name="workTitle" value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} placeholder="e.g., A Living Covenant" />

                        {/* Year and Publication in a row */}
                        <div className="flex gap-4">
                            <div className="w-1/3">
                                <EditorField
                                    label="Publication Year"
                                    name="year"
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                    placeholder="e.g., 1985"
                                    type="text"
                                />
                            </div>
                            <div className="flex-1">
                                <EditorField label="Publication Details" name="publicationDetails" value={publicationDetails} onChange={(e) => setPublicationDetails(e.target.value)} placeholder="e.g., New York: Free Press" />
                            </div>
                        </div>

                        <EditorField label="Reference Text (Quote)" name="referenceText" value={referenceText} onChange={(e) => setReferenceText(e.target.value)} isTextarea placeholder="The relevant quote or passage from this work..." />
                        <EditorField label="Your Notes" name="userNotes" value={userNotes} onChange={(e) => setUserNotes(e.target.value)} isTextarea placeholder="Your analysis, thoughts, or annotations..." />

                        {/* Category Section with Custom Option */}
                        <div className="space-y-3">
                            <EditorField label="Category" name="category" value={category || ''} onChange={(e) => setCategory(e.target.value as BranchCategory)} isSelect>
                                {Object.values(BranchCategory).map((cat) => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </EditorField>

                            <div className="flex items-center gap-2">
                                <span className="text-xs text-[#f5f0e1]/50">or custom:</span>
                                <input
                                    type="text"
                                    value={customCategory}
                                    onChange={(e) => setCustomCategory(e.target.value)}
                                    placeholder="Type a new category..."
                                    className="flex-1 bg-[#0a140a] text-[#f5f0e1] border border-[#1a4d2e]/50 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#10B981]/50 placeholder:text-[#f5f0e1]/30"
                                />
                            </div>
                            {customCategory && (
                                <p className="text-xs text-[#10B981]/70">
                                    <span className="material-symbols-outlined text-sm align-middle mr-1">info</span>
                                    Custom category "{customCategory}" will be used instead of the selected one
                                </p>
                            )}
                        </div>

                        <EditorField
                            label="Keywords (comma-separated)"
                            name="keywords"
                            value={keywords}
                            onChange={(e) => setKeywords(e.target.value)}
                            placeholder="e.g., משיח, Messiah, redemption, גאולה"
                        />
                    </>
                )}
            </div>

            <div className="p-4 border-t border-[#1a4d2e]/40 bg-[#0a140a]/80 flex flex-col gap-3">
                {isRoot && (
                    <div className="flex gap-3">
                        <button
                            onClick={handleAddBranch}
                            className="flex-1 flex cursor-pointer items-center justify-center overflow-hidden rounded-xl h-11 px-4 bg-[#10B981]/20 text-[#10B981] text-sm font-bold leading-normal tracking-wide transition-all hover:bg-[#10B981]/30 border border-[#10B981]/30"
                        >
                            <span className="material-symbols-outlined mr-2">add_circle</span>
                            <span className="truncate">Add Branch</span>
                        </button>
                        {onViewChain && (
                            <button
                                onClick={() => onViewChain(node as RootNode)}
                                className="flex-1 flex cursor-pointer items-center justify-center overflow-hidden rounded-xl h-11 px-4 bg-[#8B6914]/20 text-[#d4a912] text-sm font-bold leading-normal tracking-wide transition-all hover:bg-[#8B6914]/30 border border-[#8B6914]/30"
                                title="View this chain separately"
                            >
                                <span className="material-symbols-outlined mr-2">park</span>
                                <span className="truncate">View Tree</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Branch Moving Section - Only shown for branches */}
                {!isRoot && availableRoots.length > 0 && (
                    <div className="border border-[#1a4d2e]/40 rounded-xl p-3 bg-[#0f1a0f]/50">
                        <label className="text-xs font-bold text-[#f5f0e1]/50 uppercase tracking-wider mb-2 block flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">drive_file_move</span>
                            Transplant to Different Root
                        </label>
                        <select
                            value={targetRootId}
                            onChange={(e) => setTargetRootId(e.target.value)}
                            className="w-full rounded-xl border border-[#1a4d2e]/50 bg-[#0a140a] text-[#f5f0e1] p-2.5 text-sm mb-2 focus:border-[#10B981]/50 focus:outline-none focus:ring-2 focus:ring-[#10B981]/30 cursor-pointer"
                        >
                            <option value="">-- Select Root Page --</option>
                            {availableRoots.map(root => (
                                <option key={root.id} value={root.id}>
                                    {root.title} ({root.sourceText})
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={handleMoveBranch}
                            disabled={!targetRootId}
                            className="w-full bg-[#8B6914] text-[#f5f0e1] rounded-xl px-4 py-2.5 text-sm font-bold hover:bg-[#a07a16] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <span className="material-symbols-outlined mr-1 text-sm align-middle">call_split</span>
                            Move Branch
                        </button>
                    </div>
                )}

                <div className="flex gap-3">
                    <button onClick={handleSave} className="flex-1 flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-xl h-11 px-6 bg-[#10B981] text-[#0a140a] text-sm font-bold leading-normal tracking-wide transition-all hover:bg-[#0fa76f] shadow-lg shadow-[#10B981]/20">
                        <span className="material-symbols-outlined mr-2">save</span>
                        <span className="truncate">Save Changes</span>
                    </button>
                    {onAskAI && (
                        <button
                            onClick={() => onAskAI(node)}
                            className="flex items-center justify-center rounded-xl h-11 w-11 bg-[#1a4d2e]/30 text-[#10B981] hover:bg-[#1a4d2e]/50 transition-all border border-[#10B981]/20"
                            title="Ask AI Assistant"
                        >
                            <span className="material-symbols-outlined">smart_toy</span>
                        </button>
                    )}
                    <button onClick={handleDelete} title="Delete Node" className="flex items-center justify-center rounded-xl h-11 w-11 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all border border-red-500/20">
                        <span className="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GraphNodeEditor;
