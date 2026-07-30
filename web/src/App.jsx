import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundary, Spinner } from './components/ui';
import { useStore } from './store/useStore';

import { Home } from './pages/Home';
import { Chat } from './pages/Chat';
import { Study } from './pages/Study';
import { Coding } from './pages/Coding';
import { PDF } from './pages/PDF';
import { Tasks } from './pages/Tasks';
import { Flashcards } from './pages/Flashcards';
import { Notes } from './pages/Notes';
import { Settings } from './pages/Settings';
import { Themes } from './pages/Themes';
import { Languages } from './pages/Languages';
import { Agents } from './pages/Agents';
import { Vision } from './pages/Vision';
import { Memory } from './pages/Memory';
import { Voice } from './pages/Voice';

/**
 * Spatial and Local AI are code-split: three-js/WebXR and the WebLLM runtime are
 * the two heaviest dependencies in the app, and most sessions never open either.
 * Loading them lazily keeps the initial bundle small.
 */
const Spatial = lazy(() => import('./pages/Spatial'));
const LocalAI = lazy(() => import('./pages/LocalAI'));

const NotFound = () => (
    <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="accent-text text-5xl font-bold">404</p>
        <h1 className="text-app mt-3 text-xl font-semibold">That page does not exist</h1>
        <Link to="/" className="accent-text mt-4 text-sm underline">
            Back to the dashboard
        </Link>
    </div>
);

function App() {
    const theme = useStore((s) => s.theme);
    const language = useStore((s) => s.language);

    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('theme-light', 'theme-neon', 'theme-aurora');
        if (theme && theme !== 'neural-dark') root.classList.add(`theme-${theme}`);

        // Keep the mobile browser chrome in step with the active theme.
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute(
                'content',
                getComputedStyle(root).getPropertyValue('--bg-primary').trim() || '#0a0a0f',
            );
        }
    }, [theme]);

    useEffect(() => {
        document.documentElement.lang = language?.split('-')[0] || 'en';
    }, [language]);

    return (
        <BrowserRouter>
            <Layout>
                <ErrorBoundary>
                    <Suspense fallback={<Spinner label="Loading module…" />}>
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/chat" element={<Chat />} />
                            <Route path="/voice" element={<Voice />} />
                            <Route path="/vision" element={<Vision />} />
                            <Route path="/study" element={<Study />} />
                            <Route path="/agents" element={<Agents />} />
                            <Route path="/memory" element={<Memory />} />
                            <Route path="/spatial" element={<Spatial />} />
                            <Route path="/pdf" element={<PDF />} />
                            <Route path="/coding" element={<Coding />} />
                            <Route path="/flashcards" element={<Flashcards />} />
                            <Route path="/tasks" element={<Tasks />} />
                            <Route path="/notes" element={<Notes />} />
                            <Route path="/local-ai" element={<LocalAI />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="/themes" element={<Themes />} />
                            <Route path="/languages" element={<Languages />} />
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </Suspense>
                </ErrorBoundary>
            </Layout>
        </BrowserRouter>
    );
}

export default App;
