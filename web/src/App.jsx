import React, { useEffect } from 'react';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Chat } from './pages/Chat';
import { Study } from './pages/Study';
import { Coding } from './pages/Coding';
import { PDF } from './pages/PDF';
import { Tasks } from './pages/Tasks';
import { Voice } from './pages/Voice';
import { Flashcards } from './pages/Flashcards';
import { Notes } from './pages/Notes';
import { Settings } from './pages/Settings';
import { Themes } from './pages/Themes';
import { Languages } from './pages/Languages';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useStore } from './store/useStore';

function App() {
  const { connectSocket, theme } = useStore();

  useEffect(() => {
    connectSocket();
  }, [connectSocket]);

  useEffect(() => {
    // Remove all previous theme classes
    document.documentElement.classList.remove('theme-light', 'theme-neon', 'theme-aurora');
    // Add active theme class if not default 'neural-dark'
    if (theme && theme !== 'neural-dark') {
      document.documentElement.classList.add(`theme-${theme}`);
    }
  }, [theme]);

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/voice" element={<Voice />} />
          <Route path="/study" element={<Study />} />
          <Route path="/pdf" element={<PDF />} />
          <Route path="/coding" element={<Coding />} />
          <Route path="/flashcards" element={<Flashcards />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/themes" element={<Themes />} />
          <Route path="/languages" element={<Languages />} />
          <Route path="*" element={<div className="flex h-full items-center justify-center text-gray-500">404 | Page not found</div>} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
