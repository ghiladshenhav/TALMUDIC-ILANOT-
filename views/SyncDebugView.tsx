
import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { UserText, AIFindingStatus, ReceptionTree, AIFinding } from '../types';

interface SyncDebugViewProps {
    onApproveFinding: (finding: AIFinding) => Promise<void>;
    onClose: () => void;
}

interface MissingItem {
    textTitle: string;
    textId: string;
    finding: AIFinding;
    reason: string;
}

const SyncDebugView: React.FC<SyncDebugViewProps> = ({ onApproveFinding, onClose }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
    const [syncLog, setSyncLog] = useState<string[]>([]);
    const [scannedCount, setScannedCount] = useState(0);

    const scanForMissingBranches = async () => {
        setIsLoading(true);
        setMissingItems([]);
        setSyncLog(['Starting scan...']);

        try {
            // 1. Fetch all reception trees to build a lookup map
            setSyncLog(prev => [...prev, 'Fetching existing trees...']);
            const treesSnapshot = await getDocs(collection(db, 'receptionTrees'));
            const allTrees = treesSnapshot.docs.map(doc => doc.data() as ReceptionTree);
            setSyncLog(prev => [...prev, `Loaded forest: ${allTrees.length} trees`]);

            // Create a quick lookup set of (normalized source + normalized snippet prefix)
            const existingBranchSignatures = new Set<string>();

            allTrees.forEach(tree => {
                tree.branches.forEach(branch => {
                    const normSource = normalizeText(tree.root.sourceText);
                    const normSnippet = normalizeText(branch.referenceText).substring(0, 50);
                    existingBranchSignatures.add(`${normSource}|${normSnippet}`);
                });
            });

            // 2. Fetch all user texts from library
            setSyncLog(prev => [...prev, 'Fetching library texts...']);
            const textsSnapshot = await getDocs(collection(db, 'user_texts'));
            const texts = textsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserText));
            setScannedCount(texts.length);

            const missing: MissingItem[] = [];

            // 3. Iterate through texts and findings
            for (const text of texts) {
                if (!text.findings || text.findings.length === 0) continue;

                // DEBUG: Inspect Talmudbauer text specifically
                if (text.title.toLowerCase().includes("talmudbauer")) {
                    setSyncLog(prev => [...prev, `Found target: "${text.title}"`]);
                    setSyncLog(prev => [...prev, `Total findings: ${text.findings.length}`]);

                    // Log first 3 findings to see their status
                    text.findings.slice(0, 3).forEach((f, i) => {
                        setSyncLog(prev => [...prev, `Item ${i}: Status=${f.status}, GT=${f.isGroundTruth}`]);
                    });
                }

                const addedFindings = text.findings.filter(f =>
                    f.status === AIFindingStatus.Added ||
                    f.status === AIFindingStatus.AddedAsNewRoot ||
                    f.status === AIFindingStatus.AddedToExistingRoot ||
                    f.isGroundTruth === true ||
                    (f.isGroundTruth as any) === "true"
                );

                if (text.title.toLowerCase().includes("talmudbauer")) {
                    setSyncLog(prev => [...prev, `Candidates (Added/GT): ${addedFindings.length}`]);
                }

                for (const finding of addedFindings) {
                    // Check if this finding exists in the graph
                    const normSource = normalizeText(finding.source);
                    const normSnippet = normalizeText(finding.snippet).substring(0, 50);
                    const signature = `${normSource}|${normSnippet}`;

                    if (!existingBranchSignatures.has(signature)) {
                        // Double check: maybe source text is slightly different?
                        const matchingTree = allTrees.find(t => normalizeText(t.root.sourceText) === normSource);

                        let reason = "Branch missing entirely";
                        if (!matchingTree) {
                            reason = "Root tree not found for: " + finding.source;
                        } else {
                            const branchExists = matchingTree.branches.some(b =>
                                normalizeText(b.referenceText).includes(normalizeText(finding.snippet).substring(0, 30))
                            );
                            if (branchExists) continue;
                        }

                        // Prepare the finding for sync (force status if needed)
                        const syncReadyFinding = {
                            ...finding,
                            status: (finding.status === AIFindingStatus.Pending || finding.status === undefined)
                                ? AIFindingStatus.Added
                                : finding.status
                        };

                        missing.push({
                            textTitle: text.title,
                            textId: text.id,
                            finding: syncReadyFinding,
                            reason
                        });
                    }
                }
            }

            setMissingItems(missing);
            setSyncLog(prev => [...prev, `Scan complete. Found ${missing.length} missing items.`]);

        } catch (error) {
            console.error("Scan failed:", error);
            setSyncLog(prev => [...prev, `Error: ${error}`]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSyncAll = async () => {
        if (missingItems.length === 0) return;

        setIsLoading(true);
        setSyncLog(prev => [...prev, 'Starting batch sync...']);

        // Process sequentially
        let successCount = 0;
        const newMissing = [...missingItems];

        for (const item of missingItems) {
            try {
                setSyncLog(prev => [...prev, `Syncing: ${item.finding.source} (${item.textTitle})...`]);

                // IMPORTANT: Ensure metadata is correct
                // If the finding lacks author/workTitle, try to pull from the text
                const enrichedFinding = {
                    ...item.finding,
                    author: item.finding.author || 'Unknown Author',
                    workTitle: item.finding.workTitle || item.textTitle
                };

                await onApproveFinding(enrichedFinding);

                successCount++;
                // Remove from list
                const index = newMissing.findIndex(i => i.finding.id === item.finding.id);
                if (index !== -1) newMissing.splice(index, 1);

            } catch (err) {
                console.error(`Failed to sync item ${item.finding.id}:`, err);
                setSyncLog(prev => [...prev, `❌ Failed: ${item.finding.source} - ${err}`]);
            }
        }

        setMissingItems(newMissing);
        setSyncLog(prev => [...prev, `Batch sync complete. Successfully restored ${successCount} items.`]);
        setIsLoading(false);

        if (newMissing.length === 0) {
            alert("All missing items have been restored!");
        }
    };

    const normalizeText = (text: string) => {
        return (text || '').toLowerCase()
            .replace(/^(bavli|yerushalmi|masechet|tractate|b\.|y\.|בבלי|ירושלמי|מסכת)\s*/gi, '')
            .replace(/[.,\-:;]/g, '')
            .replace(/['"״׳]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-8">
            <div className="bg-card-dark border border-border-dark rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-border-dark flex justify-between items-center bg-gray-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-yellow-400">sync_problem</span>
                            Sync Debugger & Recovery
                        </h2>
                        <p className="text-sm text-subtext-dark mt-1">
                            Scan your library for "Verified" references that are missing from the Dashboard graph.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    {/* Left: Controls & Log */}
                    <div className="w-1/3 border-r border-border-dark p-4 flex flex-col gap-4 bg-background-dark/50">
                        <div className="bg-emerald-900/20 border border-emerald-900/50 p-4 rounded-lg">
                            <h3 className="font-bold text-emerald-400 mb-2">Instructions</h3>
                            <ol className="list-decimal list-inside text-xs text-subtext-dark space-y-2">
                                <li>Click <strong>Scan Library</strong> to find discrepancies.</li>
                                <li>Review the list of missing items.</li>
                                <li>Click <strong>Sync All Missing</strong> to restore them.</li>
                            </ol>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={scanForMissingBranches}
                                disabled={isLoading}
                                className="flex-1 btn-secondary flex justify-center items-center gap-2"
                            >
                                <span className="material-symbols-outlined">search</span>
                                Scan Library
                            </button>
                        </div>

                        <div className="flex-1 bg-black/40 rounded border border-border-dark p-2 overflow-y-auto font-mono text-xs">
                            {syncLog.map((log, i) => (
                                <div key={i} className="mb-1 text-gray-400 border-b border-gray-800/50 pb-1">
                                    {log}
                                </div>
                            ))}
                            {syncLog.length === 0 && <span className="text-gray-600">Ready to scan...</span>}
                        </div>
                    </div>

                    {/* Right: Results List */}
                    <div className="flex-1 p-0 flex flex-col bg-background-dark">
                        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gray-900/30">
                            <h3 className="font-bold text-white">
                                Missing Items ({missingItems.length})
                            </h3>
                            {missingItems.length > 0 && (
                                <button
                                    onClick={handleSyncAll}
                                    disabled={isLoading}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg shadow-emerald-900/20"
                                >
                                    <span className="material-symbols-outlined text-lg">cloud_sync</span>
                                    Sync All Missing
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {missingItems.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
                                    <span className="material-symbols-outlined text-6xl mb-4">check_circle</span>
                                    <p>No missing items found</p>
                                </div>
                            ) : (
                                missingItems.map((item, idx) => (
                                    <div key={`${item.finding.id}-${idx}`} className="bg-card-dark border border-border-dark p-3 rounded-lg hover:border-primary/50 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                                                {item.finding.source}
                                            </span>
                                            <span className="text-[10px] text-gray-500 uppercase tracking-wider border border-gray-700 px-1 rounded">
                                                {item.reason}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-300 line-clamp-2 mb-2 italic">
                                            "{item.finding.snippet}"
                                        </p>
                                        <div className="flex justify-between items-center text-xs text-subtext-dark border-t border-white/5 pt-2 mt-2">
                                            <span>From: <span className="text-gray-400">{item.textTitle}</span></span>
                                            <span>Confidence: {item.finding.confidence}%</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SyncDebugView;
