import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    globalIgnores(['dist', 'dev-dist', 'android']),

    {
        files: ['**/*.{js,jsx}'],
        extends: [
            js.configs.recommended,
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            globals: globals.browser,
            parserOptions: {
                ecmaVersion: 'latest',
                ecmaFeatures: { jsx: true },
                sourceType: 'module',
            },
        },
        rules: {
            // Empty catch blocks are used deliberately where a failure is not
            // actionable (an unsupported browser API, a best-effort cleanup).
            'no-unused-vars': [
                'error',
                { varsIgnorePattern: '^[A-Z_]', caughtErrors: 'none', argsIgnorePattern: '^_' },
            ],
        },
    },

    {
        // Build and lint config run in Node, not the browser.
        files: ['*.config.js'],
        languageOptions: { globals: { ...globals.node } },
    },
]);
