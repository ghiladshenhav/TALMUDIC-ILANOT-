import React, { useState } from 'react';
import { LinkCategory, GraphEdge } from '../../types';

interface LinkCategoryModalProps {
    sourceNodeId: string;
    targetNodeId: string;
    onClose: () => void;
    onSave: (edge: GraphEdge) => void;
}

const LinkCategoryModal: React.FC<LinkCategoryModalProps> = ({ sourceNodeId, targetNodeId, onClose, onSave }) => {
    const [category, setCategory] = useState<LinkCategory>(LinkCategory.ThematicParallel);

    const handleSave = () => {
        const newEdge: GraphEdge = {
            id: `edge-${crypto.randomUUID()}`,
            source: sourceNodeId,
            target: targetNodeId,
            category: category,
            label: category, // Use the category as the display label
        };
        onSave(newEdge);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" aria-modal="true" role="dialog">
            <div className="relative z-10 mx-auto w-full max-w-md">
                <div className="flex flex-col rounded-xl border border-primary/20 bg-[#162916] text-white shadow-2xl shadow-primary/10">
                    <div className="flex flex-col gap-2 p-6 sm:p-8 border-b border-primary/20">
                        <h1 className="text-2xl font-bold tracking-tight text-white">Categorize Connection</h1>
                        <p className="text-white/70">Select the type of relationship between these two nodes.</p>
                    </div>
                    <div className="flex flex-col gap-6 px-6 sm:px-8 py-8">
                        <div className="flex w-full flex-col">
                            <label className="pb-2 text-base font-medium text-white" htmlFor="link-category">
                                Link Category
                            </label>
                            <div className="relative">
                                <select
                                    id="link-category"
                                    className="form-select appearance-none w-full resize-none overflow-hidden rounded-lg border border-primary/30 bg-[#193319] p-3.5 text-base font-normal text-white placeholder:text-white/50 focus:border-primary focus:outline-0 focus:ring-2 focus:ring-primary/40 h-14"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value as LinkCategory)}
                                >
                                    {Object.values(LinkCategory).map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                                <span className="material-symbols-outlined pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-white/70">
                                    unfold_more
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 p-6 sm:p-8 bg-[#112211]/50 rounded-b-xl">
                        <button
                            onClick={onClose}
                            className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-11 px-4 bg-primary/20 text-white text-sm font-bold leading-normal tracking-wide transition-colors hover:bg-primary/30">
                            <span className="truncate">Cancel</span>
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-11 px-4 bg-primary text-[#112211] text-sm font-bold leading-normal tracking-wide transition-opacity hover:opacity-90">
                            <span className="truncate">Save Connection</span>
                        </button>
                    </div>
                </div>
            </div>
            <div className="absolute inset-0 z-0" onClick={onClose}></div>
        </div>
    );
};

export default LinkCategoryModal;