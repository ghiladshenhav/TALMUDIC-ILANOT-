import React from 'react';
import { BranchNode } from '../../types';

interface BranchCardProps {
    node: BranchNode;
    onClick: () => void;
}

const BranchCard: React.FC<BranchCardProps> = ({ node, onClick }) => {
    // Generate unique visual identity based on author name
    const authorHash = node.author.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

    // Color palette for variety
    const colorPalettes = [
        { primary: '#10B981', secondary: '#34D399', accent: '#6EE7B7' },  // Emerald
        { primary: '#14B8A6', secondary: '#2DD4BF', accent: '#5EEAD4' },  // Teal
        { primary: '#22C55E', secondary: '#4ADE80', accent: '#86EFAC' },  // Green
        { primary: '#84CC16', secondary: '#A3E635', accent: '#BEF264' },  // Lime
        { primary: '#06B6D4', secondary: '#22D3EE', accent: '#67E8F9' },  // Cyan
    ];
    const palette = colorPalettes[authorHash % colorPalettes.length];

    // Category colors
    const getCategoryStyle = (category?: string) => {
        const cat = category?.toLowerCase() || '';
        if (cat.includes('halakh')) return { bg: '#10B981', text: '#fff' };
        if (cat.includes('commentary')) return { bg: '#8B6914', text: '#fff' };
        if (cat.includes('philosophy')) return { bg: '#7C3AED', text: '#fff' };
        if (cat.includes('kabbalah')) return { bg: '#EC4899', text: '#fff' };
        if (cat.includes('musar')) return { bg: '#F59E0B', text: '#000' };
        return { bg: '#1a4d2e', text: '#f5f0e1' };
    };
    const catStyle = getCategoryStyle(node.category);

    return (
        <div
            onClick={onClick}
            className="group relative cursor-pointer transition-all duration-500 hover:-translate-y-3"
        >
            {/* Card with glassmorphism effect */}
            <div
                className="relative rounded-3xl overflow-hidden"
                style={{
                    background: 'linear-gradient(145deg, rgba(15, 26, 15, 0.9) 0%, rgba(5, 10, 5, 0.95) 100%)',
                    backdropFilter: 'blur(20px)',
                    border: `1px solid ${palette.primary}30`,
                    boxShadow: `
                        0 4px 30px rgba(0, 0, 0, 0.3),
                        0 0 0 1px rgba(255, 255, 255, 0.05) inset,
                        0 20px 40px -20px ${palette.primary}20
                    `,
                }}
            >
                {/* Animated gradient border on hover */}
                <div
                    className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                        background: `linear-gradient(135deg, ${palette.primary}40, transparent, ${palette.secondary}40)`,
                        padding: '1px',
                    }}
                />

                {/* Top decorative bar */}
                <div
                    className="h-1.5 w-full"
                    style={{
                        background: `linear-gradient(90deg, transparent, ${palette.primary}, ${palette.secondary}, transparent)`,
                    }}
                />

                {/* Side decoration - growing branch */}
                <div className="absolute left-0 top-0 bottom-0 w-2 flex flex-col items-center">
                    <div
                        className="w-1 flex-1 group-hover:w-1.5 transition-all duration-300"
                        style={{
                            background: `linear-gradient(180deg, ${palette.primary} 0%, #8B6914 50%, transparent 100%)`,
                            borderRadius: '0 0 4px 4px',
                        }}
                    />
                </div>

                {/* Floating leaves decoration */}
                <div className="absolute top-4 left-0 transform -translate-x-1">
                    <svg viewBox="0 0 32 32" className="w-8 h-8 animate-sway" style={{ animationDuration: '4s' }}>
                        <ellipse cx="16" cy="10" rx="8" ry="6" fill={palette.primary} opacity="0.8" />
                        <ellipse cx="10" cy="16" rx="5" ry="4" fill={palette.secondary} opacity="0.6" transform="rotate(-20 10 16)" />
                        <ellipse cx="22" cy="16" rx="5" ry="4" fill={palette.accent} opacity="0.5" transform="rotate(20 22 16)" />
                    </svg>
                </div>

                {/* Content */}
                <div className="p-6 pl-7">
                    {/* Header row */}
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex-1 min-w-0 pr-3">
                            {/* Work title */}
                            <h3
                                className="font-bold text-xl leading-tight font-serif transition-colors duration-300 mb-2"
                                style={{ color: '#f5f0e1' }}
                            >
                                <span className="group-hover:text-transparent group-hover:bg-clip-text transition-all duration-300"
                                    style={{
                                        backgroundImage: `linear-gradient(90deg, ${palette.primary}, ${palette.accent})`,
                                    }}
                                >
                                    {node.workTitle || 'Untitled Work'}
                                </span>
                            </h3>

                            {/* Author & Year row */}
                            <div className="flex items-center gap-3 flex-wrap">
                                <div
                                    className="flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold"
                                    style={{
                                        background: `${palette.primary}15`,
                                        border: `1px solid ${palette.primary}40`,
                                        color: palette.primary,
                                    }}
                                >
                                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5">
                                        <circle cx="8" cy="5" r="3" fill="currentColor" />
                                        <path d="M2 14 Q2 10 8 10 Q14 10 14 14" fill="currentColor" />
                                    </svg>
                                    {node.author}
                                </div>
                                {node.year && (
                                    <span className="text-sm font-mono px-2 py-0.5 rounded bg-[#f5f0e1]/5 text-[#f5f0e1]/50">
                                        {node.year}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Category badge */}
                        {node.category && (
                            <div
                                className="px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg"
                                style={{
                                    background: catStyle.bg,
                                    color: catStyle.text,
                                }}
                            >
                                {node.category}
                            </div>
                        )}
                    </div>

                    {/* Quote section with dramatic styling */}
                    <div className="relative mt-5 mb-4">
                        {/* Decorative quote marks */}
                        <div
                            className="absolute -top-3 -left-1 text-5xl font-serif leading-none"
                            style={{ color: `${palette.primary}30` }}
                        >
                            "
                        </div>

                        {/* Quote content */}
                        <div
                            className="pl-5 relative"
                            style={{
                                borderLeft: `3px solid ${palette.primary}50`,
                            }}
                        >
                            <p className="text-base font-serif leading-relaxed text-[#f5f0e1]/75 line-clamp-4 italic">
                                {node.referenceText || 'No reference text available.'}
                            </p>
                        </div>

                        <div
                            className="absolute -bottom-2 right-0 text-5xl font-serif leading-none"
                            style={{ color: `${palette.primary}20` }}
                        >
                            "
                        </div>
                    </div>

                    {/* Footer */}
                    <div
                        className="mt-6 pt-4 flex items-center justify-between"
                        style={{ borderTop: `1px solid ${palette.primary}20` }}
                    >
                        {/* Branch ID */}
                        <div className="flex items-center gap-2 text-xs text-[#f5f0e1]/30 font-mono">
                            <svg viewBox="0 0 20 20" className="w-4 h-4">
                                <path d="M10,18 Q10,12 10,6" stroke="#8B6914" strokeWidth="2" fill="none" />
                                <ellipse cx="10" cy="4" rx="4" ry="3" fill={palette.primary} opacity="0.5" />
                            </svg>
                            <span>#{node.id.slice(-8)}</span>
                        </div>

                        {/* Action button */}
                        <div
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0"
                            style={{
                                background: `${palette.primary}20`,
                                color: palette.primary,
                            }}
                        >
                            <span>Explore</span>
                            <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">
                                arrow_forward
                            </span>
                        </div>
                    </div>
                </div>

                {/* Hover glow overlay */}
                <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-3xl"
                    style={{
                        background: `radial-gradient(circle at 50% 0%, ${palette.primary}15 0%, transparent 60%)`,
                    }}
                />
            </div>

            {/* Card shadow that grows on hover */}
            <div
                className="absolute -inset-2 rounded-3xl -z-10 opacity-0 group-hover:opacity-100 transition-all duration-500 blur-xl"
                style={{
                    background: `radial-gradient(circle, ${palette.primary}30 0%, transparent 70%)`,
                }}
            />
        </div>
    );
};

export default BranchCard;
