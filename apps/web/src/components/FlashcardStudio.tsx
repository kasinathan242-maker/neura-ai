import React, { useState, useEffect } from "react";
import { Layers, RotateCcw, Check, Sparkles, Plus, Award, Flame, Clock } from "lucide-react";
import { api } from "../services/api";
import { FlashcardDeckItem, FlashcardItem, FlashcardStats } from "../types";

export const FlashcardStudio: React.FC = () => {
  const [decks, setDecks] = useState<FlashcardDeckItem[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [stats, setStats] = useState<FlashcardStats>({
    total_reviews: 14,
    retention_rate: 92.4,
    cards_learned: 42,
    cards_due_today: 8,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [newTopicInput, setNewTopicInput] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const loadDecksAndStats = async () => {
    try {
      const [fetchedDecks, fetchedStats] = await Promise.all([
        api.getDecks(),
        api.getFlashcardStats().catch(() => null),
      ]);
      setDecks(fetchedDecks);
      if (fetchedStats) setStats(fetchedStats);

      if (fetchedDecks.length > 0 && !selectedDeckId) {
        setSelectedDeckId(fetchedDecks[0].id);
        loadDeckCards(fetchedDecks[0].id);
      }
    } catch {
      // Offline fallback
    }
  };

  const loadDeckCards = async (deckId: string) => {
    try {
      const deckDetail = await api.getDeck(deckId);
      setCards(deckDetail.cards || []);
      setCurrentCardIndex(0);
      setIsFlipped(false);
      setSelectedOption(null);
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    loadDecksAndStats();
  }, []);

  const handleDeckChange = (deckId: string) => {
    setSelectedDeckId(deckId);
    loadDeckCards(deckId);
  };

  const handleGenerateCards = async () => {
    if (!newTopicInput.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const newDeck = await api.generateFlashcards(newTopicInput.trim(), null, 4);
      setNewTopicInput("");
      await loadDecksAndStats();
      if (newDeck?.id) {
        setSelectedDeckId(newDeck.id);
        setCards(newDeck.cards || []);
      }
    } catch (err) {
      console.error("Generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRateQuality = async (quality: number) => {
    if (cards.length === 0) return;
    const currentCard = cards[currentCardIndex];

    try {
      await api.reviewFlashcard(currentCard.id, quality);
      setFeedbackMessage(
        quality >= 3 ? "Interval extended (+SM-2 spaced)" : "Card scheduled for early reinforcement"
      );
      setTimeout(() => setFeedbackMessage(null), 2500);

      // Move to next card or loop
      if (currentCardIndex + 1 < cards.length) {
        setCurrentCardIndex((prev) => prev + 1);
        setIsFlipped(false);
        setSelectedOption(null);
      } else {
        setIsFlipped(false);
        setSelectedOption(null);
        setCurrentCardIndex(0);
        await loadDecksAndStats();
      }
    } catch (err) {
      console.error("SM-2 review sync error:", err);
    }
  };

  const currentCard = cards[currentCardIndex];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Decks & Stats Sidebar */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        {/* Retention & Memory Metrics Dashboard */}
        <div className="bezel-shell">
          <div className="bezel-core p-5">
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-semibold text-white">SuperMemo SM-2 Metrics</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                  <Flame className="w-3 h-3 text-amber-400" />
                  Retention Rate
                </div>
                <div className="text-xl font-bold text-white mt-1">
                  {stats.retention_rate}%
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  Due Today
                </div>
                <div className="text-xl font-bold text-emerald-400 mt-1">
                  {stats.cards_due_today}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Decks Selection List */}
        <div className="bezel-shell">
          <div className="bezel-core p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <div className="text-xs font-semibold text-white">Curriculum Decks</div>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                {decks.length} Decks
              </span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {decks.map((deck) => {
                const isSelected = selectedDeckId === deck.id;
                return (
                  <button
                    key={deck.id}
                    onClick={() => handleDeckChange(deck.id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-colors ${
                      isSelected
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02] border border-transparent"
                    }`}
                  >
                    <span className="truncate max-w-[180px]">{deck.title}</span>
                    <span className="font-mono text-[10px] text-zinc-500 px-1.5 py-0.5 rounded bg-black/40">
                      {deck.total_cards} cards
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* NEURA-CARD Generator Input */}
        <div className="bezel-shell">
          <div className="bezel-core p-5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Generate Flashcard Deck
            </div>
            <p className="text-[11px] text-zinc-400 mb-3 leading-relaxed">
              Uses NEURA-CARD GBNF constrained grammar to produce strict university MCQs.
            </p>
            <div className="space-y-2">
              <input
                type="text"
                value={newTopicInput}
                onChange={(e) => setNewTopicInput(e.target.value)}
                placeholder="e.g. CS3301 AVL Rotations"
                className="w-full bg-[#0a0a0f] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
              />
              <button
                onClick={handleGenerateCards}
                disabled={!newTopicInput.trim() || isGenerating}
                className={`w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  newTopicInput.trim() && !isGenerating
                    ? "bg-emerald-500 text-black hover:bg-emerald-400 active:scale-[0.98]"
                    : "bg-white/[0.05] text-zinc-500 cursor-not-allowed"
                }`}
              >
                {isGenerating ? (
                  <>
                    <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Constraining Grammar...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>Generate 4 Cards</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right 3D Flashcard Interaction Stage */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        {feedbackMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {currentCard ? (
          <div className="flex flex-col gap-6">
            {/* 3D Flip Card Container */}
            <div className="perspective-1000 w-full min-h-[380px]">
              <div
                onClick={() => setIsFlipped((prev) => !prev)}
                className={`relative w-full h-full min-h-[380px] rounded-[1.75rem] transition-transform duration-700 transform-style-preserve-3d cursor-pointer select-none ${
                  isFlipped ? "rotate-y-180" : ""
                }`}
              >
                {/* Front Side: Question & Options */}
                <div className="absolute inset-0 w-full h-full backface-hidden bezel-shell">
                  <div className="bezel-core p-8 flex flex-col justify-between h-full">
                    <div>
                      <div className="flex items-center justify-between text-xs text-zinc-500 font-mono mb-4">
                        <span>Card {currentCardIndex + 1} of {cards.length}</span>
                        <span className="uppercase text-emerald-400">{currentCard.difficulty}</span>
                      </div>
                      <h3 className="text-lg font-bold text-white leading-snug mb-6">
                        {currentCard.question}
                      </h3>
                      {currentCard.options && currentCard.options.length > 0 && (
                        <div className="space-y-2.5">
                          {currentCard.options.map((opt, oIdx) => (
                            <div
                              key={oIdx}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOption(opt);
                              }}
                              className={`p-3 rounded-xl text-xs font-mono border transition-all ${
                                selectedOption === opt
                                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
                                  : "bg-white/[0.02] border-white/[0.06] text-zinc-300 hover:border-white/[0.15]"
                              }`}
                            >
                              <span className="text-zinc-500 mr-2">{String.fromCharCode(65 + oIdx)}.</span>
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                      <span>Click card or flip to see rationale</span>
                      <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                    </div>
                  </div>
                </div>

                {/* Back Side: Answer & Socratic Explanation */}
                <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 bezel-shell">
                  <div className="bezel-core p-8 flex flex-col justify-between h-full bg-[#0d0d12]">
                    <div>
                      <div className="text-xs font-mono text-emerald-400 uppercase tracking-widest mb-2">
                        Correct Answer & Socratic Proof
                      </div>
                      <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-200 text-sm font-semibold mb-4">
                        {currentCard.answer}
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed max-w-xl">
                        This follows from fundamental curriculum criteria. Regularly evaluating
                        these concepts under SM-2 intervals solidifies retention for university exams.
                      </p>
                    </div>

                    <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                      <span>Repetitions: {currentCard.repetitions}</span>
                      <span>Easiness: {currentCard.easiness_factor.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SuperMemo SM-2 Quality Rating Bar (0 to 5) */}
            <div className="bezel-shell">
              <div className="bezel-core p-4">
                <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-2 text-center">
                  Rate Recall Quality (SM-2 Interval Calculation)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  {[
                    { q: 0, label: "0: Blackout", color: "hover:border-rose-500 hover:text-rose-400" },
                    { q: 1, label: "1: Incorrect", color: "hover:border-red-400 hover:text-red-300" },
                    { q: 2, label: "2: Difficult", color: "hover:border-amber-400 hover:text-amber-300" },
                    { q: 3, label: "3: Hesitant", color: "hover:border-yellow-400 hover:text-yellow-300" },
                    { q: 4, label: "4: Good", color: "hover:border-emerald-400 hover:text-emerald-300" },
                    { q: 5, label: "5: Perfect", color: "hover:border-teal-400 hover:text-teal-300" },
                  ].map((btn) => (
                    <button
                      key={btn.q}
                      onClick={() => handleRateQuality(btn.q)}
                      className={`py-2 px-2 rounded-xl bg-white/[0.02] border border-white/[0.08] text-[11px] font-mono text-zinc-300 transition-all active:scale-95 ${btn.color}`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bezel-shell">
            <div className="bezel-core p-12 flex flex-col items-center justify-center text-center text-zinc-500 min-h-[360px]">
              <Layers className="w-12 h-12 mb-3 opacity-30" />
              <h4 className="text-sm font-semibold text-zinc-300 mb-1">No Active Cards Due</h4>
              <p className="text-xs max-w-sm mb-4">
                You have reviewed all cards in this deck or no cards have been generated yet.
                Create a deck on the left to begin your SM-2 session.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
