import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, GraduationCap, RotateCw, Brain, ArrowRight, Loader2, ArrowLeft, Send, CheckCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';
import axios from 'axios';

const StudyModeCard = ({ title, desc, icon: Icon, color, onClick }) => (
    <div onClick={onClick} className="glass-panel p-6 rounded-2xl border border-white/5 bg-[#0e0e12] flex flex-col justify-between group hover:border-blue-500/30 transition-all duration-300 cursor-pointer">
        <div>
            <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors", color)}>
                <Icon size={24} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed min-h-[40px]">{desc}</p>
        </div>
        <button className="flex items-center text-cyan-400 font-medium text-sm group-hover:text-cyan-300 transition-colors">
            Start Learning <ArrowRight size={16} className="ml-2 transition-transform group-hover:translate-x-1" />
        </button>
    </div>
);

export const Study = () => {
    const [activeMode, setActiveMode] = useState(null); // 'study', 'tutor', 'revision'
    const [loading, setLoading] = useState(false);

    // Study Mode State
    const [studyTopic, setStudyTopic] = useState('');
    const [explanation, setExplanation] = useState('');

    // Tutor Mode State
    const [tutorMessages, setTutorMessages] = useState([]);
    const [tutorInput, setTutorInput] = useState('');

    // Revision Mode State
    const [quizTopic, setQuizTopic] = useState('');
    const [quizQuestions, setQuizQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState(null);
    const [score, setScore] = useState(0);
    const [showResult, setShowResult] = useState(false);

    // --- Actions ---

    const handleExplain = async () => {
        if (!studyTopic.trim()) return;
        setLoading(true);
        try {
            const res = await axios.post('http://localhost:8001/api/study/explain', { topic: studyTopic, depth: "intermediate" });
            setExplanation(res.data.explanation);
        } catch (error) {
            setExplanation("Error getting explanation. Please ensure backend is running.");
        } finally {
            setLoading(false);
        }
    };

    const handleTutorSend = async () => {
        if (!tutorInput.trim()) return;
        const userMsg = { role: 'user', content: tutorInput };
        setTutorMessages(prev => [...prev, userMsg]);
        setTutorInput('');
        setLoading(true);

        try {
            const res = await axios.post('http://localhost:8001/api/study/tutor', {
                message: userMsg.content,
                context: tutorMessages
            });
            setTutorMessages(prev => [...prev, { role: 'ai', content: res.data.response }]);
        } catch (error) {
            setTutorMessages(prev => [...prev, { role: 'ai', content: "Error connecting to Tutor." }]);
        } finally {
            setLoading(false);
        }
    };

    const handleStartQuiz = async () => {
        if (!quizTopic.trim()) return;
        setLoading(true);
        setScore(0);
        setCurrentQuestionIndex(0);
        setShowResult(false);
        setQuizQuestions([]);

        try {
            const res = await axios.post('http://localhost:8001/api/study/quiz', { topic: quizTopic });
            if (res.data.questions && res.data.questions.length > 0) {
                setQuizQuestions(res.data.questions);
            } else {
                alert("Could not generate quiz. Try a different topic.");
            }
        } catch (error) {
            alert("Error starting quiz.");
        } finally {
            setLoading(false);
        }
    };

    const handleAnswerQuiz = (option) => {
        setSelectedOption(option);
        if (option === quizQuestions[currentQuestionIndex].answer) {
            setScore(prev => prev + 1);
        }

        setTimeout(() => {
            if (currentQuestionIndex < quizQuestions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
                setSelectedOption(null);
            } else {
                setShowResult(true);
            }
        }, 1500);
    };

    // --- Renderers ---

    const renderStudyMode = () => (
        <div className="w-full max-w-4xl mx-auto animate-in fade-in">
            <div className="bg-[#0e0e12] border border-white/10 rounded-2xl p-6 mb-6">
                <h2 className="text-xl font-bold text-white mb-4">Topic Explanation</h2>
                <div className="flex gap-4">
                    <input
                        value={studyTopic}
                        onChange={e => setStudyTopic(e.target.value)}
                        placeholder="Enter a topic (e.g. 'Photosynthesis')"
                        className="flex-1 bg-[#1a1a1f] border border-white/5 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                        onKeyDown={e => e.key === 'Enter' && handleExplain()}
                    />
                    <button onClick={handleExplain} disabled={loading} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium min-w-[100px] flex items-center justify-center">
                        {loading ? <Loader2 className="animate-spin" /> : "Explain"}
                    </button>
                </div>
            </div>
            {explanation && (
                <div className="bg-[#0e0e12] border border-white/10 rounded-2xl p-8 prose prose-invert max-w-none text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {explanation}
                </div>
            )}
        </div>
    );

    const renderTutorMode = () => (
        <div className="w-full max-w-3xl mx-auto h-[600px] flex flex-col bg-[#0e0e12] border border-white/10 rounded-2xl overflow-hidden animate-in fade-in">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {tutorMessages.length === 0 && (
                    <div className="text-center text-gray-500 mt-20">
                        <GraduationCap size={48} className="mx-auto mb-4 opacity-50" />
                        <p>Hello! I'm your AI Tutor. What subject are we tackling today?</p>
                    </div>
                )}
                {tutorMessages.map((msg, idx) => (
                    <div key={idx} className={clsx("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                        <div className={clsx("max-w-[80%] p-4 rounded-2xl", msg.role === 'user' ? "bg-purple-600 text-white" : "bg-white/10 text-gray-200")}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {loading && <div className="text-gray-500 text-sm animate-pulse ml-4">Tutor is typing...</div>}
            </div>
            <div className="p-4 border-t border-white/10 bg-white/5 flex gap-3">
                <input
                    value={tutorInput}
                    onChange={e => setTutorInput(e.target.value)}
                    placeholder="Ask your tutor..."
                    className="flex-1 bg-[#0e0e12] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleTutorSend()}
                />
                <button onClick={handleTutorSend} disabled={loading} className="p-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl">
                    <Send size={20} />
                </button>
            </div>
        </div>
    );

    const renderRevisionMode = () => (
        <div className="w-full max-w-2xl mx-auto animate-in fade-in">
            {quizQuestions.length === 0 ? (
                <div className="bg-[#0e0e12] border border-white/10 rounded-2xl p-8 text-center">
                    <RotateCw size={48} className="mx-auto text-green-500 mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">Revision Quiz</h2>
                    <p className="text-gray-400 mb-6">Generate a quick quiz to test your knowledge.</p>
                    <div className="flex gap-3">
                        <input
                            value={quizTopic}
                            onChange={e => setQuizTopic(e.target.value)}
                            placeholder="Topic (e.g. 'French Revolution')"
                            className="flex-1 bg-[#1a1a1f] border border-white/5 rounded-xl px-4 py-3 text-white focus:border-green-500 focus:outline-none"
                            onKeyDown={e => e.key === 'Enter' && handleStartQuiz()}
                        />
                        <button onClick={handleStartQuiz} disabled={loading} className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium min-w-[120px] flex items-center justify-center">
                            {loading ? <Loader2 className="animate-spin" /> : "Start Quiz"}
                        </button>
                    </div>
                </div>
            ) : showResult ? (
                <div className="text-center bg-[#0e0e12] border border-white/10 rounded-2xl p-12">
                    <h2 className="text-3xl font-bold text-white mb-4">Quiz Complete!</h2>
                    <p className="text-xl text-gray-300 mb-8">You scored <span className="text-green-500 font-bold">{score}</span> / {quizQuestions.length}</p>
                    <button onClick={() => setQuizQuestions([])} className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold">
                        Take Another Quiz
                    </button>
                </div>
            ) : (
                <div className="bg-[#0e0e12] border border-white/10 rounded-2xl p-8">
                    <div className="flex justify-between items-center mb-6">
                        <span className="text-sm text-gray-500">Question {currentQuestionIndex + 1} of {quizQuestions.length}</span>
                        <span className="text-sm font-bold text-green-500">Score: {score}</span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-8">{quizQuestions[currentQuestionIndex].question}</h3>
                    <div className="space-y-3">
                        {quizQuestions[currentQuestionIndex].options.map((option, idx) => (
                            <button
                                key={idx}
                                onClick={() => !selectedOption && handleAnswerQuiz(option)}
                                className={clsx(
                                    "w-full p-4 rounded-xl text-left transition-all border",
                                    selectedOption === option
                                        ? (option === quizQuestions[currentQuestionIndex].answer ? "bg-green-500/20 border-green-500 text-green-300" : "bg-red-500/20 border-red-500 text-red-300")
                                        : "bg-white/5 border-white/5 hover:bg-white/10 text-gray-300"
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    {option}
                                    {selectedOption === option && (
                                        option === quizQuestions[currentQuestionIndex].answer ? <CheckCircle size={20} /> : <XCircle size={20} />
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="flex flex-col gap-8 animate-in fade-in zoom-in-95 duration-500 max-w-7xl mx-auto w-full pb-8">
            <div className="flex items-center gap-4">
                {activeMode && (
                    <button onClick={() => setActiveMode(null)} className="p-2 rounded-lg hover:bg-white/10 text-gray-400 transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                )}
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1">
                        {activeMode === 'study' ? 'Deep Dive Study' : activeMode === 'tutor' ? 'AI Tutor' : activeMode === 'revision' ? 'Revision Quiz' : 'Study Center'}
                    </h1>
                    <p className="text-gray-400">
                        {activeMode ? 'Master your subjects with AI assistance' : 'Choose a learning mode and get AI assistance instantly'}
                    </p>
                </div>
            </div>

            {!activeMode ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <StudyModeCard
                        title="Study Mode"
                        desc="Learn new topics with AI-generated explanations and examples."
                        icon={BookOpen}
                        color="bg-blue-500/10 text-blue-500"
                        onClick={() => setActiveMode('study')}
                    />
                    <StudyModeCard
                        title="Tutor Mode"
                        desc="Interactive tutoring with adaptive difficulty and personalized guidance."
                        icon={GraduationCap}
                        color="bg-purple-500/10 text-purple-500"
                        onClick={() => setActiveMode('tutor')}
                    />
                    <StudyModeCard
                        title="Revision Mode"
                        desc="Review and reinforce your knowledge with spaced repetition quizzes."
                        icon={RotateCw}
                        color="bg-green-500/10 text-green-500"
                        onClick={() => setActiveMode('revision')}
                    />
                </div>
            ) : (
                <div className="mt-4">
                    {activeMode === 'study' && renderStudyMode()}
                    {activeMode === 'tutor' && renderTutorMode()}
                    {activeMode === 'revision' && renderRevisionMode()}
                </div>
            )}
        </div>
    );
};
