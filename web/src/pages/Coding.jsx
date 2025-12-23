import React, { useState, useEffect } from 'react';
import { Play, Settings, Lightbulb, History, Bug, Zap, Code2, Copy, Loader2, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
// Simple code editor alternatives to Ace to avoid crashes
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/themes/prism-tomorrow.css'; // Dark theme
import axios from 'axios';

export const Coding = () => {
    const defaultCode = {
        JavaScript: `function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

// Calculate the 10th Fibonacci number
console.log(fibonacci(10));`,
        Python: `def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# Calculate the 10th Fibonacci number
print(fibonacci(10))`,
        TypeScript: `function fibonacci(n: number): number {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));`,
        Java: `public class Main {
    public static int fibonacci(int n) {
        if (n <= 1) return n;
        return fibonacci(n - 1) + fibonacci(n - 2);
    }
    public static void main(String[] args) {
        System.out.println(fibonacci(10));
    }
}`,
        'C++': `#include <iostream>
using namespace std;

int fibonacci(int n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    cout << fibonacci(10) << endl;
    return 0;
}`,
        Go: `package main
import "fmt"

func fibonacci(n int) int {
    if n <= 1 {
        return n
    }
    return fibonacci(n-1) + fibonacci(n-2)
}

func main() {
    fmt.Println(fibonacci(10))
}`,
        Rust: `fn fibonacci(n: u32) -> u32 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

fn main() {
    println!("{}", fibonacci(10));
}`,
        SQL: `SELECT 
    id, 
    first_name, 
    last_name 
FROM users 
WHERE status = 'active';`
    };

    const [files, setFiles] = useState(defaultCode);
    const [activeLang, setActiveLang] = useState('JavaScript');
    const [analysis, setAnalysis] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [actionType, setActionType] = useState('');

    const languagesList = ['JavaScript', 'Python', 'TypeScript', 'Java', 'C++', 'Go', 'Rust', 'SQL'];

    // Update the code for the active language
    const handleCodeChange = (newCode) => {
        setFiles(prev => ({
            ...prev,
            [activeLang]: newCode
        }));
    };

    const handleAnalyze = async (action) => {
        setIsAnalyzing(true);
        setAnalysis('');
        setActionType(action);
        try {
            const response = await axios.post('http://localhost:8001/api/analyze-code', {
                code: files[activeLang],
                action,
                language: activeLang
            });
            setAnalysis(response.data.analysis);
        } catch (error) {
            setAnalysis('Error connecting to AI backend. Please ensure the server is running.');
            console.error(error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const getHighlighter = (lang) => {
        switch (lang) {
            case 'JavaScript': return languages.js;
            case 'Python': return languages.python;
            case 'TypeScript': return languages.js; // Prism uses js grammar for ts usually
            case 'Java': return languages.java;
            case 'C++': return languages.cpp;
            default: return languages.js;
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] animate-in fade-in zoom-in-95 duration-500 pb-2">

            {/* Header */}
            <div className="flex items-center justify-between mb-6 px-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1">Coding Assistant</h1>
                    <p className="text-gray-400">AI-powered code analysis and help</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors border border-white/5">
                    <History size={18} /> History
                </button>
            </div>

            {/* Language Toolbar */}
            <div className="flex items-center gap-2 mb-4 px-4 overflow-x-auto no-scrollbar pb-2">
                {languagesList.map(lang => (
                    <button
                        key={lang}
                        onClick={() => setActiveLang(lang)}
                        className={clsx(
                            "px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap",
                            activeLang === lang
                                ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/20"
                                : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                        )}
                    >
                        {lang}
                    </button>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-4 px-4 min-h-0">
                {/* Left Column: Editor */}
                <div className="flex flex-col bg-[#0e0e12] rounded-2xl border border-white/10 shadow-xl overflow-hidden">
                    <div className="h-10 bg-[#1a1a1f] flex items-center justify-between px-4 border-b border-white/5">
                        <span className="text-xs text-gray-400 font-mono">{activeLang}</span>
                        <div className="flex gap-2">
                            <Copy size={14} className="text-gray-500 hover:text-white cursor-pointer" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto bg-[#0e0e12] p-4 font-mono text-sm relative">
                        <Editor
                            value={files[activeLang] || ''}
                            onValueChange={handleCodeChange}
                            highlight={code => highlight(code, getHighlighter(activeLang) || languages.js)}
                            padding={10}
                            style={{
                                fontFamily: '"Fira Code", "Fira Mono", monospace',
                                fontSize: 14,
                                backgroundColor: 'transparent',
                                minHeight: '100%',
                            }}
                            className="text-gray-300"
                        />
                    </div>

                    {/* Action Bar */}
                    <div className="p-4 border-t border-white/5 bg-[#1a1a1f]/50">
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <button onClick={() => handleAnalyze('explain')} className="flex items-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-left transition-colors group">
                                <Lightbulb size={18} className="text-yellow-500" />
                                <div>
                                    <div className="text-sm font-medium text-white">Explain Code</div>
                                    <div className="text-xs text-gray-500 group-hover:text-gray-400">Get a detailed explanation</div>
                                </div>
                            </button>
                            <button onClick={() => handleAnalyze('bugfix')} className="flex items-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-left transition-colors group">
                                <Bug size={18} className="text-red-500" />
                                <div>
                                    <div className="text-sm font-medium text-white">Find Bugs</div>
                                    <div className="text-xs text-gray-500 group-hover:text-gray-400">Identify potential issues</div>
                                </div>
                            </button>
                            <button onClick={() => handleAnalyze('optimize')} className="flex items-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-left transition-colors group">
                                <Zap size={18} className="text-purple-500" />
                                <div>
                                    <div className="text-sm font-medium text-white">Optimize</div>
                                    <div className="text-xs text-gray-500 group-hover:text-gray-400">Improve performance</div>
                                </div>
                            </button>
                            <button onClick={() => handleAnalyze('convert')} className="flex items-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-left transition-colors group">
                                <Code2 size={18} className="text-blue-500" />
                                <div>
                                    <div className="text-sm font-medium text-white">Convert Language</div>
                                    <div className="text-xs text-gray-500 group-hover:text-gray-400">Transform to another language</div>
                                </div>
                            </button>
                        </div>
                        <button
                            onClick={() => handleAnalyze('explain')}
                            disabled={isAnalyzing}
                            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-bold text-white shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isAnalyzing ? <Loader2 size={20} className="animate-spin" /> : <Lightbulb size={20} fill="currentColor" />}
                            {isAnalyzing ? 'Analyzing...' : 'Analyze Code'}
                        </button>
                    </div>
                </div>

                {/* Right Column: AI Analysis */}
                <div className="bg-[#0e0e12] rounded-2xl border border-white/10 shadow-xl overflow-hidden flex flex-col h-full">
                    <div className="h-10 bg-[#1a1a1f] flex items-center justify-between px-4 border-b border-white/5 text-sm shrink-0">
                        <div className="flex items-center gap-2 text-cyan-400 font-medium">
                            <Lightbulb size={16} /> AI Analysis {actionType && `— ${actionType.charAt(0).toUpperCase() + actionType.slice(1)}`}
                        </div>
                        <Settings size={16} className="text-gray-500 hover:text-white cursor-pointer" />
                    </div>

                    <div className="flex-1 overflow-auto p-6 text-gray-300 leading-relaxed custom-scrollbar">
                        {isAnalyzing ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                                <Loader2 size={48} className="animate-spin text-cyan-500" />
                                <p className="animate-pulse">Processing code intelligence...</p>
                            </div>
                        ) : analysis ? (
                            <div className="prose prose-invert max-w-none">
                                <pre className="whitespace-pre-wrap font-sans text-sm">{analysis}</pre>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                    <Code2 size={32} className="opacity-50" />
                                </div>
                                <p className="max-w-xs text-center text-sm">Paste code and select an action to get AI-powered analysis</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
