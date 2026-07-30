import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Vite configuration.
 *
 * The dev proxy is the reason no source file needs an absolute API URL: in
 * development `/api` is forwarded to the local FastAPI server, and in production
 * Vercel rewrites the same path to the Python Function. One code path, no
 * environment branching.
 */

/** Forwards /api to the local FastAPI server, preserving SSE streaming. */
function devProxy() {
    return {
        '/api': {
            target: process.env.VITE_DEV_API ?? 'http://127.0.0.1:8001',
            changeOrigin: true,
            ws: false,
            configure: (proxy) => {
                proxy.on('proxyRes', (proxyRes) => {
                    // A forwarded content-length would make the proxy buffer the
                    // whole SSE response, defeating token-by-token streaming.
                    delete proxyRes.headers['content-length'];
                });
            },
        },
    };
}
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            manifest: {
                name: 'NEURA AI',
                short_name: 'NEURA',
                description: 'Agentic, multimodal AI study companion',
                theme_color: '#0a0a0f',
                background_color: '#0a0a0f',
                display: 'standalone',
                orientation: 'portrait',
                start_url: '/',
                icons: [
                    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            workbox: {
                // The WebLLM model shards are hundreds of megabytes and manage their
                // own Cache Storage; precaching them would be catastrophic.
                globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
                // Two large chunks are deliberately kept out of the precache.
                // Both are reached only through a dynamic import, so excluding
                // them costs nothing and stops a first visit from downloading
                // ~12MB it will probably never use:
                //   xr-emulator*  the IWER WebXR emulator (localhost only)
                //   webllm*       the on-device inference runtime (opt-in)
                // `manualChunks` below gives them these exact names, so the
                // patterns cannot accidentally match application code.
                globIgnores: ['**/xr-emulator*.js', '**/webllm-*.js'],
                maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
                navigateFallbackDenylist: [/^\/api\//],
                runtimeCaching: [
                    {
                        // Never serve a stale AI answer from the cache.
                        urlPattern: /\/api\/.*/,
                        handler: 'NetworkOnly',
                    },
                ],
            },
            devOptions: { enabled: false },
        }),
    ],

    server: { port: 5173, proxy: devProxy() },
    // `preview` serves the built bundle; it needs the same proxy so a production
    // build can be exercised locally exactly as it behaves on Vercel.
    preview: { port: 4173, proxy: devProxy() },

    build: {
        target: 'es2022',
        sourcemap: false,
        // three.js alone exceeds the default warning limit; the heavy pages are
        // already code-split, so the warning would only be noise.
        chunkSizeWarningLimit: 1600,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    // Everything the WebXR emulator drags in (`@iwer/sem` alone is
                    // ~6MB of synthetic room captures) gets one predictable name so
                    // the service worker can skip precaching it. These chunks are
                    // reachable only through a dynamic import that the emulator
                    // triggers on localhost, so production never fetches them.
                    if (id.includes('@iwer') || id.includes('iwer/lib')) return 'xr-emulator-iwer';
                    if (id.includes('@pmndrs/xr/dist/emulate')) return 'xr-emulator';

                    // The on-device inference runtime, ~6MB of WebGPU/wasm glue.
                    // Only fetched when someone opens Local AI and loads a model.
                    if (id.includes('@mlc-ai/web-llm')) return 'webllm-runtime';

                    if (/node_modules[\\/](react|react-dom|react-router)[\\/]/.test(id)) {
                        return 'react';
                    }
                    if (/node_modules[\\/](three|@react-three)[\\/]/.test(id)) {
                        return 'three';
                    }
                    return undefined;
                },
            },
        },
    },

    optimizeDeps: {
        // WebLLM is loaded via dynamic import at runtime; pre-bundling it would
        // pull a very large dependency into every dev server start.
        exclude: ['@mlc-ai/web-llm'],
    },
});
