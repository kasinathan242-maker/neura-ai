import { useState, useEffect } from "react";
import { Navbar, NavTab } from "./components/Navbar";
import { VoiceTutor } from "./components/VoiceTutor";
import { SocraticChat } from "./components/SocraticChat";
import { DocumentHub } from "./components/DocumentHub";
import { FlashcardStudio } from "./components/FlashcardStudio";
import { StudyOrganizer } from "./components/StudyOrganizer";
import { SystemTelemetry } from "./components/SystemTelemetry";
import { api } from "./services/api";
import { User } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>("voice");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Authenticate guest session
    api.ensureAuthenticated().then(() => {
      setUser(api.getUser());
    });
  }, []);

  return (
    <div className="min-h-[100dvh] ambient-glow bg-[#050505] text-[#f4f4f6] px-4 sm:px-6 py-6 max-w-7xl mx-auto flex flex-col justify-between">
      {/* Floating Island Navigation Header */}
      <Navbar activeTab={activeTab} onSelectTab={setActiveTab} user={user} />

      {/* Main Tab Views Stage */}
      <main className="flex-1 w-full max-w-6xl mx-auto my-4 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
        {activeTab === "voice" && <VoiceTutor />}
        {activeTab === "chat" && <SocraticChat />}
        {activeTab === "documents" && <DocumentHub />}
        {activeTab === "flashcards" && <FlashcardStudio />}
        {activeTab === "notes" && <StudyOrganizer />}
        {activeTab === "telemetry" && <SystemTelemetry />}
      </main>

      {/* Agency-Grade System Footer */}
      <footer className="w-full max-w-6xl mx-auto mt-16 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 font-mono">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>NEURA AI v8 · Fully Self-Hosted · Anna University Reg 2021</span>
        </div>
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveTab("telemetry")}
            className="hover:text-emerald-400 transition-colors"
          >
            Cluster Telemetry
          </button>
          <a
            href="tel:14416"
            className="text-zinc-400 hover:text-emerald-400 transition-colors"
          >
            Crisis Support: 14416
          </a>
        </div>
      </footer>
    </div>
  );
}
