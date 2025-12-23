import React, { useState } from 'react';
import { Plus, Search, Edit3, Trash2, Save, FileText } from 'lucide-react';
import clsx from 'clsx';

export const Notes = () => {
    const [notes, setNotes] = useState([
        { id: 1, title: 'Quantum Physics Formulas', content: 'Schrodinger equation: HΨ = EΨ...', date: '2 hours ago', tag: 'Physics' },
        { id: 2, title: 'React Hooks Summary', content: 'useEffect runs after render. useMemo caches values...', date: 'Yesterday', tag: 'Coding' },
    ]);
    const [activeNote, setActiveNote] = useState(null);
    const [isEditing, setIsEditing] = useState(false);

    const handleSave = () => {
        if (activeNote) {
            if (notes.find(n => n.id === activeNote.id)) {
                setNotes(notes.map(n => n.id === activeNote.id ? activeNote : n));
            } else {
                setNotes([activeNote, ...notes]);
            }
            setIsEditing(false);
        }
    };

    const createNewNote = () => {
        const newNote = { id: Date.now(), title: 'Untitled Note', content: '', date: 'Just now', tag: 'General' };
        setActiveNote(newNote);
        setIsEditing(true);
    };

    return (
        <div className="flex h-[calc(100vh-6rem)] animate-in fade-in zoom-in-95 duration-500 gap-6">

            {/* Sidebar List */}
            <div className="w-80 flex flex-col gap-4 shrink-0">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-white">Notes</h1>
                    <button
                        onClick={createNewNote}
                        className="p-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg transition-colors"
                    >
                        <Plus size={20} />
                    </button>
                </div>

                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        placeholder="Search notes..."
                        className="w-full bg-[#0e0e12] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/50"
                    />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {notes.map(note => (
                        <div
                            key={note.id}
                            onClick={() => { setActiveNote(note); setIsEditing(false); }}
                            className={clsx(
                                "p-4 rounded-xl cursor-pointer border transition-all",
                                activeNote?.id === note.id
                                    ? "bg-cyan-500/10 border-cyan-500/50"
                                    : "bg-[#0e0e12] border-white/5 hover:border-white/10 hover:bg-white/5"
                            )}
                        >
                            <h3 className={clsx("font-bold mb-1 truncate", activeNote?.id === note.id ? "text-cyan-400" : "text-white")}>{note.title}</h3>
                            <p className="text-xs text-gray-500 truncate mb-2">{note.content || "No content"}</p>
                            <div className="flex justify-between items-center text-xs text-gray-600">
                                <span>{note.date}</span>
                                <span className="px-1.5 py-0.5 bg-white/5 rounded text-gray-400">{note.tag}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col bg-[#0e0e12] rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
                {activeNote ? (
                    <>
                        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.02]">
                            {isEditing ? (
                                <input
                                    value={activeNote.title}
                                    onChange={e => setActiveNote({ ...activeNote, title: e.target.value })}
                                    className="bg-transparent text-xl font-bold text-white focus:outline-none w-full"
                                    placeholder="Note Title"
                                />
                            ) : (
                                <h2 className="text-xl font-bold text-white">{activeNote.title}</h2>
                            )}

                            <div className="flex items-center gap-2">
                                {isEditing ? (
                                    <button
                                        onClick={handleSave}
                                        className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-sm font-bold transition-colors"
                                    >
                                        <Save size={16} /> Save
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors"
                                    >
                                        <Edit3 size={16} /> Edit
                                    </button>
                                )}
                                <button className="p-2 text-gray-500 hover:text-red-400 transition-colors">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                        <textarea
                            value={activeNote.content}
                            readOnly={!isEditing}
                            onChange={e => setActiveNote({ ...activeNote, content: e.target.value })}
                            placeholder="Start typing your note here..."
                            className={clsx(
                                "flex-1 w-full bg-transparent p-6 text-gray-300 focus:outline-none resize-none leading-relaxed",
                                !isEditing && "cursor-default"
                            )}
                        />
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                        <FileText size={48} className="mb-4 opacity-50" />
                        <p className="text-lg">Select a note or create a new one</p>
                    </div>
                )}
            </div>
        </div>
    );
};
