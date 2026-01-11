import React, { useState } from 'react';
import CostDashboard from './CostDashboard';
import DataReviewDashboard from './admin/DataReviewDashboard';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    toggleTheme: () => void;
    currentFont: string;
    onChangeFont: (font: string) => void;
    onOpenSyncDebug: () => void;
    userId?: string; // For Data Review Dashboard
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, isDarkMode, toggleTheme, currentFont, onChangeFont, onOpenSyncDebug, userId }) => {
    const [activeTab, setActiveTab] = useState<'settings' | 'stats' | 'janitor'>('settings');

    if (!isOpen) return null;

    const fonts = [
        { id: 'font-sans', label: 'System Sans (Default)' },
        { id: 'font-serif', label: 'Frank Ruhl Libre (Serif)' },
        { id: 'font-mono', label: 'Monospace' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`bg-surface-dark border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ${activeTab === 'janitor' ? 'w-full max-w-5xl max-h-[90vh]' : 'w-full max-w-xl'}`}>
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined">settings</span>
                        Settings
                    </h2>
                    <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-white/5">
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'settings'
                            ? 'text-primary border-b-2 border-primary bg-primary/5'
                            : 'text-text-muted hover:text-white'
                            }`}
                    >
                        <span className="material-symbols-outlined text-lg">tune</span>
                        Settings
                    </button>
                    <button
                        onClick={() => setActiveTab('stats')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'stats'
                            ? 'text-primary border-b-2 border-primary bg-primary/5'
                            : 'text-text-muted hover:text-white'
                            }`}
                    >
                        <span className="material-symbols-outlined text-lg">monitoring</span>
                        Cost Stats
                    </button>
                    <button
                        onClick={() => setActiveTab('janitor')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'janitor'
                            ? 'text-primary border-b-2 border-primary bg-primary/5'
                            : 'text-text-muted hover:text-white'
                            }`}
                    >
                        <span className="material-symbols-outlined text-lg">mop</span>
                        Data Janitor
                    </button>
                </div>

                {/* Tab Content */}
                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {activeTab === 'settings' ? (
                        <div className="space-y-8">
                            {/* Appearance Section */}
                            <section>
                                <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Appearance</h3>
                                <div className="flex items-center justify-between p-4 bg-background-dark/50 rounded-lg border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-purple-500/20 text-purple-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                            <span className="material-symbols-outlined">{isDarkMode ? 'dark_mode' : 'light_mode'}</span>
                                        </div>
                                        <div>
                                            <p className="font-medium text-white">Theme Mode</p>
                                            <p className="text-xs text-text-muted">{isDarkMode ? 'Dark Mode Active' : 'Light Mode Active'}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={toggleTheme}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background-dark ${isDarkMode ? 'bg-primary' : 'bg-gray-600'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </section>

                            {/* Typography Section */}
                            <section>
                                <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Typography</h3>
                                <div className="space-y-2">
                                    {fonts.map((font) => (
                                        <button
                                            key={font.id}
                                            onClick={() => onChangeFont(font.id)}
                                            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${currentFont === font.id
                                                ? 'bg-primary/10 border-primary/50 text-primary'
                                                : 'bg-background-dark/50 border-white/5 text-text-muted hover:border-white/20 hover:text-white'
                                                }`}
                                        >
                                            <span className={font.id === 'font-serif' ? 'font-serif' : font.id === 'font-mono' ? 'font-mono' : 'font-sans'}>
                                                {font.label}
                                            </span>
                                            {currentFont === font.id && (
                                                <span className="material-symbols-outlined text-lg">check</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            {/* Advanced Section */}
                            <section>
                                <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Advanced</h3>
                                <button
                                    onClick={() => {
                                        onClose();
                                        onOpenSyncDebug();
                                    }}
                                    className="w-full p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 text-sm font-medium flex items-center justify-between hover:bg-red-500/10 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined">build</span>
                                        Sync Debugger & Recovery
                                    </div>
                                    <span className="text-xs opacity-70">Fix missing branches</span>
                                </button>
                            </section>
                        </div>
                    ) : activeTab === 'stats' ? (
                        <CostDashboard isEmbedded />
                    ) : (
                        <DataReviewDashboard
                            isOpen={true}
                            onClose={() => setActiveTab('settings')}
                            userId={userId || 'default-user'}
                            isEmbedded={true}
                        />
                    )}
                </div>

                <div className="p-6 border-t border-white/5 bg-background-dark/30 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
