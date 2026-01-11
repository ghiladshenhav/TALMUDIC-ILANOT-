import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { syncManager, SyncState, SyncStatus } from '../utils/sync-manager';

interface SyncIndicatorProps {
    className?: string;
    showLabel?: boolean;
}

/**
 * SyncIndicator - Traffic Light for sync status
 * 
 * 🟢 Green (idle/success) - All saved
 * 🟡 Yellow (saving) - Write in progress
 * 🔴 Red (error) - Failed to save
 */
const SyncIndicator: React.FC<SyncIndicatorProps> = ({
    className = '',
    showLabel = true
}) => {
    const [state, setState] = useState<SyncState>(syncManager.getState());
    const [showTooltip, setShowTooltip] = useState(false);

    useEffect(() => {
        const unsubscribe = syncManager.subscribe(setState);
        return unsubscribe;
    }, []);

    const getConfig = (status: SyncStatus) => {
        switch (status) {
            case 'saving':
                return {
                    dotColor: 'bg-yellow-500',
                    icon: <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />,
                    label: 'Saving...',
                    textColor: 'text-yellow-500'
                };
            case 'success':
                return {
                    dotColor: 'bg-green-500',
                    icon: <CheckCircle className="w-4 h-4 text-green-500" />,
                    label: 'Saved',
                    textColor: 'text-green-500'
                };
            case 'error':
                return {
                    dotColor: 'bg-red-500',
                    icon: <AlertCircle className="w-4 h-4 text-red-500" />,
                    label: 'Error',
                    textColor: 'text-red-500'
                };
            case 'idle':
            default:
                return {
                    dotColor: 'bg-gray-400',
                    icon: <Cloud className="w-4 h-4 text-gray-400" />,
                    label: '',
                    textColor: 'text-gray-400'
                };
        }
    };

    const config = getConfig(state.status);

    const formatTime = (timestamp: number | null) => {
        if (!timestamp) return 'Never';
        const diff = Date.now() - timestamp;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        return new Date(timestamp).toLocaleTimeString();
    };

    return (
        <div className={`relative ${className}`}>
            <button
                onClick={() => state.status === 'error' && setShowTooltip(!showTooltip)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${state.status === 'error'
                        ? 'hover:bg-red-500/10 cursor-pointer'
                        : 'cursor-default'
                    }`}
                title={state.lastError || `Last synced: ${formatTime(state.lastSuccessAt)}`}
            >
                {/* Traffic Light Dot */}
                <div className="relative">
                    <div className={`w-2.5 h-2.5 rounded-full ${config.dotColor}`}>
                        {state.status === 'saving' && (
                            <div className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${config.dotColor} animate-ping opacity-75`} />
                        )}
                    </div>
                </div>

                {/* Icon */}
                {config.icon}

                {/* Label */}
                {showLabel && config.label && (
                    <span className={`text-xs font-medium ${config.textColor}`}>
                        {config.label}
                    </span>
                )}

                {/* Pending count */}
                {state.pendingCount > 1 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 text-xs">
                        {state.pendingCount}
                    </span>
                )}
            </button>

            {/* Error Tooltip */}
            {showTooltip && state.status === 'error' && (
                <div className="absolute top-full right-0 mt-2 w-64 p-3 bg-gray-900 border border-red-500/30 rounded-xl shadow-xl z-50">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-red-400">Sync Failed</p>
                            <p className="text-xs text-gray-400 mt-1">
                                {state.lastError || 'Unknown error'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                {state.lastOperation}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={() => {
                                syncManager.clearError();
                                setShowTooltip(false);
                            }}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium"
                        >
                            Dismiss
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium"
                        >
                            Reload
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SyncIndicator;
