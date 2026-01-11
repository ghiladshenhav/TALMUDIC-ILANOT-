import React from 'react';
import SyncIndicator from './SyncIndicator';

interface SidebarProps {
    currentView: 'dashboard' | 'split-pane' | 'analyzer' | 'assistant' | 'library' | 'connections';
    onViewChange: (view: 'dashboard' | 'split-pane' | 'analyzer' | 'assistant' | 'library' | 'connections') => void;
    onOpenSettings: () => void;
    onOpenHelp: () => void;
    orientation?: 'vertical' | 'horizontal';
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, onOpenSettings, onOpenHelp, orientation = 'vertical' }) => {
    const navItems = [
        { id: 'dashboard', label: 'Forest', icon: 'park' },
        { id: 'split-pane', label: 'Root & Branches', icon: 'account_tree' },
        { id: 'library', label: 'My Library', icon: 'bookmarks' },
        { id: 'connections', label: 'Connections', icon: 'hub' },
        { id: 'assistant', label: 'AI Sage', icon: 'psychology' },
    ];

    const isHorizontal = orientation === 'horizontal';

    const containerClasses = isHorizontal
        ? "w-full bg-[#0a140a] border-b border-[#1a4d2e]/40 flex flex-row items-center h-16 shrink-0 transition-colors duration-200 px-4 justify-between"
        : "w-64 bg-gradient-to-b from-[#0a140a] to-[#0f1a0f] border-r border-[#1a4d2e]/40 flex flex-col h-full shrink-0 overflow-y-auto transition-colors duration-200";

    const navContainerClasses = isHorizontal
        ? "flex flex-row items-center gap-2 ml-8"
        : "px-4 space-y-2 mt-4";

    const buttonClasses = (isActive: boolean) => isHorizontal
        ? `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap ${isActive
            ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30'
            : 'text-[#f5f0e1]/50 hover:text-[#f5f0e1] hover:bg-[#1a4d2e]/30 border border-transparent'
        }`
        : `w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
            ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30 shadow-lg shadow-[#10B981]/10'
            : 'text-[#f5f0e1]/50 hover:text-[#f5f0e1] hover:bg-[#1a4d2e]/30 border border-transparent'
        }`;

    const bottomContainerClasses = isHorizontal
        ? "flex items-center gap-2"
        : "p-4 border-t border-[#1a4d2e]/40 space-y-2 mt-auto";

    return (
        <aside className={containerClasses}>
            <div className={`flex items-center gap-3 ${isHorizontal ? '' : 'p-6 sticky top-0 bg-[#0a140a] z-10'}`}>
                {/* Logo with tree icon */}
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1a4d2e]/60 to-[#0a140a] border border-[#10B981]/30 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 32 32" className="w-6 h-6">
                        <path d="M14,28 Q12,20 14,12 L16,4 L18,12 Q20,20 18,28" fill="#8B6914" opacity="0.8" />
                        <ellipse cx="16" cy="6" rx="8" ry="5" fill="#10B981" opacity="0.6" />
                        <ellipse cx="16" cy="5" rx="5" ry="3" fill="#10B981" opacity="0.4" />
                    </svg>
                </div>
                {!isHorizontal && (
                    <div>
                        <h1 className="text-[#f5f0e1] font-bold text-sm leading-tight font-serif">Talmudic Ilanot</h1>
                        <p className="text-[#10B981]/60 text-xs">אילנות תלמודיים</p>
                    </div>
                )}
                {isHorizontal && (
                    <h1 className="text-[#f5f0e1] font-bold text-lg hidden md:block font-serif">Talmudic Ilanot</h1>
                )}
            </div>

            <nav className={navContainerClasses}>
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onViewChange(item.id as any)}
                        className={buttonClasses(currentView === item.id)}
                    >
                        <span className="material-symbols-outlined">{item.icon}</span>
                        {item.label}
                    </button>
                ))}
            </nav>

            <div className={bottomContainerClasses}>
                {/* Sync Status Indicator */}
                <SyncIndicator showLabel={!isHorizontal} size={isHorizontal ? 'sm' : 'md'} />

                <button
                    onClick={onOpenSettings}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-[#f5f0e1]/40 hover:text-[#f5f0e1] hover:bg-[#1a4d2e]/30 transition-colors ${isHorizontal ? '' : 'w-full'}`}
                    title="Settings"
                >
                    <span className="material-symbols-outlined">settings</span>
                    {!isHorizontal && "Settings"}
                </button>
                <button
                    onClick={onOpenHelp}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-[#f5f0e1]/40 hover:text-[#f5f0e1] hover:bg-[#1a4d2e]/30 transition-colors ${isHorizontal ? '' : 'w-full'}`}
                    title="Help"
                >
                    <span className="material-symbols-outlined">help</span>
                    {!isHorizontal && "Help"}
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
