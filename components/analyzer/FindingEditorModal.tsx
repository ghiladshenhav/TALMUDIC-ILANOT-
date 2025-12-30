import React, { useState, useEffect } from 'react';
import { AIFinding, AIFindingStatus, AIFindingType } from '../../types';

interface FindingEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (finding: AIFinding) => void;
    initialSnippet: string;
    findingToEdit?: AIFinding; // Optional: If provided, we are in Edit mode
}

const FindingEditorModal: React.FC<FindingEditorModalProps> = ({ isOpen, onClose, onSave, initialSnippet, findingToEdit }) => {
    if (!isOpen) return null;

    const [snippet, setSnippet] = useState(initialSnippet);
    const [source, setSource] = useState('');
    const [title, setTitle] = useState('');
    const [justification, setJustification] = useState('');
    const [pageNumber, setPageNumber] = useState(0);

    useEffect(() => {
        if (findingToEdit) {
            setSnippet(findingToEdit.snippet || '');
            setSource(findingToEdit.source || '');
            setTitle(findingToEdit.title || '');
            setJustification(findingToEdit.justification || '');
            setPageNumber(findingToEdit.pageNumber || 0);
        } else {
            // Reset for add mode
            setSnippet(initialSnippet);
            setSource('');
            setTitle('');
            setJustification('');
            setPageNumber(0);
        }
    }, [findingToEdit, initialSnippet, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const updatedFinding: AIFinding = {
            ...(findingToEdit || {
                id: `manual-${crypto.randomUUID()}`,
                type: AIFindingType.Reference,
                status: AIFindingStatus.Pending,
                confidence: 1.0,
                isImplicit: false,
                contextBefore: '',
                contextAfter: ''
            }),
            snippet,
            source,
            title,
            justification,
            pageNumber: pageNumber || undefined,
        };

        onSave(updatedFinding);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-surface-dark border border-border-dark rounded-xl shadow-2xl w-full max-w-lg">
                <div className="p-6 border-b border-border-dark flex justify-between items-center bg-background-dark rounded-t-xl">
                    <h2 className="text-xl font-bold text-white">{findingToEdit ? 'Edit Reference' : 'Add Manual Reference'}</h2>
                    <button onClick={onClose} className="text-white/60 hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-white mb-1">Snippet (Quote)</label>
                        <textarea
                            value={snippet}
                            onChange={(e) => setSnippet(e.target.value)}
                            className="w-full bg-background-dark border border-border-dark rounded-lg p-2 text-white h-24"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white mb-1">Source Citation</label>
                        <input
                            type="text"
                            value={source}
                            onChange={(e) => setSource(e.target.value)}
                            placeholder="e.g. Bavli Berakhot 2a"
                            className="w-full bg-background-dark border border-border-dark rounded-lg p-2 text-white"
                            required
                        />
                        <p className="text-xs text-white/40 mt-1">Format: [Corpus] [Tractate] [Page][Folio] (e.g., Bavli Gittin 10b)</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white mb-1">Title (Optional)</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. The Oven of Akhnai"
                            className="w-full bg-background-dark border border-border-dark rounded-lg p-2 text-white"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white mb-1">Justification / Notes</label>
                        <textarea
                            value={justification}
                            onChange={(e) => setJustification(e.target.value)}
                            placeholder="Why is this a reference?"
                            className="w-full bg-background-dark border border-border-dark rounded-lg p-2 text-white h-20"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white mb-1">Page Number (in document)</label>
                        <input
                            type="number"
                            value={pageNumber}
                            onChange={(e) => setPageNumber(parseInt(e.target.value))}
                            className="w-full bg-background-dark border border-border-dark rounded-lg p-2 text-white"
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-white/80 hover:bg-white/10 rounded-lg">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-primary text-background-dark font-bold rounded-lg hover:bg-primary-hover">{findingToEdit ? 'Save Changes' : 'Add Reference'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default FindingEditorModal;
