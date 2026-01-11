import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { importGroundTruthFromJson, exportGroundTruthToJson, BatchImportProgress, BatchImportResult } from '../utils/ground-truth-helpers';

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
    userId?: string; // Required for import/export
}

const GroundTruthViewer: React.FC<GroundTruthViewerProps> = ({ isOpen, onClose, userId }) => {
    const [groundTruthExamples, setGroundTruthExamples] = useState<GroundTruthItem[]>([]);
    const [trainingExamples, setTrainingExamples] = useState<GroundTruthItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'ground_truth' | 'training'>('ground_truth');

    // Import state
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState<BatchImportProgress | null>(null);
    const [importResult, setImportResult] = useState<BatchImportResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    // ========================================
    // IMPORT/EXPORT HANDLERS
    // ========================================

    const handleImportClick = () => {
        if (!userId) {
            alert('User ID is required for import. Please log in.');
            return;
        }
        fileInputRef.current?.click();
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userId) return;

        try {
            setIsImporting(true);
            setImportResult(null);

            // Read file content
            const text = await file.text();
            const jsonData = JSON.parse(text);

            // Validate it's an array
            if (!Array.isArray(jsonData)) {
                throw new Error('JSON must be an array of ground truth items');
            }

            console.log(`[GT Import] Importing ${jsonData.length} items from file`);

            // Run import with progress
            const result = await importGroundTruthFromJson(
                jsonData,
                userId,
                (progress) => setImportProgress(progress)
            );

            setImportResult(result);

            // Refresh data after import
            if (result.success) {
                await loadData();
            }
        } catch (error: any) {
            console.error('[GT Import] Failed:', error);
            setImportResult({
                success: false,
                firestoreCount: 0,
                pineconeSuccess: 0,
                pineconeErrors: 0,
                skippedItems: 0,
                errors: [error.message || 'Unknown error'],
                totalTime: 0
            });
        } finally {
            setIsImporting(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleExport = async () => {
        if (!userId) {
            alert('User ID is required for export. Please log in.');
            return;
        }

        try {
            const data = await exportGroundTruthToJson(userId);
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `ground-truth-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('[GT Export] Failed:', error);
            alert('Export failed. Check console for details.');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#0f1a0f] border border-[#1a4d2e] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* Hidden file input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".json"
                    className="hidden"
                />

                {/* Header */}
                <div className="p-4 border-b border-[#1a4d2e] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[#10B981] text-2xl">school</span>
                        <h2 className="text-xl font-bold text-[#f5f0e1]">Ground Truth Data</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Import Button */}
                        <button
                            onClick={handleImportClick}
                            disabled={isImporting || !userId}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={userId ? 'Import Ground Truth from JSON file' : 'Login required'}
                        >
                            <span className="material-symbols-outlined text-lg">upload</span>
                            Import JSON
                        </button>
                        {/* Export Button */}
                        <button
                            onClick={handleExport}
                            disabled={!userId}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a4d2e] hover:bg-[#10B981]/30 text-[#f5f0e1] text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={userId ? 'Export all Ground Truth to JSON' : 'Login required'}
                        >
                            <span className="material-symbols-outlined text-lg">download</span>
                            Export
                        </button>
                        {/* Close Button */}
                        <button onClick={onClose} className="text-[#f5f0e1]/50 hover:text-white transition-colors ml-2">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                {/* Import Progress Banner */}
                {isImporting && importProgress && (
                    <div className="p-4 bg-blue-900/30 border-b border-blue-500/30">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="animate-spin w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                            <span className="text-blue-300 font-medium">{importProgress.message}</span>
                        </div>
                        <div className="w-full bg-blue-900/50 rounded-full h-2">
                            <div
                                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                            ></div>
                        </div>
                        <p className="text-blue-400/70 text-xs mt-1">
                            Stage: {importProgress.stage} • {importProgress.current}/{importProgress.total}
                        </p>
                    </div>
                )}

                {/* Import Result Banner */}
                {importResult && !isImporting && (
                    <div className={`p-4 border-b ${importResult.success ? 'bg-green-900/30 border-green-500/30' : 'bg-red-900/30 border-red-500/30'}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className={`material-symbols-outlined ${importResult.success ? 'text-green-400' : 'text-red-400'}`}>
                                    {importResult.success ? 'check_circle' : 'error'}
                                </span>
                                <span className={importResult.success ? 'text-green-300' : 'text-red-300'}>
                                    {importResult.success
                                        ? `Imported ${importResult.firestoreCount} items (${importResult.pineconeSuccess} indexed, ${importResult.totalTime}ms)`
                                        : `Import failed: ${importResult.errors[0]}`
                                    }
                                </span>
                            </div>
                            <button
                                onClick={() => setImportResult(null)}
                                className="text-[#f5f0e1]/50 hover:text-white"
                            >
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                        {importResult.skippedItems > 0 && (
                            <p className="text-amber-400/70 text-xs mt-1">
                                ⚠️ {importResult.skippedItems} items skipped due to validation errors
                            </p>
                        )}
                    </div>
                )}

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
