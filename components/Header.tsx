
import React from 'react';

interface HeaderProps {
    darkMode: boolean;
    onToggleDarkMode: () => void;
    currentView: 'dashboard' | 'graph' | 'analyzer' | 'assistant';
    onViewChange: (view: 'dashboard' | 'graph' | 'analyzer' | 'assistant') => void;
}

const Header: React.FC<HeaderProps> = ({ darkMode, onToggleDarkMode, currentView, onViewChange }) => {
    
    const navLinkClasses = "text-black/80 dark:text-white/80 text-sm font-medium leading-normal hover:text-primary dark:hover:text-primary transition-colors cursor-pointer";
    const activeLinkClasses = "text-primary dark:text-primary";

    return (
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-black/10 dark:border-border-dark px-4 sm:px-6 lg:px-10 py-3 shrink-0">
            <div className="flex items-center gap-4 text-black dark:text-white">
                <div className="text-primary size-6">
                    <span className="material-symbols-outlined !text-3xl">hub</span>
                </div>
                <h2 className="text-black dark:text-white text-lg font-bold leading-tight tracking-[-0.015em]">Talmudic Reception History</h2>
            </div>
            <div className="hidden md:flex flex-1 justify-end gap-8">
                <div className="flex items-center gap-9">
                    <a onClick={() => onViewChange('dashboard')} className={`${navLinkClasses} ${currentView === 'dashboard' ? activeLinkClasses : ''}`}>Dashboard</a>
                    <a onClick={() => onViewChange('graph')} className={`${navLinkClasses} ${currentView === 'graph' ? activeLinkClasses : ''}`}>Graph View</a>
                    <a onClick={() => onViewChange('analyzer')} className={`${navLinkClasses} ${currentView === 'analyzer' ? activeLinkClasses : ''}`}>Text Analyzer</a>
                    <a onClick={() => onViewChange('assistant')} className={`${navLinkClasses} ${currentView === 'assistant' ? activeLinkClasses : ''} flex items-center gap-1`}>
                        <span className="material-symbols-outlined !text-base text-ai-primary">auto_awesome</span>
                        AI Assistant
                    </a>
                </div>
                <button 
                    onClick={onToggleDarkMode}
                    className="flex max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-xl h-10 bg-black/5 dark:bg-white/5 text-black dark:text-white gap-2 text-sm font-bold leading-normal tracking-[0.015em] min-w-0 px-2.5"
                    aria-label="Toggle dark mode"
                >
                    <span className="material-symbols-outlined text-black/60 dark:text-white/60">
                        {darkMode ? 'light_mode' : 'dark_mode'}
                    </span>
                </button>
                <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10" style={{ backgroundImage: `url("https://lh3.googleusercontent.com/aida-public/AB6AXuD19LsI9K7AynLfaTu9vtM2EGkVBzJ6SApv6cEW7CI5Bnj0-eID_N4_e4HhFMIV2MbQVQdQIz3SgmtmXiJuEsWkpR6E4HZH32PkItbN02BqXmj0LzHKjIVwiccsXc14w9dhCcKIS1yd8ZyJLMfLbxHIIdIrSn2zHJhmwujj0VgTPHO0AOhpcDIyG1wN4HRf3fIsFI-2x65eshA3dCO_7CPqp2PSGdZZX8NHl37w2pQKmr2cA2X8qFzQ4E0tsckBpeRQxQmW1R0PoNo")` }}></div>
            </div>
            <button className="md:hidden p-2 rounded-md text-black/80 dark:text-white/80">
                <span className="material-symbols-outlined">menu</span>
            </button>
        </header>
    );
};

export default Header;
