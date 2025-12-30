/**
 * Author portrait storage utility
 * Handles uploading author portrait images to Firebase Storage
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

/**
 * Normalize author name for use as filename
 * Removes special characters, converts to lowercase with underscores
 */
function normalizeAuthorName(name: string): string {
    return name
        .toLowerCase()
        .replace(/['"]/g, '')           // Remove quotes
        .replace(/\s+/g, '_')           // Spaces to underscores
        .replace(/[^\w\u0590-\u05FF]/g, '') // Keep alphanumeric and Hebrew
        .replace(/_+/g, '_')            // Collapse multiple underscores
        .replace(/^_|_$/g, '');         // Trim underscores
}

/**
 * Get file extension from File object
 */
function getFileExtension(file: File): string {
    const name = file.name;
    const lastDot = name.lastIndexOf('.');
    if (lastDot === -1) return 'png'; // Default to png
    return name.substring(lastDot + 1).toLowerCase();
}

/**
 * Upload an author portrait to Firebase Storage
 * @param authorName - The author's name (used to generate filename)
 * @param file - The image file to upload
 * @returns The public download URL for the uploaded image
 */
export async function uploadAuthorPortrait(
    authorName: string,
    file: File
): Promise<string> {
    // Validate file type
    if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image');
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        throw new Error('Image must be smaller than 5MB');
    }

    // Generate storage path
    const normalizedName = normalizeAuthorName(authorName);
    const extension = getFileExtension(file);
    const timestamp = Date.now(); // Add timestamp to avoid caching issues
    const storagePath = `author-portraits/${normalizedName}_${timestamp}.${extension}`;

    // Create storage reference
    const storageRef = ref(storage, storagePath);

    // Upload the file
    const snapshot = await uploadBytes(storageRef, file, {
        contentType: file.type,
        customMetadata: {
            authorName: authorName,
            uploadedAt: new Date().toISOString()
        }
    });

    // Get and return the download URL
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
}

/**
 * Validate if a file is an acceptable image
 */
export function isValidImageFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    return validTypes.includes(file.type);
}
