import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, Timestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { UserText, AIFinding, AIFindingStatus, AIFindingType, TextGenre, GroundTruthAction } from '../types';
import AddReferenceModal from '../components/AddReferenceModal';
import { saveTrainingExample } from '../utils/feedback-helpers';
import { saveGroundTruthExample } from '../utils/ground-truth-helpers';

interface LibraryViewProps {
    onViewChange: (view: 'dashboard' | 'split-pane' | 'analyzer' | 'assistant' | 'library') => void;
    onAnalyze: (text: UserText) => void;
    onOpenBatchImport?: () => void;
    onTextMetadataUpdate?: (originalText: UserText, updatedFields: Partial<UserText>) => Promise<void>;
    onTextDelete?: (text: UserText) => Promise<{ deleted: number; trees: number }>;
}

type SortField = 'title' | 'author' | 'genre' | 'dateAdded' | 'references' | 'status';
type SortDirection = 'asc' | 'desc';

const genreColors: Record<TextGenre, string> = {
    [TextGenre.Halakha]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    [TextGenre.Aggadah]: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    [TextGenre.Philosophy]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    [TextGenre.Poetry]: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    [TextGenre.ModernScholarship]: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    [TextGenre.Literary]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    [TextGenre.Historical]: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    [TextGenre.Other]: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const LibraryView: React.FC<LibraryViewProps> = ({ onViewChange, onAnalyze, onOpenBatchImport, onTextMetadataUpdate, onTextDelete }) => {
    // View State
    const [activeTab, setActiveTab] = useState<'library' | 'review'>('library');

    const [texts, setTexts] = useState<UserText[]>([]);
    const [selectedText, setSelectedText] = useState<UserText | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // New: Sorting and filtering state
    const [sortBy, setSortBy] = useState<SortField>('dateAdded');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [searchQuery, setSearchQuery] = useState('');
    const [genreFilter, setGenreFilter] = useState<TextGenre | 'all'>('all');

    // Edit Mode State
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Partial<UserText>>({});
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    // Processing state for approval
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    // Manual reference addition modal
    const [isAddReferenceModalOpen, setIsAddReferenceModalOpen] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'user_texts'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedTexts = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as UserText));
            setTexts(fetchedTexts);
            setIsLoading(false);

            // Update selected text if it exists
            if (selectedText) {
                const updatedSelected = fetchedTexts.find(t => t.id === selectedText.id);
                if (updatedSelected && !isEditing) {
                    setSelectedText(updatedSelected);
                }
            }
        }, (error) => {
            console.error("Error fetching user texts:", error);
            alert("Failed to load library. Please check your connection.");
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [selectedText?.id, isEditing]);

    // Filter and sort texts
    const filteredAndSortedTexts = useMemo(() => {
        let result = texts.filter(t => activeTab === 'library'
            ? (!t.status || t.status === 'active')
            : t.status === 'pending'
        );

        // Apply search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(t =>
                t.title.toLowerCase().includes(query) ||
                (t.author?.toLowerCase().includes(query)) ||
                t.text.toLowerCase().includes(query)
            );
        }

        // Apply genre filter
        if (genreFilter !== 'all') {
            result = result.filter(t => t.genre === genreFilter);
        }

        // Sort
        result.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case 'title':
                    comparison = a.title.localeCompare(b.title);
                    break;
                case 'author':
                    comparison = (a.author || '').localeCompare(b.author || '');
                    break;
                case 'genre':
                    comparison = (a.genre || '').localeCompare(b.genre || '');
                    break;
                case 'dateAdded':
                    const dateA = a.createdAt?.toDate?.()?.getTime() || a.dateAdded || 0;
                    const dateB = b.createdAt?.toDate?.()?.getTime() || b.dateAdded || 0;
                    comparison = dateA - dateB;
                    break;
                case 'references':
                    comparison = (a.findings?.length || 0) - (b.findings?.length || 0);
                    break;
                case 'status':
                    comparison = (a.status || 'active').localeCompare(b.status || 'active');
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [texts, activeTab, searchQuery, genreFilter, sortBy, sortDirection]);

    // Stats
    const stats = useMemo(() => {
        const activeTexts = texts.filter(t => !t.status || t.status === 'active');
        const totalRefs = activeTexts.reduce((sum, t) => sum + (t.findings?.length || 0), 0);
        const verifiedRefs = activeTexts.reduce((sum, t) =>
            sum + (t.findings?.filter(f => f.isGroundTruth).length || 0), 0);
        const pendingCount = texts.filter(t => t.status === 'pending').length;
        return { total: activeTexts.length, refs: totalRefs, verified: verifiedRefs, pending: pendingCount };
    }, [texts]);

    const handleSort = (field: SortField) => {
        if (sortBy === field) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortDirection('asc');
        }
    };

    const handleDeleteText = async (e: React.MouseEvent, textId: string) => {
        e.stopPropagation();
        const textToDelete = texts.find(t => t.id === textId);
        if (!textToDelete) return;

        // Build confirmation message
        let confirmMsg = "Are you sure you want to delete this text?";
        if (onTextDelete) {
            confirmMsg += "\n\nThis will also remove any associated branches from your graph.";
        }
        if (!confirm(confirmMsg)) return;

        try {
            // Cascade delete branches first
            if (onTextDelete) {
                const result = await onTextDelete(textToDelete);
                if (result.deleted > 0) {
                    console.log(`[LibraryView] Cascade deleted ${result.deleted} branches`);
                }
            }

            await deleteDoc(doc(db, 'user_texts', textId));
            if (selectedText?.id === textId) {
                setSelectedText(null);
                setIsEditing(false);
            }
        } catch (error) {
            console.error("Error deleting text:", error);
            alert("Failed to delete text.");
        }
    };

    const handleApprove = async (e: React.MouseEvent, text: UserText) => {
        e.stopPropagation();
        setIsProcessing(text.id);
        try {
            const textRef = doc(db, 'user_texts', text.id);
            await updateDoc(textRef, { status: 'active' });
            if (selectedText?.id === text.id) {
                setSelectedText({ ...text, status: 'active' });
            }
        } catch (error) {
            console.error("Error approving text:", error);
            alert("Failed to approve text.");
        } finally {
            setIsProcessing(null);
        }
    };

    const handleStartEdit = () => {
        if (!selectedText) return;
        setEditForm({
            title: selectedText.title,
            author: selectedText.author || '',
            publicationDate: selectedText.publicationDate || '',
            keywords: selectedText.keywords || [],
            bibliographicalInfo: selectedText.bibliographicalInfo || '',
            genre: selectedText.genre
        });
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditForm({});
    };

    const handleSaveEdit = async () => {
        if (!selectedText || !editForm) {
            console.error('[LibraryView] Cannot save: no selected text or edit form');
            return;
        }

        console.log('[LibraryView] Saving edit form:', editForm);

        try {
            const textRef = doc(db, 'user_texts', selectedText.id);

            // Build update object, only including fields that have values
            const updateData: Record<string, any> = {};
            if (editForm.title !== undefined) updateData.title = editForm.title;
            if (editForm.author !== undefined) updateData.author = editForm.author;
            if (editForm.publicationDate !== undefined) updateData.publicationDate = editForm.publicationDate;
            if (editForm.keywords !== undefined) updateData.keywords = editForm.keywords;
            if (editForm.bibliographicalInfo !== undefined) updateData.bibliographicalInfo = editForm.bibliographicalInfo;
            if (editForm.genre !== undefined) updateData.genre = editForm.genre;

            console.log('[LibraryView] Updating Firestore with:', updateData);

            await updateDoc(textRef, updateData);
            console.log('[LibraryView] Firestore update successful');

            if (onTextMetadataUpdate) {
                await onTextMetadataUpdate(selectedText, {
                    title: editForm.title,
                    author: editForm.author,
                    publicationDate: editForm.publicationDate,
                    genre: editForm.genre
                });
            }

            // Update local state
            setSelectedText({ ...selectedText, ...editForm as any });
            setIsEditing(false);
            setEditForm({});

            console.log('[LibraryView] Edit saved successfully');
        } catch (error) {
            console.error("[LibraryView] Error updating text:", error);
            alert("Failed to save changes. Check console for details.");
        }
    };

    const handleDeleteSelected = async () => {
        if (!selectedText) return;

        try {
            // Cascade delete branches first
            if (onTextDelete) {
                const result = await onTextDelete(selectedText);
                if (result.deleted > 0) {
                    console.log(`[LibraryView] Cascade deleted ${result.deleted} branches from ${result.trees} trees`);
                }
            }

            await deleteDoc(doc(db, 'user_texts', selectedText.id));
            setSelectedText(null);
            setIsEditing(false);
            setDeleteConfirm(false);
        } catch (error) {
            console.error("Error deleting text:", error);
            alert("Failed to delete text.");
        }
    };

    const handleFindingAction = async (findingIdOrIndex: string, action: 'undo' | 'dismiss' | 'delete') => {
        if (!selectedText || !selectedText.findings) return;

        let updatedFindings: AIFinding[];
        const isIndexBased = findingIdOrIndex.startsWith('idx:');
        const targetIndex = isIndexBased ? parseInt(findingIdOrIndex.replace('idx:', ''), 10) : -1;

        if (action === 'delete') {
            updatedFindings = selectedText.findings.filter((f, idx) => {
                if (isIndexBased) return idx !== targetIndex;
                return f.id !== findingIdOrIndex;
            });
        } else {
            updatedFindings = selectedText.findings.map((f, idx) => {
                const matches = isIndexBased ? idx === targetIndex : f.id === findingIdOrIndex;
                if (!matches) return f;
                return {
                    ...f,
                    status: action === 'undo' ? AIFindingStatus.Pending : AIFindingStatus.Dismissed
                };
            });
        }

        try {
            const textRef = doc(db, 'user_texts', selectedText.id);
            await updateDoc(textRef, { findings: updatedFindings });
            setSelectedText({ ...selectedText, findings: updatedFindings });
        } catch (error) {
            console.error('Error updating finding:', error);
            alert('Failed to update finding.');
        }
    };

    const handleAddManualReference = async (newFinding: AIFinding) => {
        if (!selectedText) return;

        const findingWithContext = {
            ...newFinding,
            sourceDocumentId: selectedText.id,
        };

        const updatedFindings = [...(selectedText.findings || []), findingWithContext];

        try {
            const textRef = doc(db, 'user_texts', selectedText.id);
            await updateDoc(textRef, { findings: updatedFindings });
            setSelectedText({ ...selectedText, findings: updatedFindings });

            if (newFinding.isGroundTruth) {
                // Save to BOTH collections for proper GT tracking
                await saveGroundTruthExample(
                    'user-1',
                    newFinding.snippet,
                    newFinding.snippet,
                    GroundTruthAction.APPROVE,
                    newFinding.source,
                    {
                        justification: newFinding.userExplanation,
                        isGroundTruth: true
                    }
                );
                await saveTrainingExample(findingWithContext, true);
                console.log('[LibraryView] Saved manual reference to both GT collections');
            }
        } catch (error) {
            console.error('Error adding manual reference:', error);
            alert('Failed to add reference.');
        }
    };

    const SortableHeader = ({ field, label }: { field: SortField; label: string }) => (
        <th
            onClick={() => handleSort(field)}
            className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-subtext-dark cursor-pointer hover:text-primary transition-colors group"
        >
            <div className="flex items-center gap-1">
                {label}
                <span className={`material-symbols-outlined text-sm transition-transform ${sortBy === field ? 'text-primary' : 'opacity-0 group-hover:opacity-50'}`}>
                    {sortBy === field && sortDirection === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                </span>
            </div>
        </th>
    );

    const GenreTag = ({ genre }: { genre?: TextGenre | string }) => {
        if (!genre) return <span className="text-subtext-dark text-xs italic">—</span>;

        // Check if it's a known genre with predefined color
        const colorClass = genreColors[genre as TextGenre] || 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';

        return (
            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}>
                {genre}
            </span>
        );
    };

    return (
        <div className="flex h-full w-full bg-background-dark text-text-dark">
            {/* Main Content Area */}
            <div className={`flex flex-col ${selectedText ? 'w-2/3' : 'w-full'} transition-all duration-300`}>
                {/* Header */}
                <div className="p-6 border-b border-border-dark bg-surface-dark">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h1 className="text-2xl font-bold">My Library</h1>
                            <p className="text-sm text-subtext-dark mt-1">
                                {stats.total} texts • {stats.refs} references {stats.verified > 0 && <span className="text-primary">({stats.verified} verified)</span>}
                                {stats.pending > 0 && <span className="text-orange-400"> • {stats.pending} pending review</span>}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Search Bar */}
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-subtext-dark text-lg">search</span>
                                <input
                                    type="text"
                                    placeholder="Search texts..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 pr-4 py-2 bg-background-dark border border-border-dark rounded-lg text-sm text-text-dark placeholder:text-subtext-dark focus:border-primary focus:outline-none w-64"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-subtext-dark hover:text-text-dark"
                                    >
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                )}
                            </div>
                            {onOpenBatchImport && (
                                <button
                                    onClick={onOpenBatchImport}
                                    className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                                    title="Batch Import"
                                >
                                    <span className="material-symbols-outlined">cloud_download</span>
                                </button>
                            )}
                            <button
                                onClick={() => onViewChange('analyzer')}
                                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors font-medium text-sm"
                            >
                                <span className="material-symbols-outlined text-lg">add</span>
                                New Text
                            </button>
                        </div>
                    </div>

                    {/* Tabs + Genre Filters */}
                    <div className="flex items-center justify-between">
                        <div className="flex gap-4">
                            <button
                                onClick={() => setActiveTab('library')}
                                className={`pb-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'library'
                                    ? 'text-primary border-primary'
                                    : 'text-subtext-dark border-transparent hover:text-text-dark'
                                    }`}
                            >
                                Library ({stats.total})
                            </button>
                            <button
                                onClick={() => setActiveTab('review')}
                                className={`pb-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'review'
                                    ? 'text-orange-400 border-orange-400'
                                    : 'text-subtext-dark border-transparent hover:text-text-dark'
                                    }`}
                            >
                                Review Queue ({stats.pending})
                            </button>
                        </div>

                        {/* Genre Filter Chips */}
                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={() => setGenreFilter('all')}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${genreFilter === 'all'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-surface-dark text-subtext-dark hover:text-text-dark border border-border-dark'
                                    }`}
                            >
                                All
                            </button>
                            {Object.values(TextGenre).slice(0, 5).map(g => (
                                <button
                                    key={g}
                                    onClick={() => setGenreFilter(genreFilter === g ? 'all' : g)}
                                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${genreFilter === g
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-surface-dark text-subtext-dark hover:text-text-dark border border-border-dark'
                                        }`}
                                >
                                    {g}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-64">
                            <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
                        </div>
                    ) : filteredAndSortedTexts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-subtext-dark">
                            <span className="material-symbols-outlined text-5xl mb-3 opacity-30">library_books</span>
                            <p className="text-lg">{searchQuery || genreFilter !== 'all' ? 'No texts match your filters' : 'No texts in library'}</p>
                            {!searchQuery && genreFilter === 'all' && (
                                <button onClick={() => onViewChange('analyzer')} className="text-primary hover:underline mt-2">
                                    Add your first text
                                </button>
                            )}
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-surface-dark border-b border-border-dark sticky top-0">
                                <tr>
                                    <SortableHeader field="title" label="Title" />
                                    <SortableHeader field="author" label="Author" />
                                    <SortableHeader field="genre" label="Genre" />
                                    <SortableHeader field="dateAdded" label="Added" />
                                    <SortableHeader field="references" label="Refs" />
                                    {activeTab === 'review' && <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-subtext-dark">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-dark">
                                {filteredAndSortedTexts.map((text) => (
                                    <tr
                                        key={text.id}
                                        onClick={() => { setSelectedText(text); setIsEditing(false); }}
                                        className={`cursor-pointer transition-colors ${selectedText?.id === text.id
                                            ? 'bg-primary/10'
                                            : 'hover:bg-white/5'
                                            }`}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-text-dark truncate max-w-[300px]">{text.title}</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-subtext-dark truncate max-w-[150px]">
                                            {text.author || '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <GenreTag genre={text.genre} />
                                        </td>
                                        <td className="px-4 py-3 text-sm text-subtext-dark">
                                            {text.createdAt?.toDate?.()?.toLocaleDateString() || '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {text.findings?.length ? (
                                                <span className="px-2 py-0.5 bg-primary/20 text-primary rounded text-xs font-medium">
                                                    {text.findings.length}
                                                </span>
                                            ) : (
                                                <span className="text-subtext-dark text-xs italic">0</span>
                                            )}
                                        </td>
                                        {activeTab === 'review' && (
                                            <td className="px-4 py-3">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={(e) => handleApprove(e, text)}
                                                        disabled={isProcessing === text.id}
                                                        className="px-2 py-1 bg-primary/20 hover:bg-primary/30 text-primary text-xs rounded font-bold flex items-center gap-1"
                                                    >
                                                        <span className="material-symbols-outlined !text-sm">check</span>
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDeleteText(e, text.id)}
                                                        className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs rounded font-bold"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Preview Panel */}
            {selectedText && (
                <div className="w-1/3 border-l border-border-dark bg-surface-dark flex flex-col overflow-hidden">
                    {/* Preview Header */}
                    <div className="p-4 border-b border-border-dark flex justify-between items-start">
                        <div className="flex-1 mr-3">
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={editForm.title || ''}
                                    onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                                    className="w-full bg-background-dark border border-border-dark rounded-lg p-2 text-text-dark text-lg font-bold focus:border-primary focus:outline-none"
                                />
                            ) : (
                                <h2 className="text-lg font-bold text-primary line-clamp-2">{selectedText.title}</h2>
                            )}
                            {!isEditing && (
                                <div className="flex items-center gap-3 mt-2 text-sm text-subtext-dark">
                                    {selectedText.author && <span>{selectedText.author}</span>}
                                    {selectedText.genre && <GenreTag genre={selectedText.genre} />}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => setSelectedText(null)}
                            className="p-1 hover:bg-white/10 rounded text-subtext-dark hover:text-text-dark"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Edit Form or Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {isEditing ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-subtext-dark uppercase tracking-wider mb-1 block">Author</label>
                                    <input
                                        type="text"
                                        value={editForm.author || ''}
                                        onChange={e => setEditForm({ ...editForm, author: e.target.value })}
                                        className="w-full bg-background-dark border border-border-dark rounded-lg p-2 text-text-dark focus:border-primary focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-subtext-dark uppercase tracking-wider mb-1 block">Genre / Category</label>
                                    <input
                                        type="text"
                                        list="genre-options"
                                        value={(editForm.genre as string) || ''}
                                        onChange={e => setEditForm({ ...editForm, genre: e.target.value as any })}
                                        placeholder="Select or type custom category..."
                                        className="w-full bg-background-dark border border-border-dark rounded-lg p-2 text-text-dark focus:border-primary focus:outline-none"
                                    />
                                    <datalist id="genre-options">
                                        {Object.values(TextGenre).map(g => (
                                            <option key={g} value={g} />
                                        ))}
                                    </datalist>
                                    <p className="text-xs text-subtext-dark mt-1">Choose from suggestions or type your own</p>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-subtext-dark uppercase tracking-wider mb-1 block">Publication Date</label>
                                    <input
                                        type="text"
                                        value={editForm.publicationDate || ''}
                                        onChange={e => setEditForm({ ...editForm, publicationDate: e.target.value })}
                                        placeholder="e.g. 1995"
                                        className="w-full bg-background-dark border border-border-dark rounded-lg p-2 text-text-dark focus:border-primary focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-subtext-dark uppercase tracking-wider mb-1 block">Keywords</label>
                                    <input
                                        type="text"
                                        value={editForm.keywords?.join(', ') || ''}
                                        onChange={e => setEditForm({ ...editForm, keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k) })}
                                        placeholder="Comma separated"
                                        className="w-full bg-background-dark border border-border-dark rounded-lg p-2 text-text-dark focus:border-primary focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-subtext-dark uppercase tracking-wider mb-1 block">Bibliographical Info</label>
                                    <textarea
                                        value={editForm.bibliographicalInfo || ''}
                                        onChange={e => setEditForm({ ...editForm, bibliographicalInfo: e.target.value })}
                                        rows={3}
                                        className="w-full bg-background-dark border border-border-dark rounded-lg p-2 text-text-dark focus:border-primary focus:outline-none resize-none"
                                    />
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Text Preview */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-bold text-subtext-dark uppercase tracking-wider mb-2">Preview</h3>
                                    <div className="bg-background-dark rounded-lg p-3 text-sm text-text-dark/80 max-h-48 overflow-y-auto font-serif leading-relaxed">
                                        {selectedText.text.substring(0, 500)}
                                        {selectedText.text.length > 500 && '...'}
                                    </div>
                                </div>

                                {/* Metadata */}
                                <div className="mb-4 space-y-2 text-sm">
                                    {selectedText.publicationDate && (
                                        <div className="flex items-center gap-2 text-subtext-dark">
                                            <span className="material-symbols-outlined text-sm">event</span>
                                            Published: {selectedText.publicationDate}
                                        </div>
                                    )}
                                    {selectedText.keywords && selectedText.keywords.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {selectedText.keywords.map((kw, i) => (
                                                <span key={i} className="px-2 py-0.5 bg-surface-dark text-subtext-dark rounded text-xs border border-border-dark">
                                                    #{kw}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* References Summary */}
                                {selectedText.findings && selectedText.findings.length > 0 && (
                                    <div className="mb-4">
                                        <h3 className="text-xs font-bold text-subtext-dark uppercase tracking-wider mb-2 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm text-ai-primary">auto_awesome</span>
                                            References ({selectedText.findings.length})
                                        </h3>
                                        <div className="space-y-2 max-h-40 overflow-y-auto">
                                            {selectedText.findings.slice(0, 5).map((f, idx) => (
                                                <div key={f.id || idx} className="flex items-center justify-between p-2 bg-background-dark rounded border border-border-dark">
                                                    <span className="text-sm text-text-dark truncate">{f.source}</span>
                                                    <span className="text-xs text-subtext-dark">{f.confidence}%</span>
                                                </div>
                                            ))}
                                            {selectedText.findings.length > 5 && (
                                                <p className="text-xs text-subtext-dark text-center">+{selectedText.findings.length - 5} more</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="p-4 border-t border-border-dark flex gap-2 flex-wrap">
                        {isEditing ? (
                            <>
                                <button
                                    onClick={handleSaveEdit}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors font-bold text-sm"
                                >
                                    <span className="material-symbols-outlined text-lg">save</span>
                                    Save
                                </button>
                                <button
                                    onClick={handleCancelEdit}
                                    className="px-4 py-2 bg-surface-dark text-text-dark rounded-lg hover:bg-white/10 transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => onAnalyze(selectedText)}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors font-medium text-sm"
                                >
                                    <span className="material-symbols-outlined text-lg">saved_search</span>
                                    Open Study Mode
                                </button>
                                <button
                                    onClick={handleStartEdit}
                                    className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                                    title="Edit Info"
                                >
                                    <span className="material-symbols-outlined">edit</span>
                                </button>
                                {deleteConfirm ? (
                                    <>
                                        <button
                                            onClick={handleDeleteSelected}
                                            className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                                            title="Confirm Delete"
                                        >
                                            <span className="material-symbols-outlined">warning</span>
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirm(false)}
                                            className="p-2 bg-surface-dark text-text-dark rounded-lg hover:bg-white/10"
                                        >
                                            <span className="material-symbols-outlined">close</span>
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => setDeleteConfirm(true)}
                                        className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                                        title="Delete"
                                    >
                                        <span className="material-symbols-outlined">delete</span>
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Add Reference Modal */}
            <AddReferenceModal
                isOpen={isAddReferenceModalOpen}
                onClose={() => setIsAddReferenceModalOpen(false)}
                onSave={handleAddManualReference}
                sourceDocumentId={selectedText?.id}
                existingFindings={selectedText?.findings || []}
            />
        </div>
    );
};

export default LibraryView;
