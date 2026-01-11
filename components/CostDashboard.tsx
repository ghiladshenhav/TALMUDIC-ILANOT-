import React, { useState, useEffect } from 'react';
import { getCostSummary, getRecentLogs, clearUsageLogs, CostSummary, ApiUsageLog, TimeRange, ApiUsageType } from '../utils/cost-tracker';

interface CostDashboardProps {
    isEmbedded?: boolean; // If true, renders without the modal wrapper
}

const TYPE_LABELS: Record<ApiUsageType, { label: string; icon: string; color: string }> = {
    scanner: { label: 'Scanner (Pass 1)', icon: 'search', color: 'bg-blue-500' },
    librarian: { label: 'Librarian (Pass 2)', icon: 'library_books', color: 'bg-purple-500' },
    standard: { label: 'Standard Analysis', icon: 'psychology', color: 'bg-indigo-500' },
    embedding: { label: 'Embeddings', icon: 'data_array', color: 'bg-cyan-500' },
    rag_search: { label: 'RAG Search', icon: 'manage_search', color: 'bg-teal-500' },
    gt_skipped: { label: 'GT Pre-filter Skip', icon: 'verified', color: 'bg-green-500' },
    cache_hit: { label: 'Cache Hit', icon: 'cached', color: 'bg-emerald-500' }
};

