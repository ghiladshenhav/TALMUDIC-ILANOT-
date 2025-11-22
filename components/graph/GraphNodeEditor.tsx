
import React, { useState, useEffect } from 'react';
import { GraphNode, RootNode, BranchNode, NodeStyle, BranchCategory } from '../../types';

interface GraphNodeEditorProps {
    node: GraphNode;
    onSave: (node: GraphNode) => void;
    onDelete: (nodeId: string) => void;
    onClose: () => void;
    onAddBranch: (parentNode: GraphNode) => void;
    onViewChain?: (rootNode: RootNode) => void;
}

interface EditorFieldProps {
    label: string; name: string; value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
    isTextarea?: boolean; placeholder?: string; dir?: 'rtl' | 'ltr'; isSerif?: boolean;
    isSelect?: boolean; children?: React.ReactNode; type?: string;
}

const EditorField: React.FC<EditorFieldProps> = ({ label, name, value, onChange, isTextarea = false, placeholder, dir = 'ltr', isSerif = false, isSelect = false, children, type = "text" }) => {
    const commonClasses = `form-input flex w-full min-w-0 flex-1 overflow-hidden rounded-lg text-text-dark focus:outline-0 focus:ring-2 focus:ring-primary/50 border border-border-dark bg-surface-dark placeholder:text-subtext-dark p-3 text-base font-normal leading-relaxed focus:border-primary ${isSerif ? 'font-serif' : 'font-display'}`;

    return (
        <div className="w-full">
            <label className="flex flex-col w-full">
                <p className="text-text-dark text-sm font-bold leading-normal pb-2">{label}</p>
                {isSelect ? (
                    <div className="relative">
                        <select id={name} className={`${commonClasses} appearance-none pr-10`} name={name} value={value} onChange={onChange}>
                            <option value="">-- Select --</option>
                            {children}
                        </select>
                        <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtext-dark">unfold_more</span>
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

const GraphNodeEditor: React.FC<GraphNodeEditorProps> = ({ node, onSave, onDelete, onClose, onAddBranch, onViewChain }) => {
    const [title, setTitle] = useState(node.type === 'root' ? (node as RootNode).title : '');
    const [sourceText, setSourceText] = useState(node.type === 'root' ? (node as RootNode).sourceText : '');
    const [hebrewText, setHebrewText] = useState(node.type === 'root' ? (node as RootNode).hebrewText : '');
    const [hebrewTranslation, setHebrewTranslation] = useState(node.type === 'root' ? (node as RootNode).hebrewTranslation || '' : '');
    const [translation, setTranslation] = useState(node.type === 'root' ? (node as RootNode).translation : '');
    const [userNotesKeywords, setUserNotesKeywords] = useState(node.type === 'root' ? (node as RootNode).userNotesKeywords : '');

    const [author, setAuthor] = useState(node.type === 'branch' ? (node as BranchNode).author : '');
    const [workTitle, setWorkTitle] = useState(node.type === 'branch' ? (node as BranchNode).workTitle : '');
    const [publicationDetails, setPublicationDetails] = useState(node.type === 'branch' ? (node as BranchNode).publicationDetails : '');
    const [referenceText, setReferenceText] = useState(node.type === 'branch' ? (node as BranchNode).referenceText : '');
    const [userNotes, setUserNotes] = useState(node.type === 'branch' ? (node as BranchNode).userNotes : '');
    const [category, setCategory] = useState(node.type === 'branch' ? (node as BranchNode).category : undefined);

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
            setReferenceText(branch.referenceText);
            setUserNotes(branch.userNotes);
            setCategory(branch.category);
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
            const branchNode: BranchNode = { ...node, author, workTitle, publicationDetails, referenceText, userNotes, category };
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

    const isRoot = node.type === 'root';

    return (
        <div className="h-full flex flex-col bg-surface-paper border-l border-border-dark overflow-hidden">
            <div className="p-6 border-b border-border-dark bg-[#FDFBF7] sticky top-0 z-10">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-border-dark">
                    <div>
                        <h2 className="text-xl font-bold text-primary font-serif">Edit Node</h2>
                        <div className="text-[10px] text-gray-400 font-mono">ID: {node.id}</div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="text-text-muted hover:text-text-dark">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
                        <EditorField label="Author" name="author" value={author} onChange={(e) => setAuthor(e.target.value)} />
                        <EditorField label="Work Title" name="workTitle" value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} />
                        <EditorField label="Publication Details" name="publicationDetails" value={publicationDetails} onChange={(e) => setPublicationDetails(e.target.value)} />
                        <EditorField label="Reference Text" name="referenceText" value={referenceText} onChange={(e) => setReferenceText(e.target.value)} isTextarea />
                        <EditorField label="User Notes" name="userNotes" value={userNotes} onChange={(e) => setUserNotes(e.target.value)} isTextarea />
                        <EditorField label="Category" name="category" value={category || ''} onChange={(e) => setCategory(e.target.value as BranchCategory)} isSelect>
                            {Object.values(BranchCategory).map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </EditorField>
                    </>
                )}
            </div>

            <div className="p-4 border-t border-border-dark bg-[#112211]/5 flex flex-col gap-3">
                {isRoot && (
                    <div className="flex gap-3">
                        <button
                            onClick={handleAddBranch}
                            className="flex-1 flex cursor-pointer items-center justify-center overflow-hidden rounded-lg h-11 px-4 bg-primary/20 text-primary text-sm font-bold leading-normal tracking-wide transition-colors hover:bg-primary/30"
                        >
                            <span className="material-symbols-outlined mr-2">add_circle</span>
                            <span className="truncate">Add Branch</span>
                        </button>
                        {onViewChain && (
                            <button
                                onClick={() => onViewChain(node as RootNode)}
                                className="flex-1 flex cursor-pointer items-center justify-center overflow-hidden rounded-lg h-11 px-4 bg-secondary/20 text-primary text-sm font-bold leading-normal tracking-wide transition-colors hover:bg-secondary/30"
                                title="View this chain separately"
                            >
                                <span className="material-symbols-outlined mr-2">account_tree</span>
                                <span className="truncate">View Chain</span>
                            </button>
                        )}
                    </div>
                )}
                <div className="flex gap-3">
                    <button onClick={handleSave} className="flex-1 flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-11 px-6 bg-primary text-white text-sm font-bold leading-normal tracking-wide transition-opacity hover:opacity-90">
                        <span className="material-symbols-outlined mr-2">save</span>
                        <span className="truncate">Save Changes</span>
                    </button>
                    <button onClick={handleDelete} title="Delete Node" className="flex items-center justify-center rounded-lg h-11 w-11 bg-red-900/10 text-red-600 hover:bg-red-900/20 transition-colors">
                        <span className="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GraphNodeEditor;
