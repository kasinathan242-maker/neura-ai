import React, { useState, useEffect } from "react";
import { FileText, Bell, Plus, Trash2, Calendar, Tag } from "lucide-react";
import { api } from "../services/api";
import { NoteItem, ReminderItem } from "../types";

export const StudyOrganizer: React.FC = () => {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);

  // Note form state
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteTags, setNoteTags] = useState("#CS3301 #AnnaUniv");

  // Reminder form state
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderMsg, setReminderMsg] = useState("");
  const [reminderTime, setReminderTime] = useState("");

  const [activeTab, setActiveTab] = useState<"notes" | "reminders">("notes");

  const loadData = async () => {
    try {
      const [fetchedNotes, fetchedReminders] = await Promise.all([
        api.getNotes(),
        api.getReminders(),
      ]);
      setNotes(fetchedNotes);
      setReminders(fetchedReminders);
    } catch {
      // Offline fallback
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;
    try {
      const newNote = await api.createNote(noteTitle.trim(), noteContent.trim(), noteTags.trim());
      setNotes((prev) => [newNote, ...prev]);
      setNoteTitle("");
      setNoteContent("");
    } catch (err) {
      console.error("Create note failed:", err);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await api.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error("Delete note failed:", err);
    }
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderTitle.trim() || !reminderTime) return;
    try {
      const newRem = await api.createReminder(
        reminderTitle.trim(),
        reminderMsg.trim() || "Review assigned syllabus concepts.",
        new Date(reminderTime).toISOString()
      );
      setReminders((prev) => [newRem, ...prev]);
      setReminderTitle("");
      setReminderMsg("");
      setReminderTime("");
    } catch (err) {
      console.error("Create reminder failed:", err);
    }
  };

  const handleDeleteReminder = async (id: string) => {
    try {
      await api.deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Delete reminder failed:", err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Switcher & Form Column */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        {/* Sub-tab Pill Switcher */}
        <div className="bezel-shell">
          <div className="bezel-core p-2 flex gap-2">
            <button
              onClick={() => setActiveTab("notes")}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                activeTab === "notes"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/35"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Syllabus Notes</span>
            </button>
            <button
              onClick={() => setActiveTab("reminders")}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                activeTab === "reminders"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/35"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Study Reminders</span>
            </button>
          </div>
        </div>

        {/* Dynamic Creation Form */}
        <div className="bezel-shell">
          <div className="bezel-core p-6">
            {activeTab === "notes" ? (
              <form onSubmit={handleCreateNote} className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-semibold text-white">Create Exam Note</h3>
                </div>
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 mb-1 block">Title</label>
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="e.g. Master Theorem 3 Cases Summary"
                    className="w-full bg-[#0a0a0f] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 mb-1 block">Content</label>
                  <textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Record proof, formulas, or key definitions..."
                    rows={4}
                    className="w-full bg-[#0a0a0f] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50 resize-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 mb-1 block">Tags</label>
                  <input
                    type="text"
                    value={noteTags}
                    onChange={(e) => setNoteTags(e.target.value)}
                    placeholder="#CS3401 #Unit2"
                    className="w-full bg-[#0a0a0f] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!noteTitle.trim() || !noteContent.trim()}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 text-black text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-emerald-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save Note</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleCreateReminder} className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Bell className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-semibold text-white">Schedule Study Reminder</h3>
                </div>
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 mb-1 block">Subject / Objective</label>
                  <input
                    type="text"
                    value={reminderTitle}
                    onChange={(e) => setReminderTitle(e.target.value)}
                    placeholder="e.g. CS3452 Chomsky Normal Form Review"
                    className="w-full bg-[#0a0a0f] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 mb-1 block">Notes / Context</label>
                  <input
                    type="text"
                    value={reminderMsg}
                    onChange={(e) => setReminderMsg(e.target.value)}
                    placeholder="Review SM-2 deck cards before bed"
                    className="w-full bg-[#0a0a0f] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-zinc-400 mb-1 block">Scheduled Date & Time</label>
                  <input
                    type="datetime-local"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                    className="w-full bg-[#0a0a0f] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!reminderTitle.trim() || !reminderTime}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 text-black text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-emerald-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Set Reminder</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* List Column */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        <div className="bezel-shell">
          <div className="bezel-core p-6 min-h-[460px]">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <h3 className="text-sm font-semibold text-white">
                {activeTab === "notes" ? "Syllabus Notes Repository" : "Active Spaced Reminders"}
              </h3>
              <span className="text-xs font-mono text-zinc-500">
                {activeTab === "notes" ? `${notes.length} Notes` : `${reminders.length} Reminders`}
              </span>
            </div>

            {activeTab === "notes" ? (
              notes.length === 0 ? (
                <div className="text-center py-16 text-zinc-500">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No notes saved yet. Capture formulas or proofs on the left.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-white mb-1">{note.title}</h4>
                        <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed mb-3">
                          {note.content}
                        </p>
                        {note.tags && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
                            <Tag className="w-3 h-3" />
                            <span>{note.tags}</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : reminders.length === 0 ? (
              <div className="text-center py-16 text-zinc-500">
                <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No active study reminders. Schedule an upcoming review.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {reminders.map((rem) => (
                  <div
                    key={rem.id}
                    className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-colors flex items-start justify-between gap-3"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">{rem.title}</h4>
                      <p className="text-xs text-zinc-400 mb-2">{rem.message}</p>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                        <Calendar className="w-3 h-3 text-emerald-400" />
                        <span>{new Date(rem.scheduled_time).toLocaleString()}</span>
                        <span>·</span>
                        <span className={rem.is_sent ? "text-zinc-500" : "text-emerald-400"}>
                          {rem.is_sent ? "Completed" : "Scheduled"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteReminder(rem.id)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
