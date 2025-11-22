
import React, { useState } from 'react';
import { AIFinding, AIFindingType, AIFindingStatus } from '../../types';
import AIFindingCard from './AIFindingCard';

interface AIDiscoveryPanelProps {
    findings: AIFinding[];
    onUpdateFinding: (id: string, status: AIFindingStatus) => void;
    onClose: () => void;
}

const AIDiscoveryPanel: React.FC<AIDiscoveryPanelProps> = ({ findings, onUpdateFinding, onClose }) => {
    // Default to connection tab if there are connection findings
    const initialTab = findings.some(f => f.type === AIFindingType.Connection) ? AIFindingType.Connection : AIFindingType.RootMatch;
    const [activeTab, setActiveTab] = useState<AIFindingType>(initialTab);
    const [filterQuery, setFilterQuery] = useState('');

    const filteredFindings = findings.filter(f => 
        f.type === activeTab &&
        (f.snippet.toLowerCase().includes(filterQuery.toLowerCase()) || 
         f.source.toLowerCase().includes(filterQuery.toLowerCase()))
    );

    const getCountForTab = (type: AIFindingType) => {
        return findings.filter(f => f.type === type && f.status === AIFindingStatus.Pending).length;
    }

    const Tab: React.FC<{type: AIFindingType}> = ({ type }) => {
        const isActive = activeTab === type;
        const count = getCountForTab(type);

        return (
            <a 
                onClick={() => setActiveTab(type)}
                className={`flex flex-col items-center justify-center border-b-[3px] pb-[10px] pt-3 flex-1 cursor-pointer ${isActive ? 'border-ai-primary text-ai-primary' : 'border-b-transparent text-subtext-light dark:text-subtext-dark'}`}
            >
                <div className="flex items-center gap-2">
                    <p className="text-sm font-bold tracking-wide">{type}</p>
                    {count > 0 && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-ai-primary text-white' : 'bg-gray-300 dark:bg-gray-600 text-text-light dark:text-text-dark'}`}>{count}</span>}
                </div>
            </a>
        )
    }

    return (
        <aside className="w-[400px] flex-shrink-0 bg-background-light dark:bg-card-dark border-l border-border-light dark:border-border-dark flex flex-col h-screen">
            <div className="p-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-ai-primary/20 text-ai-primary p-2 rounded-full">
                        <span className="material-symbols-outlined">auto_awesome</span>
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-base font-bold text-text-light dark:text-text-dark">AI Discovery</h1>
                        <p className="text-sm text-subtext-light dark:text-subtext-dark">Analysis Results</p>
                    </div>
                </div>
                <button onClick={onClose} className="text-subtext-light dark:text-subtext-dark hover:text-text-light dark:hover:text-text-dark">
                     <span className="material-symbols-outlined">close</span>
                </button>
            </div>
            <div className="p-4">
                <label className="flex flex-col w-full">
                    <div className="flex w-full flex-1 items-stretch rounded-lg h-11">
                        <div className="text-subtext-light dark:text-subtext-dark flex border border-r-0 border-border-light dark:border-border-dark bg-card-light dark:bg-background-dark items-center justify-center pl-3 rounded-l-lg">
                            <span className="material-symbols-outlined text-xl">search</span>
                        </div>
                        <input 
                            className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-text-light dark:text-text-dark focus:outline-0 focus:ring-2 focus:ring-ai-primary/50 border border-l-0 border-border-light dark:border-border-dark bg-card-light dark:bg-background-dark h-full placeholder:text-subtext-light dark:placeholder:text-subtext-dark px-4 rounded-l-none text-sm font-normal" 
                            placeholder="Filter findings..."
                            value={filterQuery}
                            onChange={(e) => setFilterQuery(e.target.value)}
                        />
                    </div>
                </label>
            </div>
            <div className="flex-grow flex flex-col overflow-hidden">
                <div className="border-b border-border-light dark:border-border-dark px-4">
                    <div className="flex justify-between">
                        <Tab type={AIFindingType.Connection} />
                        <Tab type={AIFindingType.RootMatch} />
                        <Tab type={AIFindingType.ThematicFit} />
                        <Tab type={AIFindingType.NewForm} />
                    </div>
                </div>
                <div className="flex-grow overflow-y-auto p-4 space-y-3">
                    {filteredFindings.map(finding => (
                        <AIFindingCard key={finding.id} finding={finding} onUpdateStatus={onUpdateFinding} />
                    ))}
                    {filteredFindings.length === 0 && (
                        <div className="text-center py-10">
                            <span className="material-symbols-outlined text-4xl text-subtext-dark">search_off</span>
                            <p className="text-subtext-light dark:text-subtext-dark mt-2">No findings match your criteria.</p>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
};

export default AIDiscoveryPanel;
