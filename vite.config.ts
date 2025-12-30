/// <reference types="vitest" />
import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    server: {
        port: 3001,
        host: '0.0.0.0',
        // Proxy Sefaria API to bypass CORS
        proxy: {
            '/api/sefaria': {
                target: 'https://www.sefaria.org',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/sefaria/, '/api'),
                secure: true
            },
            // Proxy Ben Yehuda website to bypass CORS
            '/api/benyehuda-read': {
                target: 'https://benyehuda.org',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/benyehuda-read/, '/read'),
                secure: true
            }
        }
    },
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        }
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
    }
});
