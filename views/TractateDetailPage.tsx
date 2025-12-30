import React, { useState, useMemo, useRef } from 'react';
import { ReceptionTree, TractateProfile } from '../types';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

interface TractateDetailPageProps {
    tractate: string;
    trees: ReceptionTree[];
    profile?: TractateProfile;
    onBack: () => void;
    onNavigate: (treeId: string) => void;
    onSaveProfile?: (profile: TractateProfile) => void;
}

// Hebrew names for tractates
const tractateHebrewNames: Record<string, string> = {
    'berakhot': 'ברכות',
    'shabbat': 'שבת',
    'eruvin': 'עירובין',
    'pesachim': 'פסחים',
    'yoma': 'יומא',
    'sukkah': 'סוכה',
    'beitzah': 'ביצה',
    'rosh hashanah': 'ראש השנה',
    'taanit': 'תענית',
    'megillah': 'מגילה',
    'moed katan': 'מועד קטן',
    'chagigah': 'חגיגה',
    'yevamot': 'יבמות',
    'ketubot': 'כתובות',
    'nedarim': 'נדרים',
    'nazir': 'נזיר',
    'sotah': 'סוטה',
    'gittin': 'גיטין',
    'kiddushin': 'קידושין',
    'bava kamma': 'בבא קמא',
    'bava metzia': 'בבא מציעא',
    'bava batra': 'בבא בתרא',
    'sanhedrin': 'סנהדרין',
    'makkot': 'מכות',
    'shevuot': 'שבועות',
    'avodah zarah': 'עבודה זרה',
    'horayot': 'הוריות',
    'zevachim': 'זבחים',
    'menachot': 'מנחות',
    'chullin': 'חולין',
    'bekhorot': 'בכורות',
    'arakhin': 'ערכין',
    'temurah': 'תמורה',
    'keritot': 'כריתות',
    'meilah': 'מעילה',
    'niddah': 'נידה',
};

// Seder (order) mappings
const tractateOrders: Record<string, { english: string; hebrew: string }> = {
    'berakhot': { english: 'Zeraim', hebrew: 'זרעים' },
    'shabbat': { english: 'Moed', hebrew: 'מועד' },
    'eruvin': { english: 'Moed', hebrew: 'מועד' },
    'pesachim': { english: 'Moed', hebrew: 'מועד' },
    'yoma': { english: 'Moed', hebrew: 'מועד' },
    'sukkah': { english: 'Moed', hebrew: 'מועד' },
    'beitzah': { english: 'Moed', hebrew: 'מועד' },
    'rosh hashanah': { english: 'Moed', hebrew: 'מועד' },
    'taanit': { english: 'Moed', hebrew: 'מועד' },
    'megillah': { english: 'Moed', hebrew: 'מועד' },
    'moed katan': { english: 'Moed', hebrew: 'מועד' },
    'chagigah': { english: 'Moed', hebrew: 'מועד' },
    'yevamot': { english: 'Nashim', hebrew: 'נשים' },
    'ketubot': { english: 'Nashim', hebrew: 'נשים' },
    'nedarim': { english: 'Nashim', hebrew: 'נשים' },
    'nazir': { english: 'Nashim', hebrew: 'נשים' },
    'sotah': { english: 'Nashim', hebrew: 'נשים' },
    'gittin': { english: 'Nashim', hebrew: 'נשים' },
    'kiddushin': { english: 'Nashim', hebrew: 'נשים' },
    'bava kamma': { english: 'Nezikin', hebrew: 'נזיקין' },
    'bava metzia': { english: 'Nezikin', hebrew: 'נזיקין' },
    'bava batra': { english: 'Nezikin', hebrew: 'נזיקין' },
    'sanhedrin': { english: 'Nezikin', hebrew: 'נזיקין' },
    'makkot': { english: 'Nezikin', hebrew: 'נזיקין' },
    'shevuot': { english: 'Nezikin', hebrew: 'נזיקין' },
    'avodah zarah': { english: 'Nezikin', hebrew: 'נזיקין' },
    'horayot': { english: 'Nezikin', hebrew: 'נזיקין' },
    'zevachim': { english: 'Kodashim', hebrew: 'קדשים' },
    'menachot': { english: 'Kodashim', hebrew: 'קדשים' },
    'chullin': { english: 'Kodashim', hebrew: 'קדשים' },
    'bekhorot': { english: 'Kodashim', hebrew: 'קדשים' },
    'arakhin': { english: 'Kodashim', hebrew: 'קדשים' },
    'temurah': { english: 'Kodashim', hebrew: 'קדשים' },
    'keritot': { english: 'Kodashim', hebrew: 'קדשים' },
    'meilah': { english: 'Kodashim', hebrew: 'קדשים' },
    'niddah': { english: 'Tohorot', hebrew: 'טהרות' },
};

