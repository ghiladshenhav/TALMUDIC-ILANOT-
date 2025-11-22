
import React from 'react';
import { RootNode } from '../../types';

interface RootTextPanelProps {
    node: RootNode;
    onEdit: () => void;
    onRegenerate?: () => void;
}

const RootTextPanel: React.FC<RootTextPanelProps> = ({ node, onEdit, onRegenerate }) => {
    return (
        <div className="h-full flex flex-col bg-[#FDFBF7] border-r border-border-dark overflow-hidden">
            <div className="p-6 border-b border-border-dark bg-[#FDFBF7] sticky top-0 z-10 flex justify-between items-start shadow-sm">
                <div className="flex-1 pr-4">
                    <div className="mb-4">
                        <h2 className="text-xl font-bold text-primary font-serif">{node.title}</h2>
                        <div className="text-sm text-text-muted">{node.sourceText}</div>
                        <div className="text-[10px] text-gray-300 font-mono mt-1">ID: {node.id}</div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onRegenerate}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm hover:shadow-md"
                        title="Regenerate Data from AI"
                    >
                        <span className="material-symbols-outlined text-sm">refresh</span>
                        <span className="text-sm font-bold">Sync</span>
                    </button>
                    <button
                        onClick={onEdit}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors shadow-sm hover:shadow-md"
                        title="Edit Text"
                    >
                        <span className="material-symbols-outlined text-sm">edit</span>
                        <span className="text-sm font-bold">Edit</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-10">
                <div className="max-w-none">
                    <div className="text-2xl font-serif leading-loose text-right text-gray-900" dir="rtl" style={{ fontFamily: '"David Libre", "Frank Ruhl Libre", serif' }}>
                        {node.hebrewText}
                    </div>
                </div>

                {node.hebrewTranslation && (
                    <>
                        <hr className="border-gray-300 border-dashed my-6" />
                        <div className="max-w-none">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 text-right">Steinsaltz (Hebrew)</h3>
                            <div className="text-xl font-serif leading-relaxed text-right text-gray-800" dir="rtl" style={{ fontFamily: '"David Libre", "Frank Ruhl Libre", serif' }}>
                                {node.hebrewTranslation}
                            </div>
                        </div>
                    </>
                )}

                <hr className="border-gray-300" />

                <div className="max-w-none">
                    <div className="text-xl font-serif leading-relaxed text-gray-900">
                        {node.translation}
                    </div>
                </div>

                {node.userNotesKeywords && (
                    <div className="mt-8 p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">Notes & Keywords</h3>
                        <div
                            className="text-base text-gray-700 leading-relaxed [&>p]:mb-2 [&>ul]:list-disc [&>ul]:pl-5"
                            dangerouslySetInnerHTML={{ __html: node.userNotesKeywords }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default RootTextPanel;
