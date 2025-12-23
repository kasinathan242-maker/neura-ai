import React, { useState } from 'react';
import { Plus, Shuffle, ArrowLeft, ArrowRight, CreditCard as CardIcon } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';

export const Flashcards = () => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newCard, setNewCard] = useState({ question: '', answer: '', tag: 'General', type: 'Concept' });

    const [cards, setCards] = useState([
        {
            id: 1,
            question: "What is the time complexity of binary search?",
            answer: "O(log n)",
            tag: "Algorithms",
            type: "Question"
        },
        {
            id: 2,
            question: "What is a closure in JavaScript?",
            answer: "A closure is the combination of a function bundled together (enclosed) with references to its surrounding state (the lexical environment).",
            tag: "JavaScript",
            type: "Concept"
        },
        {
            id: 3,
            question: "Explain the virtual DOM.",
            answer: "A lightweight copy of the actual DOM in memory. React uses it to calculate the most efficient way to update the browser's DOM.",
            tag: "React",
            type: "Concept"
        }
    ]);

    const handleNext = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentIndex((prev) => (prev + 1) % cards.length), 150);
    };

    const handlePrev = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length), 150);
    };

    const handleAddCard = () => {
        if (!newCard.question.trim() || !newCard.answer.trim()) return;
        setCards([...cards, { ...newCard, id: Date.now() }]);
        setNewCard({ question: '', answer: '', tag: 'General', type: 'Concept' });
        setShowAddModal(false);
    };

    const currentCard = cards[currentIndex];

    return (
        <div className="flex flex-col gap-8 animate-in fade-in zoom-in-95 duration-500 max-w-4xl mx-auto w-full pb-8 h-[calc(100vh-6rem)] relative">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-3">
                        Flashcards <span className="text-lg font-normal text-gray-500">{cards.length} cards • Card {currentIndex + 1} of {cards.length}</span>
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                        <Shuffle size={18} /> Shuffle
                    </button>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-xl shadow-lg shadow-cyan-500/20 transition-all"
                    >
                        <Plus size={18} /> Add Card
                    </button>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-4">
                <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-300"
                    style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
                />
            </div>

            {/* Flashcard Area */}
            <div className="flex-1 flex flex-col items-center justify-center perspective-1000 relative">
                <div
                    className="relative w-full max-w-3xl aspect-[16/9] cursor-pointer group"
                    onClick={() => setIsFlipped(!isFlipped)}
                >
                    <motion.div
                        initial={false}
                        animate={{ rotateX: isFlipped ? 180 : 0 }}
                        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                        className="w-full h-full relative preserve-3d"
                        style={{ transformStyle: 'preserve-3d' }}
                    >
                        {/* Front */}
                        <div className="absolute inset-0 backface-hidden flex flex-col items-center justify-center p-12 rounded-3xl bg-[#0e0e12] border-2 border-orange-500/20 shadow-[0_0_50px_rgba(249,115,22,0.1)] group-hover:border-orange-500/40 transition-colors">
                            <div className="absolute top-6 left-6 flex items-center gap-3">
                                <span className="px-3 py-1 bg-white/5 rounded-lg text-xs font-medium text-gray-400 border border-white/5">{currentCard.tag}</span>
                            </div>
                            <div className="absolute top-6 right-6">
                                <span className="px-3 py-1 bg-white/5 rounded-lg text-xs font-medium text-gray-400 border border-white/5">{currentCard.type}</span>
                            </div>

                            <h2 className="text-3xl md:text-4xl font-bold text-white text-center leading-tight">
                                {currentCard.question}
                            </h2>

                            <p className="absolute bottom-8 text-sm text-gray-500 uppercase tracking-widest font-medium">Click to reveal answer</p>
                        </div>

                        {/* Back */}
                        <div
                            className="absolute inset-0 backface-hidden flex flex-col items-center justify-center p-12 rounded-3xl bg-[#0e0e12] border-2 border-cyan-500/20 shadow-[0_0_50px_rgba(6,182,212,0.1)] rotate-x-180"
                            style={{ transform: 'rotateX(180deg)', backfaceVisibility: 'hidden' }}
                        >
                            <div className="absolute top-6 right-6 text-cyan-500">
                                <CardIcon size={24} />
                            </div>

                            <p className="text-xl md:text-2xl text-gray-200 text-center leading-relaxed">
                                {currentCard.answer}
                            </p>

                            <p className="absolute bottom-8 text-sm text-cyan-500 uppercase tracking-widest font-medium">Click to flip back</p>
                        </div>
                    </motion.div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-6 mt-12">
                    <button
                        onClick={handlePrev}
                        className="p-4 rounded-2xl bg-[#0e0e12] border border-white/10 hover:border-cyan-500/50 hover:text-cyan-400 text-white transition-all group"
                    >
                        <ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
                    </button>

                    <div className="flex gap-2">
                        {cards.map((_, idx) => (
                            <div
                                key={idx}
                                className={clsx(
                                    "w-2.5 h-2.5 rounded-full transition-all",
                                    idx === currentIndex ? "bg-cyan-500 scale-125" : "bg-white/10"
                                )}
                            />
                        ))}
                    </div>

                    <button
                        onClick={handleNext}
                        className="p-4 rounded-2xl bg-[#0e0e12] border border-white/10 hover:border-cyan-500/50 hover:text-cyan-400 text-white transition-all group"
                    >
                        <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>

            {/* Add Card Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[#1a1a1f] border border-white/10 rounded-2xl p-6 w-full max-w-md animate-in fade-in zoom-in-95">
                        <h2 className="text-xl font-bold text-white mb-4">Add New Flashcard</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Question</label>
                                <input
                                    value={newCard.question}
                                    onChange={e => setNewCard({ ...newCard, question: e.target.value })}
                                    className="w-full bg-[#0e0e12] border border-white/10 rounded-xl px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                                    placeholder="Enter question"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Answer</label>
                                <textarea
                                    value={newCard.answer}
                                    onChange={e => setNewCard({ ...newCard, answer: e.target.value })}
                                    className="w-full bg-[#0e0e12] border border-white/10 rounded-xl px-4 py-2 text-white focus:border-cyan-500 focus:outline-none h-24 resize-none"
                                    placeholder="Enter answer"
                                />
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-sm text-gray-400 mb-1">Tag</label>
                                    <input
                                        value={newCard.tag}
                                        onChange={e => setNewCard({ ...newCard, tag: e.target.value })}
                                        className="w-full bg-[#0e0e12] border border-white/10 rounded-xl px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm text-gray-400 mb-1">Type</label>
                                    <select
                                        value={newCard.type}
                                        onChange={e => setNewCard({ ...newCard, type: e.target.value })}
                                        className="w-full bg-[#0e0e12] border border-white/10 rounded-xl px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                                    >
                                        <option>Concept</option>
                                        <option>Question</option>
                                        <option>Code</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddCard}
                                    className="flex-1 py-2 rounded-xl bg-cyan-500 text-black font-semibold hover:bg-cyan-400"
                                >
                                    Add Card
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