const TractateDetailPage: React.FC<TractateDetailPageProps> = ({
    tractate,
    trees,
    profile,
    onBack,
    onNavigate,
    onSaveProfile
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedProfile, setEditedProfile] = useState<Partial<TractateProfile>>({
        displayName: profile?.displayName || tractate,
        hebrewName: profile?.hebrewName || tractateHebrewNames[tractate.toLowerCase()] || '',
        order: profile?.order || tractateOrders[tractate.toLowerCase()]?.english || '',
        orderHebrew: profile?.orderHebrew || tractateOrders[tractate.toLowerCase()]?.hebrew || '',
        description: profile?.description || '',
        tags: profile?.tags || [],
        imageUrl: profile?.imageUrl || '',
    });
    const [newTag, setNewTag] = useState('');

    // Image upload state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [editedImageUrl, setEditedImageUrl] = useState<string | null>(profile?.imageUrl || null);

    // Sync state with profile prop changes
    React.useEffect(() => {
        if (profile) {
            setEditedProfile({
                displayName: profile.displayName || tractate,
                hebrewName: profile.hebrewName || tractateHebrewNames[tractate.toLowerCase()] || '',
                order: profile.order || tractateOrders[tractate.toLowerCase()]?.english || '',
                orderHebrew: profile.orderHebrew || tractateOrders[tractate.toLowerCase()]?.hebrew || '',
                description: profile.description || '',
                tags: profile.tags || [],
                imageUrl: profile.imageUrl || '',
            });
            setEditedImageUrl(profile.imageUrl || null);
        }
    }, [profile, tractate]);

    // Get unique scholars
    const uniqueScholars = useMemo(() => {
        const scholars = new Set<string>();
        trees.forEach(tree => {
            tree.branches.forEach(branch => {
                if (branch.author) {
                    scholars.add(branch.author);
                }
            });
        });
        return Array.from(scholars).sort();
    }, [trees]);

    // Total branches
    const totalBranches = useMemo(() => {
        return trees.reduce((sum, tree) => sum + tree.branches.length, 0);
    }, [trees]);

    // Most referenced page
    const mostReferencedPage = useMemo(() => {
        if (trees.length === 0) return null;
        return trees.reduce((max, tree) =>
            tree.branches.length > max.branches.length ? tree : max
            , trees[0]);
    }, [trees]);

    // Handle image upload
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!validTypes.includes(file.type)) {
            alert('Please select a valid image file (JPEG, PNG, WebP, or GIF)');
            return;
        }

        setIsUploading(true);
        try {
            const normalizedName = tractate.toLowerCase().replace(/\s+/g, '_');
            const extension = file.name.split('.').pop() || 'jpg';
            const storagePath = `tractates/${normalizedName}.${extension}`;
            const storageRef = ref(storage, storagePath);

            await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(storageRef);
            setEditedImageUrl(downloadUrl);
        } catch (error) {
            console.error('Failed to upload tractate image:', error);
            alert('Failed to upload image. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveProfile = () => {
        if (onSaveProfile) {
            onSaveProfile({
                normalizedName: tractate.toLowerCase().replace(/\s+/g, '_'),
                displayName: editedProfile.displayName || tractate,
                hebrewName: editedProfile.hebrewName,
                order: editedProfile.order,
                orderHebrew: editedProfile.orderHebrew,
                description: editedProfile.description,
                tags: editedProfile.tags,
                imageUrl: editedImageUrl || profile?.imageUrl,
            });
        }
        setIsEditing(false);
    };

    const addTag = () => {
        if (newTag.trim() && !editedProfile.tags?.includes(newTag.trim())) {
            setEditedProfile(prev => ({
                ...prev,
                tags: [...(prev.tags || []), newTag.trim()]
            }));
            setNewTag('');
        }
    };

    const removeTag = (tag: string) => {
        setEditedProfile(prev => ({
            ...prev,
            tags: prev.tags?.filter(t => t !== tag) || []
        }));
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0a140a] to-[#0f1a0f] text-[#f5f0e1]">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-r from-[#0a140a]/95 to-[#0f1a0f]/95 backdrop-blur-md border-b border-[#1a4d2e]/30 px-6 py-4">
                <div className="flex items-center justify-between max-w-6xl mx-auto">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-[#10B981] hover:text-[#34D399] transition-colors"
                    >
                        <span className="material-symbols-outlined">arrow_back</span>
                        <span>Back to Tractates</span>
                    </button>
                    <div className="flex items-center gap-3">
                        {isEditing ? (
                            <>
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className="px-4 py-2 rounded-lg border border-[#1a4d2e]/50 text-[#f5f0e1]/60 hover:bg-[#1a4d2e]/20 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveProfile}
                                    className="px-4 py-2 rounded-lg bg-[#10B981] text-[#0a140a] font-medium hover:bg-[#34D399] transition-colors"
                                >
                                    Save Profile
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#10B981]/30 text-[#10B981] hover:bg-[#10B981]/10 transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">edit</span>
                                Edit Profile
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-6 py-8">
                {/* Profile Header */}
                <div className="bg-gradient-to-br from-[#0f1a0f] to-[#0a140a] border border-[#1a4d2e]/40 rounded-2xl p-8 mb-8">
                    <div className="flex flex-col md:flex-row gap-8">
                        {/* Tractate Image */}
                        <div className="relative">
                            <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-[#1a4d2e]/40 to-[#0a140a] border border-[#10B981]/20 flex items-center justify-center overflow-hidden">
                                <img
                                    src={editedImageUrl || profile?.imageUrl || `/trees/${tractate.toLowerCase().split(' ')[0]}.png`}
                                    alt={tractate}
                                    className="w-full h-full object-contain opacity-80"
                                    onError={(e) => { e.currentTarget.src = '/trees/default.png'; }}
                                />
                                {/* Upload overlay when editing */}
                                {isEditing && (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploading}
                                        className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer rounded-2xl"
                                    >
                                        <span className="material-symbols-outlined text-white text-2xl mb-1">
                                            {isUploading ? 'hourglass_empty' : 'add_photo_alternate'}
                                        </span>
                                        <span className="text-white text-xs font-medium">
                                            {isUploading ? 'Uploading...' : 'Change Image'}
                                        </span>
                                    </button>
                                )}
                            </div>
                            {/* Hidden file input */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                onChange={handleImageUpload}
                                className="hidden"
                            />
                        </div>

                        {/* Tractate Info */}
                        <div className="flex-1">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={editedProfile.displayName}
                                            onChange={(e) => setEditedProfile(prev => ({ ...prev, displayName: e.target.value }))}
                                            className="text-3xl font-serif font-bold bg-transparent border-b-2 border-[#10B981]/50 focus:border-[#10B981] outline-none text-[#f5f0e1] mb-2"
                                        />
                                    ) : (
                                        <h1 className="text-3xl font-serif font-bold text-[#f5f0e1] mb-2">
                                            {profile?.displayName || tractate}
                                        </h1>
                                    )}
                                    <p className="text-2xl font-serif text-[#10B981]/80" dir="rtl">
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={editedProfile.hebrewName}
                                                onChange={(e) => setEditedProfile(prev => ({ ...prev, hebrewName: e.target.value }))}
                                                className="bg-transparent border-b-2 border-[#10B981]/50 focus:border-[#10B981] outline-none text-[#10B981]/80 text-right"
                                                dir="rtl"
                                            />
                                        ) : (
                                            profile?.hebrewName || tractateHebrewNames[tractate.toLowerCase()] || ''
                                        )}
                                    </p>
                                </div>
                            </div>

                            {/* Seder (Order) */}
                            <div className="flex items-center gap-2 mb-4 text-[#f5f0e1]/60">
                                <span className="material-symbols-outlined text-sm">menu_book</span>
                                <span>Seder {profile?.order || tractateOrders[tractate.toLowerCase()]?.english || 'Unknown'}</span>
                                <span className="text-[#10B981]/60" dir="rtl">
                                    ({profile?.orderHebrew || tractateOrders[tractate.toLowerCase()]?.hebrew || ''})
                                </span>
                            </div>

                            {/* Description */}
                            {isEditing ? (
                                <textarea
                                    value={editedProfile.description}
                                    onChange={(e) => setEditedProfile(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Add a description for this tractate..."
                                    className="w-full h-24 bg-[#0a140a]/50 border border-[#1a4d2e]/30 rounded-lg p-3 text-[#f5f0e1] placeholder-[#f5f0e1]/30 focus:border-[#10B981]/50 outline-none resize-none"
                                />
                            ) : (
                                profile?.description && (
                                    <p className="text-[#f5f0e1]/70 leading-relaxed">
                                        {profile.description}
                                    </p>
                                )
                            )}

                            {/* Tags */}
                            <div className="flex flex-wrap gap-2 mt-4">
                                {editedProfile.tags?.map(tag => (
                                    <span
                                        key={tag}
                                        className="px-3 py-1 rounded-full bg-[#10B981]/10 text-[#10B981] text-sm border border-[#10B981]/20 flex items-center gap-1"
                                    >
                                        {tag}
                                        {isEditing && (
                                            <button
                                                onClick={() => removeTag(tag)}
                                                className="ml-1 hover:text-red-400"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </span>
                                ))}
                                {isEditing && (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={newTag}
                                            onChange={(e) => setNewTag(e.target.value)}
                                            onKeyPress={(e) => e.key === 'Enter' && addTag()}
                                            placeholder="Add tag..."
                                            className="px-3 py-1 rounded-full bg-[#0a140a]/50 border border-[#1a4d2e]/30 text-sm text-[#f5f0e1] placeholder-[#f5f0e1]/30 focus:border-[#10B981]/50 outline-none w-24"
                                        />
                                        <button
                                            onClick={addTag}
                                            className="text-[#10B981] hover:text-[#34D399]"
                                        >
                                            +
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-gradient-to-br from-[#0f1a0f] to-[#0a140a] border border-[#1a4d2e]/40 rounded-xl p-6 text-center">
                        <div className="text-4xl font-bold text-[#10B981] mb-2">{trees.length}</div>
                        <div className="text-[#f5f0e1]/60">Pages (Amudim)</div>
                    </div>
                    <div className="bg-gradient-to-br from-[#0f1a0f] to-[#0a140a] border border-[#1a4d2e]/40 rounded-xl p-6 text-center">
                        <div className="text-4xl font-bold text-[#10B981] mb-2">{totalBranches}</div>
                        <div className="text-[#f5f0e1]/60">Total Interpretations</div>
                    </div>
                    <div className="bg-gradient-to-br from-[#0f1a0f] to-[#0a140a] border border-[#1a4d2e]/40 rounded-xl p-6 text-center">
                        <div className="text-4xl font-bold text-[#10B981] mb-2">{uniqueScholars.length}</div>
                        <div className="text-[#f5f0e1]/60">Scholars</div>
                    </div>
                </div>

                {/* Most Referenced Page */}
                {mostReferencedPage && mostReferencedPage.branches.length > 0 && (
                    <div className="bg-gradient-to-br from-[#0f1a0f] to-[#0a140a] border border-[#1a4d2e]/40 rounded-xl p-6 mb-8">
                        <h3 className="text-lg font-semibold text-[#10B981] mb-3">Most Referenced Page</h3>
                        <button
                            onClick={() => onNavigate(mostReferencedPage.id)}
                            className="flex items-center justify-between w-full p-4 rounded-lg bg-[#0a140a]/50 border border-[#1a4d2e]/30 hover:border-[#10B981]/50 transition-colors group"
                        >
                            <div>
                                <h4 className="font-serif font-bold text-[#f5f0e1] group-hover:text-[#10B981] transition-colors">
                                    {mostReferencedPage.root.title}
                                </h4>
                                <p className="text-sm text-[#f5f0e1]/40 font-mono">{mostReferencedPage.root.sourceText}</p>
                            </div>
                            <span className="px-3 py-1 rounded-lg bg-[#10B981]/10 text-[#10B981] text-sm">
                                {mostReferencedPage.branches.length} interpretations
                            </span>
                        </button>
                    </div>
                )}

                {/* All Pages */}
                <div className="bg-gradient-to-br from-[#0f1a0f] to-[#0a140a] border border-[#1a4d2e]/40 rounded-xl p-6 mb-8">
                    <h3 className="text-lg font-semibold text-[#10B981] mb-4">All Pages in {tractate}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {trees.map(tree => (
                            <button
                                key={tree.id}
                                onClick={() => onNavigate(tree.id)}
                                className="text-left p-4 rounded-lg bg-[#0a140a]/50 border border-[#1a4d2e]/30 hover:border-[#10B981]/50 transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-[#10B981]/10 group"
                            >
                                <h4 className="font-serif font-bold text-[#f5f0e1] group-hover:text-[#10B981] transition-colors line-clamp-2 mb-1">
                                    {tree.root.title}
                                </h4>
                                <p className="text-xs text-[#f5f0e1]/40 font-mono mb-2">{tree.root.sourceText}</p>
                                <span className="text-xs bg-[#10B981]/10 text-[#10B981] px-2.5 py-1 rounded-lg border border-[#10B981]/20">
                                    {tree.branches.length} branches
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Scholars */}
                {uniqueScholars.length > 0 && (
                    <div className="bg-gradient-to-br from-[#0f1a0f] to-[#0a140a] border border-[#1a4d2e]/40 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-[#10B981] mb-4">Contributing Scholars</h3>
                        <div className="flex flex-wrap gap-2">
                            {uniqueScholars.map(scholar => (
                                <span
                                    key={scholar}
                                    className="px-3 py-1.5 rounded-lg bg-[#0a140a]/50 border border-[#1a4d2e]/30 text-[#f5f0e1]/80 text-sm"
                                >
                                    {scholar}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TractateDetailPage;
