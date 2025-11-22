import React from 'react';
import { BranchNode } from '../../types';

interface BranchCardProps {
    node: BranchNode;
    onClick: () => void;
}

const BranchCard: React.FC<BranchCardProps> = ({ node, onClick }) => {
    return (
        <div
            onClick={onClick}
            className="group relative flex flex-col bg-surface-dark border border-border-dark rounded-lg p-5 hover:border-primary transition-all duration-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5"
        >
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h3 className="font-bold text-text-dark text-lg group-hover:text-primary transition-colors">
                        {node.workTitle}
                    </h3>
                    <p className="text-sm text-subtext-dark font-medium">
                        {node.author}
                        {node.year && <span className="ml-2 opacity-75">• {node.year}</span>}
                    </p>
                    <div className="mt-1 text-[10px] text-gray-400 font-mono">
                        ID: {node.id}
                    </div>
                </div>
                {node.category && (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-background-dark text-subtext-dark border border-border-dark">
                        {node.category}
                    </span>
                )}
            </div>

            <div className="relative">
                <p className="text-text-muted text-sm font-serif leading-relaxed whitespace-pre-wrap">
                    {node.referenceText}
                </p>
            </div>

            <div className="mt-4 flex items-center text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                <span>View Details</span>
                <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
            </div>
        </div>
    );
};

export default BranchCard;
