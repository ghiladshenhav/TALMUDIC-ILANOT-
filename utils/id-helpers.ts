/**
 * Generates a UUID v4.
 * Uses crypto.randomUUID if available, otherwise falls back to a manual implementation.
 * This ensures the application doesn't crash in environments where crypto is not available (e.g., some older browsers or non-secure contexts).
 */
export const generateUUID = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    // Fallback for environments where crypto.randomUUID is not available
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};
