import React, { useState, useRef } from 'react';
import { AuthorEntry } from '../utils/author-aggregation';
import { AuthorProfile } from '../types';
import { getAuthorPortraitUrl } from '../utils/author-portraits';
import { uploadAuthorPortrait, isValidImageFile } from '../utils/author-storage';

interface AuthorDetailPageProps {
    author: AuthorEntry;
    profile?: AuthorProfile;
    onBack: () => void;
    onNavigate: (treeId: string, nodeId?: string) => void;
    onSaveProfile?: (profile: AuthorProfile) => void;
}

const AuthorDetailPage: React.FC<AuthorDetailPageProps> = ({
    author,
    profile,
    onBack,
    onNavigate,
    onSaveProfile
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedProfile, setEditedProfile] = useState<Partial<AuthorProfile>>({
        displayName: profile?.displayName || author.name,
        hebrewName: profile?.hebrewName || '',
        birthYear: profile?.birthYear || '',
        deathYear: profile?.deathYear || '',
        location: profile?.location || '',
        description: profile?.description || '',
        tags: profile?.tags || [],
    });
    const [newTag, setNewTag] = useState('');

    // Image upload state
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [editedPortraitUrl, setEditedPortraitUrl] = useState<string | null>(
        profile?.portraitUrl || null
    );

    // Sync state with profile prop changes
    React.useEffect(() => {
        if (profile) {
            setEditedProfile({
                displayName: profile.displayName || author.name,
                hebrewName: profile.hebrewName || '',
                birthYear: profile.birthYear || '',
                deathYear: profile.deathYear || '',
                location: profile.location || '',
                description: profile.description || '',
                tags: profile.tags || [],
            });
            setEditedPortraitUrl(profile.portraitUrl || null);
        }
    }, [profile, author.name]);

    // Group branches by work title
    type BranchItem = typeof author.branches[number];
    const workGroups = React.useMemo(() => {
        const groups: { [workTitle: string]: BranchItem[] } = {};
        author.branches.forEach(item => {
            const work = item.branch.workTitle || 'Untitled Work';
            if (!groups[work]) groups[work] = [];
            groups[work].push(item);
        });
        return groups;
    }, [author.branches]);

    // Get unique Talmudic references
    const talmudReferences = React.useMemo(() => {
        const refs: { [source: string]: BranchItem[] } = {};
        author.branches.forEach(item => {
            const source = item.rootSource;
            if (!refs[source]) refs[source] = [];
            refs[source].push(item);
        });
        return refs;
    }, [author.branches]);

    const handleSaveProfile = () => {
        if (onSaveProfile) {
            onSaveProfile({
                normalizedName: author.name,
                displayName: editedProfile.displayName || author.name,
                hebrewName: editedProfile.hebrewName,
                birthYear: editedProfile.birthYear,
                deathYear: editedProfile.deathYear,
                location: editedProfile.location,
                description: editedProfile.description,
                tags: editedProfile.tags,
                portraitUrl: editedPortraitUrl || profile?.portraitUrl || getAuthorPortraitUrl(author.name),
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
            tags: prev.tags?.filter(t => t !== tag)
        }));
    };

    // Handle image upload
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!isValidImageFile(file)) {
            alert('Please select a valid image file (JPEG, PNG, WebP, or GIF)');
            return;
        }

        setIsUploading(true);
        try {
            const downloadUrl = await uploadAuthorPortrait(author.name, file);
            setEditedPortraitUrl(downloadUrl);
        } catch (error) {
            console.error('Failed to upload portrait:', error);
            alert('Failed to upload image. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    // Portrait path: check profile, then try auto-resolution from utility, else fallback to initials
    const portraitPath = profile?.portraitUrl || getAuthorPortraitUrl(author.name) || null;
    const initials = author.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    return (
        <div className="h-full overflow-y-auto"
            style={{
                background: 'linear-gradient(180deg, #050a05 0%, #0a140a 30%, #0f1a0f 100%)',
            }}
        >
            {/* Header Bar */}
            <div className="sticky top-0 z-20 bg-[#050a05]/95 backdrop-blur-sm border-b border-[#1a4d2e]/30 px-6 py-4 flex items-center justify-between">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-[#10B981] hover:text-[#10B981]/80 transition-colors"
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                    <span className="font-medium">Back to Scholars</span>
                </button>

                <div className="flex gap-2">
                    {isEditing ? (
                        <>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="px-4 py-2 rounded-xl border border-[#1a4d2e]/50 text-[#f5f0e1]/70 hover:bg-[#1a4d2e]/20 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveProfile}
                                className="px-4 py-2 rounded-xl bg-[#10B981] text-[#0a140a] font-bold hover:bg-[#0fa76f] transition-colors"
                            >
                                Save Profile
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1a4d2e]/50 text-[#f5f0e1]/70 hover:bg-[#1a4d2e]/20 transition-colors"
                        >
                            <span className="material-symbols-outlined text-lg">edit</span>
                            Edit Bio
                        </button>
                    )}
                </div>
            </div>

            <div className="max-w-5xl mx-auto p-6 space-y-8">
                {/* Author Hero Section */}
                <div
                    className="rounded-3xl overflow-hidden"
                    style={{
                        background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.08) 0%, rgba(10, 20, 10, 0.95) 100%)',
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                    }}
                >
                    <div className="h-1.5 w-full bg-gradient-to-r from-[#10B981] via-[#22c55e] to-[#10B981]" />

                    <div className="p-8 flex gap-8">
                        {/* Portrait with upload capability */}
                        <div className="flex-shrink-0 relative">
                            {/* Hidden file input */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleImageUpload}
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                className="hidden"
                            />

                            {/* Portrait image or initials */}
                            {(isEditing ? (editedPortraitUrl || portraitPath) : portraitPath) ? (
                                <img
                                    src={isEditing ? (editedPortraitUrl || portraitPath || '') : (portraitPath || '')}
                                    alt={author.name}
                                    className="w-40 h-40 rounded-2xl object-cover border-2 border-[#10B981]/30 shadow-xl shadow-[#10B981]/10"
                                />
                            ) : (
                                <div
                                    className="w-40 h-40 rounded-2xl flex items-center justify-center text-5xl font-serif font-bold"
                                    style={{
                                        background: 'linear-gradient(135deg, #1a4d2e 0%, #0a1f0a 100%)',
                                        border: '2px solid rgba(16, 185, 129, 0.3)',
                                        color: '#10B981',
                                    }}
                                >
                                    {initials}
                                </div>
                            )}

                            {/* Upload overlay (only in edit mode) */}
                            {isEditing && (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                    className="absolute inset-0 rounded-2xl bg-black/50 flex flex-col items-center justify-center gap-2 opacity-0 hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-wait"
                                >
                                    {isUploading ? (
                                        <>
                                            <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span className="text-white text-sm">Uploading...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-white text-4xl">photo_camera</span>
                                            <span className="text-white text-sm">Upload Photo</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>

                        {/* Author Info */}
                        <div className="flex-1 min-w-0">
                            {isEditing ? (
                                <div className="space-y-4">
                                    <input
                                        type="text"
                                        value={editedProfile.displayName}
                                        onChange={(e) => setEditedProfile(prev => ({ ...prev, displayName: e.target.value }))}
                                        className="text-3xl font-bold font-serif bg-transparent border-b-2 border-[#10B981]/50 focus:border-[#10B981] outline-none text-[#f5f0e1] w-full"
                                        placeholder="Display Name"
                                    />
                                    <input
                                        type="text"
                                        value={editedProfile.hebrewName}
                                        onChange={(e) => setEditedProfile(prev => ({ ...prev, hebrewName: e.target.value }))}
                                        className="text-xl font-serif bg-transparent border-b border-[#8B6914]/50 focus:border-[#8B6914] outline-none text-[#d4a912] w-full"
                                        placeholder="Hebrew Name (optional)"
                                        dir="rtl"
                                    />
                                    <div className="flex gap-4">
                                        <input
                                            type="text"
                                            value={editedProfile.birthYear}
                                            onChange={(e) => setEditedProfile(prev => ({ ...prev, birthYear: e.target.value }))}
                                            className="w-24 px-3 py-2 rounded-lg bg-[#0a140a] border border-[#1a4d2e]/50 text-[#f5f0e1] text-center"
                                            placeholder="Birth"
                                        />
                                        <span className="text-[#f5f0e1]/50 self-center">—</span>
                                        <input
                                            type="text"
                                            value={editedProfile.deathYear}
                                            onChange={(e) => setEditedProfile(prev => ({ ...prev, deathYear: e.target.value }))}
                                            className="w-24 px-3 py-2 rounded-lg bg-[#0a140a] border border-[#1a4d2e]/50 text-[#f5f0e1] text-center"
                                            placeholder="Death"
                                        />
                                        <input
                                            type="text"
                                            value={editedProfile.location}
                                            onChange={(e) => setEditedProfile(prev => ({ ...prev, location: e.target.value }))}
                                            className="flex-1 px-3 py-2 rounded-lg bg-[#0a140a] border border-[#1a4d2e]/50 text-[#f5f0e1]"
                                            placeholder="Location"
                                        />
                                    </div>
                                    <textarea
                                        value={editedProfile.description}
                                        onChange={(e) => setEditedProfile(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full px-4 py-3 rounded-xl bg-[#0a140a] border border-[#1a4d2e]/50 text-[#f5f0e1]/80 resize-none"
                                        rows={3}
                                        placeholder="Brief biography..."
                                    />
                                    {/* Tags editor */}
                                    <div className="flex flex-wrap gap-2 items-center">
                                        {editedProfile.tags?.map(tag => (
                                            <span
                                                key={tag}
                                                className="px-3 py-1 rounded-full bg-[#1a4d2e]/30 text-[#10B981] text-sm flex items-center gap-1"
                                            >
                                                {tag}
                                                <button onClick={() => removeTag(tag)} className="hover:text-red-400">×</button>
                                            </span>
                                        ))}
                                        <input
                                            type="text"
                                            value={newTag}
                                            onChange={(e) => setNewTag(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addTag()}
                                            className="px-3 py-1 rounded-full bg-[#0a140a] border border-[#1a4d2e]/50 text-[#f5f0e1] text-sm w-32"
                                            placeholder="Add tag..."
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <h1 className="text-4xl font-bold text-[#f5f0e1] font-serif mb-2">
                                        {profile?.displayName || author.name}
                                    </h1>
                                    {(profile?.hebrewName || author.originalNames.length > 1) && (
                                        <p className="text-xl text-[#d4a912] font-serif mb-3" dir="rtl">
                                            {profile?.hebrewName || author.originalNames.find(n => n !== author.name)}
                                        </p>
                                    )}

                                    <div className="flex items-center gap-4 text-[#f5f0e1]/60 mb-4">
                                        {(profile?.birthYear || profile?.deathYear) && (
                                            <span className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-lg">calendar_month</span>
                                                {profile.birthYear}{profile.birthYear && profile.deathYear && '–'}{profile.deathYear}
                                            </span>
                                        )}
                                        {profile?.location && (
                                            <span className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-lg">location_on</span>
                                                {profile.location}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            <span className="material-symbols-outlined text-lg">menu_book</span>
                                            {Object.keys(workGroups).length} work{Object.keys(workGroups).length !== 1 ? 's' : ''}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <span className="material-symbols-outlined text-lg">format_quote</span>
                                            {author.branches.length} citation{author.branches.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>

                                    {profile?.description && (
                                        <p className="text-[#f5f0e1]/70 leading-relaxed mb-4">
                                            {profile.description}
                                        </p>
                                    )}

                                    {/* Tags */}
                                    {profile?.tags && profile.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {profile.tags.map(tag => (
                                                <span
                                                    key={tag}
                                                    className="px-3 py-1 rounded-full bg-[#1a4d2e]/30 text-[#10B981] text-sm border border-[#10B981]/20"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Name variants notice */}
                                    {author.originalNames.length > 1 && (
                                        <div className="mt-4 text-xs text-[#f5f0e1]/40 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm">info</span>
                                            Also appears as: {author.originalNames.filter(n => n !== author.name).join(', ')}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Works Section */}
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, #8B6914 0%, #5c3d1a 100%)',
                                boxShadow: '0 4px 15px rgba(139, 105, 20, 0.3)',
                            }}
                        >
                            <span className="material-symbols-outlined text-white">library_books</span>
                        </div>
                        <h2 className="text-2xl font-bold text-[#f5f0e1] font-serif">Works</h2>
                        <span className="text-[#8B6914] font-bold">({Object.keys(workGroups).length})</span>
                    </div>

                    <div className="space-y-3">
                        {(Object.entries(workGroups) as [string, BranchItem[]][]).map(([workTitle, items]) => (
                            <div
                                key={workTitle}
                                className="rounded-xl p-4 bg-[#0a140a]/50 border border-[#8B6914]/20 hover:border-[#8B6914]/40 transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-lg font-bold text-[#f5f0e1] font-serif">{workTitle}</h3>
                                        {items[0].branch.year && (
                                            <span className="text-sm text-[#8B6914]">({items[0].branch.year})</span>
                                        )}
                                    </div>
                                    <span className="text-xs text-[#f5f0e1]/40">
                                        {items.length} citation{items.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="mt-2 text-sm text-[#f5f0e1]/50">
                                    Referenced in: {[...new Set(items.map(i => i.rootSource))].join(', ')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Talmudic References Section */}
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, #10B981 0%, #0a4d2e 100%)',
                                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
                            }}
                        >
                            <span className="material-symbols-outlined text-white">auto_stories</span>
                        </div>
                        <h2 className="text-2xl font-bold text-[#f5f0e1] font-serif">Talmudic References</h2>
                        <span className="text-[#10B981] font-bold">({Object.keys(talmudReferences).length})</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(Object.entries(talmudReferences) as [string, BranchItem[]][]).map(([source, items]) => (
                            <button
                                key={source}
                                onClick={() => onNavigate(items[0].treeId, items[0].branch.id)}
                                className="text-left rounded-2xl p-5 bg-gradient-to-br from-[#0f1a0f] to-[#0a140a] border border-[#1a4d2e]/40 hover:border-[#10B981]/40 transition-all group"
                            >
                                <h3 className="text-lg font-bold text-[#f5f0e1] group-hover:text-[#10B981] transition-colors font-serif mb-1">
                                    {source}
                                </h3>
                                <p className="text-sm text-[#f5f0e1]/50 mb-3">
                                    {items[0].rootTitle}
                                </p>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-[#10B981]">
                                        {items.length} branch{items.length !== 1 ? 'es' : ''} from this author
                                    </span>
                                    <span className="material-symbols-outlined text-[#10B981] opacity-0 group-hover:opacity-100 transition-opacity">
                                        arrow_forward
                                    </span>
                                </div>

                                {/* Preview quote */}
                                {items[0].branch.referenceText && (
                                    <p className="mt-3 text-sm text-[#f5f0e1]/40 italic line-clamp-2 border-t border-[#1a4d2e]/30 pt-3">
                                        "{items[0].branch.referenceText}"
                                    </p>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthorDetailPage;
