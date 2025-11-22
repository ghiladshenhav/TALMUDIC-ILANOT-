import React from 'react';

interface SidebarProps {
    currentView: 'dashboard' | 'split-pane' | 'analyzer' | 'assistant' | 'library';
    onViewChange: (view: 'dashboard' | 'split-pane' | 'analyzer' | 'assistant' | 'library') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
        { id: 'split-pane', label: 'Parallel Columns', icon: 'view_column' },
        { id: 'library', label: 'My Library', icon: 'bookmarks' },
        { id: 'assistant', label: 'AI Assistant', icon: 'auto_awesome' },
    ];

    return (
        <aside className="w-64 bg-background-dark border-r border-border-dark flex flex-col h-full shrink-0 overflow-y-auto">
            <div className="p-6 flex items-center gap-3 sticky top-0 bg-background-dark z-10">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-xl">local_library</span>
                </div>
                <div>
                    <h1 className="text-text-dark font-bold text-sm leading-tight">Talmudic Traces</h1>
                    <p className="text-subtext-dark text-xs">Digital Humanities Project</p>
                </div>
            </div>

            <nav className="px-4 space-y-2 mt-4">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onViewChange(item.id as any)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${currentView === item.id
                            ? 'bg-primary text-white shadow-lg shadow-primary/20'
                            : 'text-subtext-dark hover:text-text-dark hover:bg-secondary'
                            }`}
                    >
                        <span className="material-symbols-outlined">{item.icon}</span>
                        {item.label}
                    </button>
                ))}
            </nav>



            <div className="p-4 border-t border-border-dark space-y-2">
                <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-text-muted hover:text-white hover:bg-white/5 transition-colors">
                    <span className="material-symbols-outlined">settings</span>
                    Settings
                </button>
                <button className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-text-muted hover:text-white hover:bg-white/5 transition-colors">
                    <span className="material-symbols-outlined">help</span>
                    Help
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
