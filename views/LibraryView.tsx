import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, Timestamp, deleteDoc, doc } from 'firebase/firestore';
import { AIFinding } from '../types';

export interface UserText {
    id: string;
    title: string;
    text: string;
    createdAt: Timestamp;
    findings?: AIFinding[];
}

interface LibraryViewProps {
    onViewChange: (view: 'dashboard' | 'split-pane' | 'analyzer' | 'assistant' | 'library') => void;
}

const LibraryView: React.FC<LibraryViewProps> = ({ onViewChange }) => {
    const [texts, setTexts] = useState<UserText[]>([]);
    const [selectedText, setSelectedText] = useState<UserText | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'user_texts'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedTexts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as UserText));
            setTexts(fetchedTexts);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching user texts:", error);
            alert("Failed to load library history. Please check your connection.");
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleDeleteText = async (e: React.MouseEvent, textId: string) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this text from your library?")) return;

        try {
            await deleteDoc(doc(db, 'user_texts', textId));
            if (selectedText?.id === textId) {
                setSelectedText(null);
            }
        } catch (error) {
            console.error("Error deleting text:", error);
            alert("Failed to delete text.");
        }
    };

    return (
        <div className="flex h-full w-full bg-background-dark text-text-dark">
            {/* List Sidebar */}
            <div className="w-1/3 border-r border-border-dark flex flex-col bg-surface-dark">
                <div className="p-6 border-b border-border-dark flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold">My Library</h1>
                        <p className="text-subtext-dark text-sm">Your uploaded texts and analysis</p>
                    </div>
                    <button
                        onClick={() => onViewChange('analyzer')}
                        className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                        title="Analyze New Text"
                    >
                        <span className="material-symbols-outlined">add</span>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {isLoading ? (
                        <div className="flex justify-center p-4">
                            <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                        </div>
                    ) : texts.length === 0 ? (
                        <div className="text-center p-8 text-subtext-dark">
                            <span className="material-symbols-outlined text-4xl mb-2">library_books</span>
                            <p>No texts saved yet.</p>
                            <button onClick={() => onViewChange('analyzer')} className="text-primary hover:underline mt-2">
                                Analyze a new text
                            </button>
                        </div>
                    ) : (
                        texts.map(text => (
                            <div
                                key={text.id}
                                onClick={() => setSelectedText(text)}
                                className={`group w-full text-left p-4 rounded-xl transition-all border cursor-pointer relative ${selectedText?.id === text.id
                                    ? 'bg-primary/10 border-primary shadow-md'
                                    : 'bg-card-dark border-border-dark hover:border-primary/50 hover:bg-white/5'}`}
                            >
                                <div className="pr-8">
                                    <h3 className={`font-bold truncate ${selectedText?.id === text.id ? 'text-primary' : 'text-white'}`}>{text.title}</h3>
                                    <p className="text-xs text-subtext-dark mt-1 flex items-center gap-2">
                                        <span className="material-symbols-outlined !text-[14px]">calendar_today</span>
                                        {text.createdAt?.toDate().toLocaleDateString()}
                                        <span className="w-1 h-1 rounded-full bg-subtext-dark/50"></span>
                                        {text.text.length} chars
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => handleDeleteText(e, text.id)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-subtext-dark hover:text-red-400 hover:bg-red-400/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    title="Delete Text"
                                >
                                    <span className="material-symbols-outlined !text-lg">delete</span>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col bg-background-dark overflow-hidden">
                {selectedText ? (
                    <div className="flex-1 flex flex-col h-full overflow-hidden">
                        <div className="p-6 border-b border-border-dark bg-surface-dark flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold">{selectedText.title}</h2>
                                <p className="text-sm text-subtext-dark">Analyzed on {selectedText.createdAt?.toDate().toLocaleString()}</p>
                            </div>
                            <button onClick={() => setSelectedText(null)} className="md:hidden text-subtext-dark">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8">
                            <div className="prose prose-invert max-w-none">
                                <div className="bg-surface-dark p-6 rounded-lg shadow-sm border border-border-dark whitespace-pre-wrap font-serif text-lg leading-relaxed">
                                    {selectedText.text}
                                </div>
                            </div>

                            {selectedText.findings && selectedText.findings.length > 0 && (
                                <div className="mt-8">
                                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-ai-primary">auto_awesome</span>
                                        AI Findings
                                    </h3>
                                    <div className="grid grid-cols-1 gap-4">
                                        {selectedText.findings.map((finding, idx) => (
                                            <div key={idx} className="p-4 rounded-lg bg-surface-dark border border-border-dark hover:border-ai-primary/50 transition-colors">
                                                <div className="flex items-start gap-3">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${finding.type === 'root-match' ? 'bg-blue-500/20 text-blue-400' :
                                                        finding.type === 'thematic-fit' ? 'bg-purple-500/20 text-purple-400' :
                                                            'bg-green-500/20 text-green-400'
                                                        }`}>
                                                        {finding.type.replace('-', ' ')}
                                                    </span>
                                                    <span className="text-xs text-subtext-dark font-mono">Confidence: {finding.confidence}%</span>
                                                </div>
                                                <p className="mt-2 font-medium text-primary">"{finding.snippet}"</p>
                                                <p className="mt-1 text-sm text-text-dark">Matches: <strong>{finding.source}</strong></p>
                                                <p className="mt-2 text-sm text-subtext-dark italic">{finding.justification}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-subtext-dark">
                        <div className="text-center">
                            <span className="material-symbols-outlined text-6xl mb-4 opacity-20">description</span>
                            <p className="text-lg">Select a text from the library to view details.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LibraryView;
