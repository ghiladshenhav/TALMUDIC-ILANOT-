import React from 'react';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const shortcuts = [
        { key: '⌘ + K', action: 'Search' },
        { key: 'Esc', action: 'Close Modals' },
        { key: 'Enter', action: 'Confirm / Save' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface-dark border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined">help</span>
                        Help & Documentation
                    </h2>
                    <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
                    {/* Quick Start Guide */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">rocket_launch</span>
                            Quick Start Guide
                        </h3>
                        <div className="space-y-4 text-text-muted text-sm leading-relaxed">
                            <p>
                                <strong className="text-white">Talmudic Reception Trees</strong> allows you to map the evolution of Talmudic ideas across time.
                            </p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>
                                    <strong className="text-white">Add a Passage:</strong> Start by creating a "Root Node" – a Talmudic source (Mishnah, Gemara, etc.).
                                </li>
                                <li>
                                    <strong className="text-white">Trace Reception:</strong> Add "Branch Nodes" to document how later authors (Rishonim, Acharonim, Modern) interpreted that source.
                                </li>
                                <li>
                                    <strong className="text-white">Visualize:</strong> Use the "Parallel Columns" view to see the tree structure and connections.
                                </li>
                                <li>
                                    <strong className="text-white">Analyze with AI:</strong> Use the built-in AI Assistant to find connections and generate insights automatically.
                                </li>
                            </ul>
                        </div>
                    </section>

                    <div className="h-px bg-white/5"></div>

                    {/* Keyboard Shortcuts */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">keyboard</span>
                            Keyboard Shortcuts
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {shortcuts.map((shortcut, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-background-dark/50 rounded-lg border border-white/5">
                                    <span className="text-text-muted text-sm">{shortcut.action}</span>
                                    <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-white border border-white/10 shadow-sm">
                                        {shortcut.key}
                                    </kbd>
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="h-px bg-white/5"></div>

                    {/* About */}
                    <section>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">info</span>
                            About
                        </h3>
                        <p className="text-text-muted text-sm leading-relaxed">
                            This project is a Digital Humanities initiative designed to visualize the complex web of Talmudic reception history.
                            It combines traditional philological methods with modern graph visualization and AI analysis.
                        </p>
                        <p className="text-text-muted text-xs mt-4">
                            Version 1.0.0-beta • Built with React, TypeScript, and Gemini AI.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default HelpModal;
