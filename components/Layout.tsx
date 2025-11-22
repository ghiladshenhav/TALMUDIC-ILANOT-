import React from 'react';
import Sidebar from './Sidebar';
import AIDiscoveryPanel from './AIDiscoveryPanel';
import { AIFinding } from '../types';

interface LayoutProps {
    children: React.ReactNode;
    currentView: 'dashboard' | 'split-pane' | 'analyzer' | 'assistant' | 'library';
    onViewChange: (view: 'dashboard' | 'split-pane' | 'analyzer' | 'assistant' | 'library') => void;
    showRightPanel?: boolean;
    aiFindings?: AIFinding[];
    onApproveFinding?: (finding: AIFinding) => void;
    onDismissFinding?: (findingId: string) => void;
}

const Layout: React.FC<LayoutProps> = ({
    children,
    currentView,
    onViewChange,
    showRightPanel = false,
    aiFindings = [],
    onApproveFinding = () => { },
    onDismissFinding = () => { }
}) => {
    return (
        <div className="flex h-screen w-full bg-background-dark text-text-dark overflow-hidden font-sans">
            <Sidebar currentView={currentView} onViewChange={onViewChange} />

            <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
                {children}
            </main>

            {showRightPanel && (
                <AIDiscoveryPanel
                    findings={aiFindings}
                    onApproveFinding={onApproveFinding}
                    onDismissFinding={onDismissFinding}
                />
            )}
        </div>
    );
};

export default Layout;
