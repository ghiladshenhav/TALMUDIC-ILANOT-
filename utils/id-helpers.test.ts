import { describe, it, expect, vi } from 'vitest';
import { generateUUID } from './id-helpers';

describe('generateUUID', () => {
    it('should return a string', () => {
        const uuid = generateUUID();
        expect(typeof uuid).toBe('string');
    });

    it('should return a valid UUID format', () => {
        const uuid = generateUUID();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuid).toMatch(uuidRegex);
    });

    it('should be unique', () => {
        const uuid1 = generateUUID();
        const uuid2 = generateUUID();
        expect(uuid1).not.toBe(uuid2);
    });

    it('should use fallback if crypto is not available', () => {
        const originalCrypto = global.crypto;
        // @ts-ignore
        delete global.crypto;

        const uuid = generateUUID();
        expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

        global.crypto = originalCrypto;
    });
});
