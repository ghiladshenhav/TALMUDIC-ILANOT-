import React from 'react';
import Sidebar from './Sidebar';
import AIDiscoveryPanel from './AIDiscoveryPanel';
import { AIFinding } from '../types';

interface LayoutProps {
    children: React.ReactNode;
    sidebar: React.ReactNode;
    showRightPanel?: boolean;
    aiFindings?: AIFinding[];
    onApproveFinding?: (finding: AIFinding) => void;
    onDismissFinding?: (findingId: string) => void;
    orientation?: 'vertical' | 'horizontal';
}

const Layout: React.FC<LayoutProps> = ({
    children,
    sidebar,
    showRightPanel = false,
    aiFindings = [],
    onApproveFinding = () => { },
    onDismissFinding = () => { },
    orientation = 'vertical'
}) => {
    // Clone sidebar element to pass the orientation prop if it's a valid React element
    const sidebarWithProps = React.isValidElement(sidebar)
        ? React.cloneElement(sidebar as React.ReactElement<any>, { orientation })
        : sidebar;

    return (
        <div className={`flex h-screen w-full overflow-hidden font-sans transition-colors duration-200 ${orientation === 'horizontal' ? 'flex-col' : 'flex-row'}`}
            style={{ background: 'linear-gradient(135deg, #0a1f0a 0%, #0f1a0f 50%, #0a140a 100%)' }}>
            {sidebarWithProps}

            <main className="flex-1 flex flex-col min-w-0 relative overflow-hidden h-full text-[#f5f0e1]">
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
