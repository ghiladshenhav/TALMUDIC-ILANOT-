import React from 'react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDarkMode: boolean;
    toggleTheme: () => void;
    currentFont: string;
    onChangeFont: (font: string) => void;
    onOpenSyncDebug: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, isDarkMode, toggleTheme, currentFont, onChangeFont, onOpenSyncDebug }) => {
    if (!isOpen) return null;

    const fonts = [
        { id: 'font-sans', label: 'System Sans (Default)' },
        { id: 'font-serif', label: 'Frank Ruhl Libre (Serif)' },
        { id: 'font-mono', label: 'Monospace' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface-dark border border-white/10 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined">settings</span>
                        Settings
                    </h2>
                    <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 space-y-8">
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
                                <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`}
                                />
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

                    {/* Data Management Placeholder */}
                    <section className="opacity-50 pointer-events-none">
                        <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Data Management (Coming Soon)</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button className="p-3 rounded-lg border border-white/5 bg-background-dark/30 text-text-muted text-sm font-medium flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined">download</span>
                                Export Data
                            </button>
                            <button className="p-3 rounded-lg border border-white/5 bg-background-dark/30 text-text-muted text-sm font-medium flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined">upload</span>
                                Import Data
                            </button>
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
