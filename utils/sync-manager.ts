/**
 * Sync Manager - Singleton for reliable Firestore writes
 * 
 * Features:
 * - Queue-based write processing
 * - Automatic retry (3 attempts with exponential backoff)
 * - Reactive status stream for UI updates
 */

import { db } from '../firebase';
import {
    doc,
    updateDoc,
    deleteDoc,
    setDoc,
    getDoc,
    Timestamp,
} from 'firebase/firestore';

// ========================================
// HELPER: Remove undefined values (Firestore rejects them)
// ========================================

function sanitizeForFirestore(obj: any): any {
    if (obj === null || obj === undefined) {
        return null;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeForFirestore(item)).filter(item => item !== undefined);
    }

    if (obj instanceof Timestamp) {
        return obj; // Keep Firestore Timestamps as-is
    }

    if (typeof obj === 'object') {
        const cleaned: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) {
                cleaned[key] = sanitizeForFirestore(value);
            }
        }
        return cleaned;
    }

    return obj;
}

// ========================================
// TYPES
// ========================================

export type SyncStatus = 'idle' | 'saving' | 'success' | 'error';

export interface SyncState {
    status: SyncStatus;
    lastOperation: string | null;
    lastSuccessAt: number | null;
    lastErrorAt: number | null;
    lastError: string | null;
    pendingCount: number;
    successCount: number;
    errorCount: number;
}

type SyncListener = (state: SyncState) => void;

interface QueuedWrite {
    id: string;
    operation: () => Promise<void>;
    name: string;
    retries: number;
    maxRetries: number;
}

// ========================================
// SYNC MANAGER SINGLETON
// ========================================

class SyncManagerClass {
    private static instance: SyncManagerClass;

    private state: SyncState = {
        status: 'idle',
        lastOperation: null,
        lastSuccessAt: null,
        lastErrorAt: null,
        lastError: null,
        pendingCount: 0,
        successCount: 0,
        errorCount: 0
    };

    private listeners: Set<SyncListener> = new Set();
    private queue: QueuedWrite[] = [];
    private isProcessing: boolean = false;
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY_MS = 1000;

    private constructor() { }

    static getInstance(): SyncManagerClass {
        if (!SyncManagerClass.instance) {
            SyncManagerClass.instance = new SyncManagerClass();
        }
        return SyncManagerClass.instance;
    }

    // ========================================
    // SUBSCRIPTION
    // ========================================

    subscribe(listener: SyncListener): () => void {
        this.listeners.add(listener);
        listener(this.state); // Immediately emit current state
        return () => this.listeners.delete(listener);
    }

    getState(): SyncState {
        return { ...this.state };
    }

    private notify(): void {
        this.listeners.forEach(listener => listener({ ...this.state }));
    }

    private updateState(updates: Partial<SyncState>): void {
        this.state = { ...this.state, ...updates };
        this.notify();
    }

    // ========================================
    // QUEUE MANAGEMENT
    // ========================================

    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        this.updateState({ status: 'saving' });

        while (this.queue.length > 0) {
            const item = this.queue.shift()!;
            await this.executeWithRetry(item);
        }

        this.isProcessing = false;

        // Reset to idle after 2 seconds if no new writes
        setTimeout(() => {
            if (this.queue.length === 0 && this.state.status === 'success') {
                this.updateState({ status: 'idle' });
            }
        }, 2000);
    }

    private async executeWithRetry(item: QueuedWrite): Promise<void> {
        const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

        for (let attempt = 1; attempt <= item.maxRetries; attempt++) {
            try {
                console.log(`[SyncManager] ${item.name} - Attempt ${attempt}/${item.maxRetries}`);
                await item.operation();

                this.updateState({
                    status: 'success',
                    lastOperation: item.name,
                    lastSuccessAt: Date.now(),
                    pendingCount: this.queue.length,
                    successCount: this.state.successCount + 1
                });

                console.log(`[SyncManager] ${item.name} - Success`);
                return;

            } catch (error: any) {
                console.error(`[SyncManager] ${item.name} - Attempt ${attempt} failed:`, error.message);

                if (attempt < item.maxRetries) {
                    const waitTime = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                    console.log(`[SyncManager] Retrying in ${waitTime}ms...`);
                    await delay(waitTime);
                } else {
                    // All retries exhausted
                    this.updateState({
                        status: 'error',
                        lastOperation: item.name,
                        lastErrorAt: Date.now(),
                        lastError: error.message || 'Unknown error',
                        pendingCount: this.queue.length,
                        errorCount: this.state.errorCount + 1
                    });
                    console.error(`[SyncManager] ${item.name} - Failed permanently`);
                }
            }
        }
    }

    private enqueue(name: string, operation: () => Promise<void>): void {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.queue.push({
            id,
            operation,
            name,
            retries: 0,
            maxRetries: this.MAX_RETRIES
        });
        this.updateState({ pendingCount: this.queue.length });
        this.processQueue();
    }

    // ========================================
    // PUBLIC API
    // ========================================

    updateDocument(
        collection: string,
        docId: string,
        data: Record<string, any>,
        operationName?: string
    ): void {
        const name = operationName || `Update ${collection}/${docId.slice(0, 8)}`;
        this.enqueue(name, async () => {
            const docRef = doc(db, collection, docId);
            // Sanitize data to remove undefined values (Firestore rejects them)
            const sanitizedData = sanitizeForFirestore(data);
            await updateDoc(docRef, {
                ...sanitizedData,
                updatedAt: Timestamp.now()
            });
        });
    }

    deleteDocument(
        collection: string,
        docId: string,
        operationName?: string
    ): void {
        const name = operationName || `Delete ${collection}/${docId.slice(0, 8)}`;
        this.enqueue(name, async () => {
            const docRef = doc(db, collection, docId);
            await deleteDoc(docRef);
        });
    }

    setDocument(
        collection: string,
        docId: string,
        data: Record<string, any>,
        operationName?: string
    ): void {
        const name = operationName || `Set ${collection}/${docId.slice(0, 8)}`;
        this.enqueue(name, async () => {
            const docRef = doc(db, collection, docId);
            // Sanitize data to remove undefined values (Firestore rejects them)
            const sanitizedData = sanitizeForFirestore(data);
            await setDoc(docRef, {
                ...sanitizedData,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            });
        });
    }

    async getDocument(collection: string, docId: string): Promise<any | null> {
        try {
            const docRef = doc(db, collection, docId);
            const snap = await getDoc(docRef);
            return snap.exists() ? { id: snap.id, ...snap.data() } : null;
        } catch (error) {
            console.error('[SyncManager] getDocument failed:', error);
            return null;
        }
    }

    clearError(): void {
        if (this.state.status === 'error') {
            this.updateState({ status: 'idle', lastError: null });
        }
    }
}

// Export singleton instance
export const syncManager = SyncManagerClass.getInstance();
