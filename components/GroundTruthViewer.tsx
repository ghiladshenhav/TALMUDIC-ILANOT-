import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';

interface GroundTruthItem {
    id: string;
    phrase?: string;
    snippet?: string;
    text?: string;
    source?: string;
    correctSource?: string;
    action?: string;
    isPositive?: boolean;
    isGroundTruth?: boolean;
    justification?: string;
    explanation?: string;
    createdAt?: { seconds: number };
    timestamp?: { seconds: number };
}

interface GroundTruthViewerProps {
    isOpen: boolean;
    onClose: () => void;
}

const GroundTruthViewer: React.FC<GroundTruthViewerProps> = ({ isOpen, onClose }) => {
    const [groundTruthExamples, setGroundTruthExamples] = useState<GroundTruthItem[]>([]);
    const [trainingExamples, setTrainingExamples] = useState<GroundTruthItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'ground_truth' | 'training'>('ground_truth');

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Load ground_truth_examples
            const gtQuery = query(
                collection(db, 'ground_truth_examples'),
                orderBy('createdAt', 'desc'),
                limit(50)
            );
            const gtSnapshot = await getDocs(gtQuery);
            const gtItems: GroundTruthItem[] = gtSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as GroundTruthItem));
            setGroundTruthExamples(gtItems);

            // Load ai_training_examples
            const trainingQuery = query(
                collection(db, 'ai_training_examples'),
                orderBy('timestamp', 'desc'),
                limit(50)
            );
            const trainingSnapshot = await getDocs(trainingQuery);
            const trainingItems: GroundTruthItem[] = trainingSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as GroundTruthItem));
            setTrainingExamples(trainingItems);

        } catch (error) {
            console.error('Failed to load ground truth data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (collectionName: string, docId: string) => {
        if (!confirm('Delete this ground truth example?')) return;
        try {
            await deleteDoc(doc(db, collectionName, docId));
            await loadData(); // Refresh
        } catch (error) {
            console.error('Failed to delete:', error);
            alert('Failed to delete. Check console.');
        }
    };

    const formatDate = (timestamp?: { seconds: number }) => {
        if (!timestamp) return 'Unknown';
        return new Date(timestamp.seconds * 1000).toLocaleString();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#0f1a0f] border border-[#1a4d2e] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-[#1a4d2e] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#10B981] text-2xl">school</span>
                        <h2 className="text-xl font-bold text-[#f5f0e1]">Ground Truth Data</h2>
                    </div>
                    <button onClick={onClose} className="text-[#f5f0e1]/50 hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[#1a4d2e]">
                    <button
                        onClick={() => setActiveTab('ground_truth')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'ground_truth'
                                ? 'text-[#10B981] border-b-2 border-[#10B981] bg-[#10B981]/10'
                                : 'text-[#f5f0e1]/50 hover:text-[#f5f0e1]'
                            }`}
                    >
                        <span className="flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined text-lg">verified</span>
                            Ground Truth ({groundTruthExamples.length})
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('training')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'training'
                                ? 'text-[#10B981] border-b-2 border-[#10B981] bg-[#10B981]/10'
                                : 'text-[#f5f0e1]/50 hover:text-[#f5f0e1]'
                            }`}
                    >
                        <span className="flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined text-lg">psychology</span>
                            AI Training ({trainingExamples.length})
                        </span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-48">
                            <div className="animate-spin w-8 h-8 border-2 border-[#10B981] border-t-transparent rounded-full"></div>
                        </div>
                    ) : activeTab === 'ground_truth' ? (
                        groundTruthExamples.length === 0 ? (
                            <div className="text-center text-[#f5f0e1]/50 py-12">
                                <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
                                <p>No ground truth examples yet</p>
                                <p className="text-sm mt-1">Mark findings as Ground Truth in the analyzer to see them here</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {groundTruthExamples.map(item => (
                                    <div key={item.id} className="bg-[#0a140a] border border-[#1a4d2e]/50 rounded-lg p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${item.action === 'APPROVE' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                                        }`}>
                                                        {item.action || 'UNKNOWN'}
                                                    </span>
                                                    <span className="text-[#d4a912] text-sm font-medium">{item.correctSource || 'No source'}</span>
                                                </div>
                                                <p className="text-[#f5f0e1] font-serif text-sm leading-relaxed mb-2" dir="rtl">
                                                    {(item.phrase || item.snippet || '').substring(0, 200)}
                                                    {(item.phrase || item.snippet || '').length > 200 && '...'}
                                                </p>
                                                {item.justification && (
                                                    <p className="text-[#f5f0e1]/60 text-xs italic">
                                                        {item.justification.substring(0, 150)}
                                                        {item.justification.length > 150 && '...'}
                                                    </p>
                                                )}
                                                <p className="text-[#f5f0e1]/30 text-xs mt-2">{formatDate(item.createdAt)}</p>
                                            </div>
                                            <button
                                                onClick={() => handleDelete('ground_truth_examples', item.id)}
                                                className="text-[#f5f0e1]/30 hover:text-red-400 transition-colors p-1"
                                                title="Delete"
                                            >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        trainingExamples.length === 0 ? (
                            <div className="text-center text-[#f5f0e1]/50 py-12">
                                <span className="material-symbols-outlined text-4xl mb-2">inbox</span>
                                <p>No AI training examples yet</p>
                                <p className="text-sm mt-1">Approve or reject findings to train the AI</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {trainingExamples.map(item => (
                                    <div key={item.id} className="bg-[#0a140a] border border-[#1a4d2e]/50 rounded-lg p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${item.isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                                        }`}>
                                                        {item.isPositive ? '✓ POSITIVE' : '✗ NEGATIVE'}
                                                    </span>
                                                    <span className="text-[#d4a912] text-sm font-medium">{item.source || 'No source'}</span>
                                                    {item.isGroundTruth && (
                                                        <span className="bg-[#10B981]/20 text-[#10B981] px-2 py-0.5 rounded text-xs">GT</span>
                                                    )}
                                                </div>
                                                <p className="text-[#f5f0e1] font-serif text-sm leading-relaxed mb-2" dir="rtl">
                                                    {(item.text || '').substring(0, 200)}
                                                    {(item.text || '').length > 200 && '...'}
                                                </p>
                                                {item.explanation && (
                                                    <p className="text-[#f5f0e1]/60 text-xs italic">
                                                        {item.explanation.substring(0, 150)}
                                                        {item.explanation.length > 150 && '...'}
                                                    </p>
                                                )}
                                                <p className="text-[#f5f0e1]/30 text-xs mt-2">{formatDate(item.timestamp)}</p>
                                            </div>
                                            <button
                                                onClick={() => handleDelete('ai_training_examples', item.id)}
                                                className="text-[#f5f0e1]/30 hover:text-red-400 transition-colors p-1"
                                                title="Delete"
                                            >
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[#1a4d2e] flex items-center justify-between text-sm">
                    <p className="text-[#f5f0e1]/40">
                        These examples are used to train the AI to find better references
                    </p>
                    <button
                        onClick={loadData}
                        className="flex items-center gap-2 text-[#10B981] hover:text-[#0fa76f] transition-colors"
                    >
                        <span className="material-symbols-outlined text-lg">refresh</span>
                        Refresh
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GroundTruthViewer;
