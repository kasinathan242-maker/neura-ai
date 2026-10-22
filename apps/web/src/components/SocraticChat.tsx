import React, { useState, useRef, useEffect } from "react";
import { Square, Sparkles, BookOpen, ChevronRight, CornerDownLeft } from "lucide-react";
import { api } from "../services/api";
import { ChatMessageItem, Citation, DocumentItem } from "../types";

export const SocraticChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessageItem[]>([
    {
      role: "assistant",
      content:
        "Vanakkam! I am your Socratic AI Engineering Mentor. Instead of simply handing you solutions, I guide you step-by-step through first principles so you excel in Anna University university exams and technical interviews. Which subject or concept are we exploring?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState("CS3301");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Load existing documents for grounding
    api.getDocuments()
      .then((docs) => setDocuments(docs))
      .catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const subjects = [
    { code: "CS3301", name: "Data Structures" },
    { code: "CS3452", name: "Theory of Computation" },
    { code: "CS3401", name: "Algorithms" },
    { code: "EC3354", name: "Signals & Systems" },
    { code: "GE3151", name: "Python Programming" },
  ];

  const socraticSuggestions = [
    "What is the recurrence relation for MergeSort and how does Master Theorem solve it?",
    "Can you ask me a guiding question about Dijkstra vs Bellman-Ford?",
    "Explain P vs NP with an intuitive Tamil analogy (Tanglish)?",
    "Give me an Anna University 2-mark answer for AVL tree rotation with an example.",
  ];

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isStreaming) return;

    setInputText("");
    const userMessage: ChatMessageItem = {
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);

    const assistantPlaceholder: ChatMessageItem = {
      role: "assistant",
      content: "",
      citations: [],
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, assistantPlaceholder]);

    await api.streamChat(
      text,
      selectedDocId,
      null,
      (token: string) => {
        setMessages((prev) => {
          const next = [...prev];
          const lastIndex = next.length - 1;
          next[lastIndex] = {
            ...next[lastIndex],
            content: next[lastIndex].content + token,
          };
          return next;
        });
      },
      (citations: Citation[]) => {
        setMessages((prev) => {
          const next = [...prev];
          const lastIndex = next.length - 1;
          next[lastIndex] = {
            ...next[lastIndex],
            citations: citations,
          };
          return next;
        });
      },
      () => {
        setIsStreaming(false);
      },
      (err: Error) => {
        setIsStreaming(false);
        setMessages((prev) => {
          const next = [...prev];
          const lastIndex = next.length - 1;
          next[lastIndex] = {
            ...next[lastIndex],
            content:
              next[lastIndex].content ||
              `Apologies, connection to the inference cluster encountered an error: ${err.message}. Retrying or asking in simpler terms might help.`,
          };
          return next;
        });
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const stopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsStreaming(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Subject Navigator & Grounding Sidebar */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        {/* Anna University Curricula Subject Selector */}
        <div className="bezel-shell">
          <div className="bezel-core p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <div className="text-xs font-semibold text-white">Anna University (Reg 2021)</div>
            </div>
            <div className="space-y-1.5">
              {subjects.map((sub) => {
                const isSelected = selectedSubject === sub.code;
                return (
                  <button
                    key={sub.code}
                    onClick={() => setSelectedSubject(sub.code)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all text-xs ${
                      isSelected
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border border-transparent"
                    }`}
                  >
                    <div>
                      <span className="font-mono text-zinc-500 mr-2">{sub.code}</span>
                      <span>{sub.name}</span>
                    </div>
                    {isSelected && <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Grounding Knowledge Document Selector */}
        <div className="bezel-shell">
          <div className="bezel-core p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <div className="text-xs font-semibold text-white">Grounding Documents</div>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                {documents.length} available
              </span>
            </div>
            {documents.length === 0 ? (
              <p className="text-xs text-zinc-500 italic p-2">
                No custom syllabus PDFs uploaded yet. NEURA AI will answer from general curriculum weights.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                <button
                  onClick={() => setSelectedDocId(null)}
                  className={`w-full text-left p-2 rounded-xl text-xs transition-colors ${
                    selectedDocId === null
                      ? "bg-white/[0.08] text-white font-medium"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  All Curricula (Global Search)
                </button>
                {documents.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => setSelectedDocId(doc.id)}
                    className={`w-full text-left p-2 rounded-xl text-xs truncate transition-colors ${
                      selectedDocId === doc.id
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {doc.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Socratic Practice Prompts */}
        <div className="bezel-shell">
          <div className="bezel-core p-5">
            <div className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Socratic Dialogue Starters
            </div>
            <div className="space-y-2">
              {socraticSuggestions.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(prompt)}
                  className="w-full text-left p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[11px] text-zinc-400 hover:text-emerald-300 hover:border-emerald-500/30 transition-all leading-relaxed"
                >
                  "{prompt}"
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Conversational Stream Column */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        {/* Chat Stream Viewport */}
        <div className="bezel-shell">
          <div className="bezel-core p-6 flex flex-col h-[520px]">
            <div className="flex-1 overflow-y-auto space-y-5 pr-2">
              {messages.map((msg, idx) => {
                const isAssistant = msg.role === "assistant";
                return (
                  <div
                    key={idx}
                    className={`flex flex-col ${isAssistant ? "items-start" : "items-end"}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl p-4 text-sm leading-relaxed ${
                        isAssistant
                          ? "bg-white/[0.035] text-zinc-200 border border-white/[0.07]"
                          : "bg-emerald-600/20 text-emerald-100 border border-emerald-500/30"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>

                      {/* Grounding Citations Pills */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-white/[0.08] flex flex-wrap gap-2 items-center">
                          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                            Sources:
                          </span>
                          {msg.citations.map((cite, cIdx) => (
                            <button
                              key={cIdx}
                              onClick={() => setActiveCitation(cite)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.1] hover:border-emerald-500/40 text-[11px] font-mono text-emerald-400 hover:text-emerald-300 transition-colors"
                            >
                              <BookOpen className="w-3 h-3" />
                              <span>
                                {cite.document_title || "Doc"} p.{cite.page_number}
                              </span>
                              <span className="text-zinc-500 text-[9px]">
                                ({Math.round(cite.similarity_score * 100)}%)
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-600 font-mono mt-1 px-1">
                      {isAssistant ? "NEURA AI" : "You"} · {msg.timestamp}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Composer */}
            <div className="mt-4 pt-4 border-t border-white/[0.06] relative">
              <div className="relative rounded-2xl bg-[#0a0a0f] border border-white/[0.1] focus-within:border-emerald-500/50 transition-colors p-2">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Ask a question or explain your reasoning (${selectedSubject})...`}
                  rows={2}
                  className="w-full bg-transparent text-sm text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none p-2"
                />
                <div className="flex items-center justify-between px-2 pt-1 border-t border-white/[0.04]">
                  <div className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                    <span>Press</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400 text-[9px]">
                      Enter ↵
                    </kbd>
                    <span>to ask</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isStreaming ? (
                      <button
                        onClick={stopStreaming}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-medium hover:bg-rose-500/30 transition-colors"
                      >
                        <Square className="w-3 h-3 fill-rose-300" />
                        <span>Halt</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSendMessage()}
                        disabled={!inputText.trim()}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                          inputText.trim()
                            ? "bg-emerald-500 text-black hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95"
                            : "bg-white/[0.05] text-zinc-500 cursor-not-allowed"
                        }`}
                      >
                        <span>Send</span>
                        <CornerDownLeft className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Citation Detail Drawer if clicked */}
        {activeCitation && (
          <div className="p-4 rounded-2xl bg-[#0f0f15] border border-emerald-500/30 text-zinc-300 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Grounding Chunk — {activeCitation.document_title} (Page {activeCitation.page_number})</span>
              </div>
              <button
                onClick={() => setActiveCitation(null)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Dismiss
              </button>
            </div>
            <p className="text-xs font-mono text-zinc-400 bg-black/40 p-3 rounded-xl border border-white/[0.05] leading-relaxed">
              "{activeCitation.snippet}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