const CostDashboard: React.FC<CostDashboardProps> = ({ isEmbedded = false }) => {
    const [summary, setSummary] = useState<CostSummary | null>(null);
    const [recentLogs, setRecentLogs] = useState<ApiUsageLog[]>([]);
    const [timeRange, setTimeRange] = useState<TimeRange>('today');
    const [isLoading, setIsLoading] = useState(true);
    const [showLogs, setShowLogs] = useState(false);

    useEffect(() => {
        loadData();
    }, [timeRange]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [summaryData, logs] = await Promise.all([
                getCostSummary(timeRange),
                getRecentLogs(20)
            ]);
            setSummary(summaryData);
            setRecentLogs(logs);
        } catch (error) {
            console.error('[CostDashboard] Failed to load data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearLogs = async () => {
        if (!confirm('Clear all usage logs? This cannot be undone.')) return;
        await clearUsageLogs();
        await loadData();
    };

    const formatCost = (cost: number) => {
        if (cost < 0.01) return `$${cost.toFixed(4)}`;
        return `$${cost.toFixed(2)}`;
    };

    const formatTokens = (tokens: number) => {
        if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
        if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
        return tokens.toString();
    };

    // Calculate breakdown for visualization
    const getBreakdown = (): { type: ApiUsageType; calls: number; cost: number; tokens: number; percentage: number }[] => {
        if (!summary) return [];

        const entries = Object.entries(summary.byType);
        return entries
            .filter((entry): entry is [string, { calls: number; cost: number; tokens: number }] => {
                const [, data] = entry;
                return (data as { calls: number }).calls > 0;
            })
            .sort((a, b) => (b[1] as { cost: number }).cost - (a[1] as { cost: number }).cost)
            .map(([type, data]) => ({
                type: type as ApiUsageType,
                calls: (data as { calls: number }).calls,
                cost: (data as { cost: number }).cost,
                tokens: (data as { tokens: number }).tokens,
                percentage: summary.totalCost > 0 ? ((data as { cost: number }).cost / summary.totalCost) * 100 : 0
            }));
    };

    const content = (
        <div className="space-y-6">
            {/* Time Range Selector */}
            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    {(['today', 'week', 'month', 'all'] as TimeRange[]).map((range) => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${timeRange === range
                                ? 'bg-[#10B981] text-white'
                                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            {range === 'all' ? 'All Time' : range.charAt(0).toUpperCase() + range.slice(1)}
                        </button>
                    ))}
                </div>
                <button
                    onClick={loadData}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    title="Refresh"
                >
                    <span className="material-symbols-outlined text-lg">refresh</span>
                </button>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-48">
                    <div className="animate-spin w-8 h-8 border-2 border-[#10B981] border-t-transparent rounded-full"></div>
                </div>
            ) : summary ? (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-3 gap-4">
                        {/* Cost Card */}
                        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/20">
                            <div className="flex items-center gap-2 text-amber-400 mb-2">
                                <span className="material-symbols-outlined">payments</span>
                                <span className="text-sm font-medium">Estimated Cost</span>
                            </div>
                            <p className="text-2xl font-bold text-white">{formatCost(summary.totalCost)}</p>
                            <p className="text-xs text-white/50 mt-1">{summary.totalCalls} API calls</p>
                        </div>

                        {/* Tokens Card */}
                        <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/20">
                            <div className="flex items-center gap-2 text-blue-400 mb-2">
                                <span className="material-symbols-outlined">token</span>
                                <span className="text-sm font-medium">Total Tokens</span>
                            </div>
                            <p className="text-2xl font-bold text-white">{formatTokens(summary.totalInputTokens + summary.totalOutputTokens)}</p>
                            <p className="text-xs text-white/50 mt-1">
                                {formatTokens(summary.totalInputTokens)} in / {formatTokens(summary.totalOutputTokens)} out
                            </p>
                        </div>

                        {/* Autonomy Card */}
                        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/10 border border-emerald-500/20">
                            <div className="flex items-center gap-2 text-emerald-400 mb-2">
                                <span className="material-symbols-outlined">smart_toy</span>
                                <span className="text-sm font-medium">System Autonomy</span>
                            </div>
                            <p className="text-2xl font-bold text-white">{summary.autonomyScore.toFixed(1)}%</p>
                            <p className="text-xs text-white/50 mt-1">
                                {summary.cachedCalls} calls skipped ({summary.totalCalls - summary.cachedCalls} used LLM)
                            </p>
                        </div>
                    </div>

                    {/* Cost Breakdown */}
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                        <h3 className="text-sm font-medium text-white/80 mb-4">Cost by Operation Type</h3>
                        <div className="space-y-3">
                            {getBreakdown().length === 0 ? (
                                <p className="text-white/40 text-sm text-center py-4">No usage data yet</p>
                            ) : (
                                getBreakdown().map(({ type, calls, cost, tokens, percentage }) => {
                                    const typeInfo = TYPE_LABELS[type];
                                    return (
                                        <div key={type} className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg ${typeInfo.color} flex items-center justify-center`}>
                                                <span className="material-symbols-outlined text-white text-sm">{typeInfo.icon}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm text-white">{typeInfo.label}</span>
                                                    <span className="text-sm text-white/60">{formatCost(cost)}</span>
                                                </div>
                                                <div className="w-full bg-white/10 rounded-full h-1.5">
                                                    <div
                                                        className={`h-1.5 rounded-full ${typeInfo.color}`}
                                                        style={{ width: `${Math.max(percentage, 2)}%` }}
                                                    ></div>
                                                </div>
                                                <p className="text-xs text-white/40 mt-0.5">
                                                    {calls} calls • {formatTokens(tokens)} tokens
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Recent Logs Toggle */}
                    <div className="border-t border-white/10 pt-4">
                        <button
                            onClick={() => setShowLogs(!showLogs)}
                            className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors"
                        >
                            <span className="material-symbols-outlined text-lg">
                                {showLogs ? 'expand_less' : 'expand_more'}
                            </span>
                            {showLogs ? 'Hide' : 'Show'} Recent Logs ({recentLogs.length})
                        </button>

                        {showLogs && (
                            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                                {recentLogs.map((log) => {
                                    const typeInfo = TYPE_LABELS[log.type];
                                    return (
                                        <div key={log.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 text-sm">
                                            <span className={`w-6 h-6 rounded ${typeInfo.color} flex items-center justify-center`}>
                                                <span className="material-symbols-outlined text-white text-xs">{typeInfo.icon}</span>
                                            </span>
                                            <span className="text-white/80 flex-1">{typeInfo.label}</span>
                                            <span className="text-white/40">
                                                {log.isCached ? 'cached' : `${formatTokens(log.inputTokens + log.outputTokens)} tokens`}
                                            </span>
                                            <span className="text-white/60">{formatCost(log.estimatedCost)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Clear Logs Button */}
                    <div className="flex justify-end">
                        <button
                            onClick={handleClearLogs}
                            className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                        >
                            Clear all logs
                        </button>
                    </div>
                </>
            ) : (
                <div className="text-center text-white/40 py-8">
                    <span className="material-symbols-outlined text-4xl mb-2">monitoring</span>
                    <p>No usage data available</p>
                </div>
            )}
        </div>
    );

    if (isEmbedded) {
        return content;
    }

    // Standalone modal version (not used in SettingsModal integration)
    return (
        <div className="p-6 bg-[#0f1a0f] border border-[#1a4d2e] rounded-2xl max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-[#10B981] text-2xl">monitoring</span>
                <h2 className="text-xl font-bold text-white">API Cost Dashboard</h2>
            </div>
            {content}
        </div>
    );
};

export default CostDashboard;
