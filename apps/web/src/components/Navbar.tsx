import React from "react";
import { Mic, MessageSquare, BookOpen, Layers, FileText, Activity } from "lucide-react";
import { User } from "../types";

export type NavTab = "voice" | "chat" | "documents" | "flashcards" | "notes" | "telemetry";

interface NavbarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: User | null;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onSelectTab, user }) => {
  const navItems: { id: NavTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "voice", label: "Voice Tutor", icon: Mic },
    { id: "chat", label: "Socratic Chat", icon: MessageSquare },
    { id: "documents", label: "Documents", icon: BookOpen },
    { id: "flashcards", label: "Flashcards (SM-2)", icon: Layers },
    { id: "notes", label: "Notes & Reminders", icon: FileText },
    { id: "telemetry", label: "Telemetry", icon: Activity },
  ];

  return (
    <header className="sticky top-4 z-40 w-full max-w-6xl mx-auto px-4 mb-8">
      <div className="bg-[#0c0c10]/85 backdrop-blur-xl border border-white/[0.08] rounded-full p-2 shadow-2xl flex items-center justify-between gap-2">
        {/* Brand identity mark */}
        <div 
          onClick={() => onSelectTab("voice")}
          className="flex items-center gap-3 pl-3 pr-2 cursor-pointer select-none group"
        >
          <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center font-mono font-bold text-emerald-400 group-hover:scale-105 transition-transform">
            N
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5 leading-none">
              NEURA AI
              <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
                v8
              </span>
            </div>
            <div className="text-[10px] text-zinc-500 font-medium mt-0.5">Anna Univ Assistant</div>
          </div>
        </div>

        {/* Floating navigation tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto py-1 px-1 no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-300 ${
                  isActive
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-emerald-400" : "text-zinc-400"}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User status & offline/online badge */}
        <div className="flex items-center gap-2 pr-2">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-mono text-zinc-300 truncate max-w-[120px]">
              {user ? user.full_name.split(" ")[0] : "Engineering Scholar"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
