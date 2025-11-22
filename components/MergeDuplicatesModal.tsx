import React, { useState, useMemo } from 'react';
import { ReceptionTree, RootNode } from '../types';

interface MergeDuplicatesModalProps {
    receptionForest: ReceptionTree[];
    onClose: () => void;
    onMerge: (targetTreeId: string, sourceTreeIds: string[]) => Promise<void>;
}

interface DuplicateGroup {
    citation: string;
    trees: ReceptionTree[];
}

const MergeDuplicatesModal: React.FC<MergeDuplicatesModalProps> = ({ receptionForest, onClose, onMerge }) => {
    const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
    const [isMerging, setIsMerging] = useState(false);

    // 1. Identify Duplicates
    const duplicateGroups = useMemo(() => {
        const groups: { [citation: string]: ReceptionTree[] } = {};

        // robust normalization helper
        const normalizeCitation = (text: string) => {
            let normalized = text.toLowerCase()
                .replace(/\b(bavli|yerushalmi|masechet|tractate|talmud|b\.|y\.|t\.)\b/g, '')
                .replace(/[.,\-:;()]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            // Common Tractate Spellings Map
            const spellings: { [key: string]: string } = {
                'brachot': 'berakhot', 'berachot': 'berakhot', 'brakhot': 'berakhot',
                'shabbat': 'shabbos', 'shabbes': 'shabbos',
                'eruvin': 'erubin',
                'pesachim': 'pesahim',
                'shekalim': 'shkalim',
                'yoma': 'yuma',
                'sukkah': 'succah', 'sukka': 'succah',
                'beitzah': 'betsah', 'betzah': 'betsah',
                'rosh hashanah': 'rosh hashana',
                'taanit': 'taanith', 'taanis': 'taanith',
                'megillah': 'megila', 'megilla': 'megila',
                'moed katan': 'moed qatan',
                'chagigah': 'hagigah', 'hagiga': 'hagigah',
                'yevamot': 'yebamot',
                'ketubot': 'ketuboth',
                'nedarim': 'nedarim',
                'nazir': 'nazir',
                'sotah': 'sota',
                'gittin': 'gitin',
                'kiddushin': 'qidushin',
                'bava kamma': 'bava qama', 'bava kama': 'bava qama',
                'bava metzia': 'bava metsia',
                'bava batra': 'bava batra',
                'sanhedrin': 'sanhedrin',
                'makkot': 'makot',
                'shevuot': 'shevuoth',
                'avodah zarah': 'avoda zara',
                'horayot': 'horayoth',
                'zevachim': 'zevahim',
                'menachot': 'menahot',
                'chullin': 'hulin',
                'bechorot': 'bekhorot',
                'arachin': 'arakhin',
                'temurah': 'temura',
                'keritot': 'kerithot',
                'meilah': 'meila',
                'tamid': 'tamid',
                'middot': 'midot',
                'kinnim': 'kinim',
                'niddah': 'nida',
                'kelim': 'kelim',
                'oholot': 'oholot',
                'negaim': 'negaim',
                'parah': 'para',
                'tahorot': 'tohorot',
                'mikvaot': 'miqvaot',
                'machshirin': 'makhshirin',
                'zavim': 'zavim',
                'tevul yom': 'tevul yom',
                'yadayim': 'yadayim',
                'uktzin': 'uqtsin'
            };

            // Replace known spellings
            Object.keys(spellings).forEach(key => {
                if (normalized.includes(key)) {
                    normalized = normalized.replace(key, spellings[key]);
                }
            });

            return normalized;
        };

        receptionForest.forEach(tree => {
            const root = tree.nodes.find(n => n.type === 'root') as RootNode;
            if (!root) return;

            const normalized = normalizeCitation(root.sourceText);

            if (!groups[normalized]) {
                groups[normalized] = [];
            }
            groups[normalized].push(tree);
        });

        // Filter for groups with > 1 tree
        return Object.entries(groups)
            .filter(([_, trees]) => trees.length > 1)
            .map(([citation, trees]) => ({ citation, trees }));
    }, [receptionForest]);

    const handleMergeClick = async () => {
        if (!selectedTargetId) return;

        // Find the group that contains the selected target
        const group = duplicateGroups.find(g => g.trees.some(t => t.id === selectedTargetId));
        if (!group) return;

        const sourceTreeIds = group.trees
            .filter(t => t.id !== selectedTargetId)
            .map(t => t.id);

        if (confirm(`Are you sure you want to merge ${sourceTreeIds.length} duplicate(s) into the selected page? This action cannot be undone.`)) {
            setIsMerging(true);
            try {
                await onMerge(selectedTargetId, sourceTreeIds);
                onClose();
            } catch (error) {
                console.error("Merge failed:", error);
                alert("Failed to merge trees. See console for details.");
            } finally {
                setIsMerging(false);
            }
        }
    };

    if (duplicateGroups.length === 0) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-8 max-w-md w-full text-center">
                    <h2 className="text-2xl font-serif font-bold mb-4">No Duplicates Found</h2>
                    <p className="text-gray-600 mb-6">Great job! Your library appears to be free of duplicate pages.</p>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
                <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-serif font-bold text-gray-900">Consolidate Page References</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Select the "Primary" page. The <strong>content</strong> of the other pages will be converted into <strong>new Topics (Branches)</strong> on the Primary page.
                            <br />
                            <span className="text-green-600 font-medium">No data will be lost.</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {duplicateGroups.map((group, idx) => (
                        <div key={idx} className="bg-white rounded-lg border border-gray-200 p-4 mb-6 shadow-sm">
                            <h3 className="font-bold text-lg mb-3 text-primary capitalize">{group.citation} <span className="text-sm font-normal text-gray-500">({group.trees.length} references)</span></h3>

                            <div className="space-y-3">
                                {group.trees.map(tree => {
                                    const root = tree.nodes.find(n => n.type === 'root') as RootNode;
                                    const branchCount = tree.nodes.length - 1;
                                    const isSelected = selectedTargetId === tree.id;

                                    return (
                                        <div
                                            key={tree.id}
                                            onClick={() => setSelectedTargetId(tree.id)}
                                            className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${isSelected
                                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                                : 'border-gray-200 hover:border-primary/50'
                                                }`}
                                        >
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center mr-4 ${isSelected ? 'border-primary bg-primary' : 'border-gray-300'
                                                }`}>
                                                {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                                            </div>

                                            <div className="flex-1">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-medium text-gray-900">{root?.title || 'Untitled'}</span>
                                                    <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                                                        {branchCount} branches
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1 font-mono">
                                                    ID: {tree.id} • Created: {new Date().toLocaleDateString()} {/* Date is a placeholder if not in tree data */}
                                                </div>
                                                {root?.hebrewTranslation && (
                                                    <div className="mt-1 text-xs text-green-600 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[10px]">check_circle</span>
                                                        Has Steinsaltz Data
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 border-t border-gray-200 bg-white rounded-b-lg flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleMergeClick}
                        disabled={!selectedTargetId || isMerging}
                        className={`px-6 py-2 bg-primary text-white rounded-lg shadow-sm transition-all flex items-center gap-2 ${!selectedTargetId || isMerging ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-hover hover:shadow-md'
                            }`}
                    >
                        {isMerging ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Consolidating...
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-sm">merge_type</span>
                                Consolidate Selected
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MergeDuplicatesModal;
