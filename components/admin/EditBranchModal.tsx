import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { BranchNode, BranchCategory } from '../../types';
import { syncManager } from '../../utils/sync-manager';

interface EditBranchModalProps {
    isOpen: boolean;
    onClose: () => void;
    branch: BranchNode;
    treeId: string;
    onSaved: () => void;
}

interface FormData {
    author: string;
    workTitle: string;
    year: string;
    referenceText: string;
    userNotes: string;
    category: BranchCategory | '';
}

const CATEGORIES: { value: BranchCategory; label: string }[] = [
    { value: BranchCategory.Academic, label: 'Academic' },
    { value: BranchCategory.Philosophical, label: 'Philosophical' },
    { value: BranchCategory.Literary, label: 'Literary' },
    { value: BranchCategory.Historical, label: 'Historical' },
    { value: BranchCategory.Critique, label: 'Critique' }
];

const EditBranchModal: React.FC<EditBranchModalProps> = ({
    isOpen,
    onClose,
    branch,
    treeId,
    onSaved
}) => {
    const [formData, setFormData] = useState<FormData>({
        author: '',
        workTitle: '',
        year: '',
        referenceText: '',
        userNotes: '',
        category: ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Initialize form
    useEffect(() => {
        if (branch) {
            setFormData({
                author: branch.author || '',
                workTitle: branch.workTitle || '',
                year: branch.year || '',
                referenceText: branch.referenceText || '',
                userNotes: branch.userNotes || '',
                category: branch.category || ''
            });
        }
    }, [branch]);

    const handleChange = (field: keyof FormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);

        try {
            // Get current tree
            const tree = await syncManager.getDocument('receptionTrees', treeId);
            if (!tree) {
                throw new Error('Tree not found');
            }

            // Update branch in array
            const updatedBranches = (tree.branches || []).map((b: BranchNode) => {
                if (b.id === branch.id) {
                    return {
                        ...b,
                        author: formData.author,
                        workTitle: formData.workTitle,
                        year: formData.year,
                        referenceText: formData.referenceText,
                        userNotes: formData.userNotes,
                        category: formData.category || undefined
                    };
                }
                return b;
            });

            // Use syncManager for safe update
            syncManager.updateDocument('receptionTrees', treeId, {
                branches: updatedBranches
            }, `Update branch ${branch.id.slice(0, 8)}`);

            onSaved();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">Edit Branch</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                    {/* Author */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Author</label>
                        <input
                            type="text"
                            value={formData.author}
                            onChange={e => handleChange('author', e.target.value)}
                            className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                            placeholder="e.g., Lilienblum"
                        />
                    </div>

                    {/* Work Title */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Work Title</label>
                        <input
                            type="text"
                            value={formData.workTitle}
                            onChange={e => handleChange('workTitle', e.target.value)}
                            className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                            placeholder="e.g., חטאת נעורים"
                        />
                    </div>

                    {/* Year */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Year</label>
                        <input
                            type="text"
                            value={formData.year}
                            onChange={e => handleChange('year', e.target.value)}
                            className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                            placeholder="e.g., 1876"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
                        <select
                            value={formData.category}
                            onChange={e => handleChange('category', e.target.value)}
                            className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                        >
                            <option value="">Select category...</option>
                            {CATEGORIES.map(cat => (
                                <option key={cat.value} value={cat.value}>{cat.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Reference Text */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Reference Text</label>
                        <textarea
                            value={formData.referenceText}
                            onChange={e => handleChange('referenceText', e.target.value)}
                            rows={4}
                            className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none font-serif"
                            dir="auto"
                            placeholder="The quoted text..."
                        />
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
                        <textarea
                            value={formData.userNotes}
                            onChange={e => handleChange('userNotes', e.target.value)}
                            rows={2}
                            className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                            placeholder="Your notes..."
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Save
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditBranchModal;
