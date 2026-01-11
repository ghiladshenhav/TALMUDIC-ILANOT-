import React, { useState } from 'react';
import { X, CheckCircle, XCircle, Edit3 } from 'lucide-react';
import { BranchNode, GroundTruthAction } from '../../types';

export interface HarvestMetadata {
    action: GroundTruthAction;
    connectionType: ConnectionType;
    justification: string;
    confidenceLevel: 'high' | 'medium' | 'low';
}

export type ConnectionType =
    | 'direct_quote'
    | 'paraphrase'
    | 'allusion'
    | 'halakhic_discussion'
    | 'conceptual';

const CONNECTION_OPTIONS: { value: ConnectionType; label: string; desc: string }[] = [
    { value: 'direct_quote', label: 'Direct Quote', desc: 'Exact or near-exact match' },
    { value: 'paraphrase', label: 'Paraphrase', desc: 'Same idea, different wording' },
    { value: 'allusion', label: 'Allusion', desc: 'Indirect reference or echo' },
    { value: 'halakhic_discussion', label: 'Halakhic', desc: 'Legal/practical application' },
    { value: 'conceptual', label: 'Conceptual', desc: 'Related themes or ideas' }
];

interface HarvestModalProps {
    isOpen: boolean;
    onClose: () => void;
    branch: BranchNode;
    rootSource: string;
    onHarvest: (metadata: HarvestMetadata) => Promise<void>;
}

const HarvestModal: React.FC<HarvestModalProps> = ({
    isOpen,
    onClose,
    branch,
    rootSource,
    onHarvest
}) => {
    const [action, setAction] = useState<GroundTruthAction>(GroundTruthAction.APPROVE);
    const [connectionType, setConnectionType] = useState<ConnectionType>('allusion');
    const [justification, setJustification] = useState('');
    const [confidence, setConfidence] = useState<'high' | 'medium' | 'low'>('high');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async () => {
        if (!justification.trim()) return;

        setIsSaving(true);
        try {
            await onHarvest({
                action,
                connectionType,
                justification,
                confidenceLevel: confidence
            });
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-white">Harvest as Ground Truth</h2>
                        <p className="text-sm text-gray-400">{rootSource}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                    {/* Preview */}
                    <div className="p-3 bg-gray-800 rounded-lg border border-gray-700">
                        <p className="text-sm text-gray-300 font-serif line-clamp-2" dir="auto">
                            "{branch.referenceText}"
                        </p>
                        <p className="text-xs text-gray-500 mt-2">— {branch.author}</p>
                    </div>

                    {/* Action */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Action</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setAction(GroundTruthAction.APPROVE)}
                                className={`flex-1 py-2 px-3 rounded-lg border flex items-center justify-center gap-2 transition ${action === GroundTruthAction.APPROVE
                                        ? 'bg-green-500/20 border-green-500/50 text-green-400'
                                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                                    }`}
                            >
                                <CheckCircle className="w-4 h-4" />
                                Approve
                            </button>
                            <button
                                onClick={() => setAction(GroundTruthAction.REJECT)}
                                className={`flex-1 py-2 px-3 rounded-lg border flex items-center justify-center gap-2 transition ${action === GroundTruthAction.REJECT
                                        ? 'bg-red-500/20 border-red-500/50 text-red-400'
                                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                                    }`}
                            >
                                <XCircle className="w-4 h-4" />
                                Reject
                            </button>
                            <button
                                onClick={() => setAction(GroundTruthAction.CORRECT)}
                                className={`flex-1 py-2 px-3 rounded-lg border flex items-center justify-center gap-2 transition ${action === GroundTruthAction.CORRECT
                                        ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                                    }`}
                            >
                                <Edit3 className="w-4 h-4" />
                                Correct
                            </button>
                        </div>
                    </div>

                    {/* Connection Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Connection Type</label>
                        <div className="grid grid-cols-2 gap-2">
                            {CONNECTION_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setConnectionType(opt.value)}
                                    className={`p-2 rounded-lg border text-left transition ${connectionType === opt.value
                                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                                        }`}
                                >
                                    <span className="text-sm font-medium">{opt.label}</span>
                                    <p className="text-xs opacity-60">{opt.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Confidence */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Confidence</label>
                        <div className="flex gap-2">
                            {(['high', 'medium', 'low'] as const).map(level => (
                                <button
                                    key={level}
                                    onClick={() => setConfidence(level)}
                                    className={`flex-1 py-2 rounded-lg border capitalize transition ${confidence === level
                                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                                        }`}
                                >
                                    {level}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Justification */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Justification <span className="text-emerald-400">*</span>
                        </label>
                        <textarea
                            value={justification}
                            onChange={e => setJustification(e.target.value)}
                            rows={3}
                            placeholder="Explain why this reference connects to the source..."
                            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSaving || !justification.trim()}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSaving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Saving...
                            </>
                        ) : (
                            'Harvest'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HarvestModal;
