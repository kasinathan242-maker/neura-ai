import React, { useMemo, useState } from 'react';
import {
    Bug,
    Code,
    FileText,
    Gauge,
    Lightbulb,
    Repeat,
    Sparkles,
    TestTube,
} from 'lucide-react';
import {
    Badge,
    Button,
    ErrorNote,
    Markdown,
    PageHeader,
    Panel,
    Select,
    Spinner,
} from '../components/ui';
import api from '../lib/api';
import { useStore } from '../store/useStore';

/**
 * Code analysis workbench.
 *
 * A plain textarea rather than the previous `react-ace` editor: Ace ships a large
 * bundle, needed `optimizeDeps` special-casing in the Vite config, and gave
 * nothing this screen depends on — the value is in the analysis, not in syntax
 * highlighting while typing.
 */

const SAMPLES = {
    JavaScript: `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));`,
    Python: `def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

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

int fibonacci(int n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    std::cout << fibonacci(10) << std::endl;
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
    SQL: `SELECT id, first_name, last_name
FROM users
WHERE status = 'active';`,
};

const ACTIONS = [
    { id: 'explain', label: 'Explain', icon: Lightbulb },
    { id: 'bugfix', label: 'Find bugs', icon: Bug },
    { id: 'optimize', label: 'Optimise', icon: Gauge },
    { id: 'test', label: 'Write tests', icon: TestTube },
    { id: 'document', label: 'Document', icon: FileText },
    { id: 'convert', label: 'Convert', icon: Repeat },
];

const LANGUAGES = Object.keys(SAMPLES);

export const Coding = () => {
    const [files, setFiles] = useState(SAMPLES);
    const [language, setLanguage] = useState('JavaScript');
    const [target, setTarget] = useState('Python');
    const [analysis, setAnalysis] = useState('');
    const [action, setAction] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const awardXp = useStore((s) => s.awardXp);

    const code = files[language] ?? '';
    const lineCount = useMemo(() => code.split('\n').length, [code]);

    const run = async (which) => {
        if (!code.trim()) {
            setError('There is no code to analyse.');
            return;
        }

        setBusy(true);
        setAction(which);
        setError(null);
        setAnalysis('');

        try {
            const result = await api.analyzeCode(code, which, language, target);
            setAnalysis(result.analysis);
            awardXp(12, `code ${which}`);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="animate-fade">
            <PageHeader
                title="Coding"
                subtitle="Explain, debug, optimise, test or port code."
                actions={
                    <Select value={language} onChange={(event) => setLanguage(event.target.value)}>
                        {LANGUAGES.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </Select>
                }
            />

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                    <Panel className="overflow-hidden">
                        <div className="border-app flex items-center justify-between border-b px-4 py-2">
                            <div className="flex items-center gap-2">
                                <Code size={14} className="accent-text" />
                                <span className="text-app-muted text-xs">
                                    {language} · {lineCount} line{lineCount === 1 ? '' : 's'}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setFiles((current) => ({ ...current, [language]: SAMPLES[language] }))}
                                className="text-app-muted hover:accent-text focus-ring text-xs underline"
                            >
                                Reset sample
                            </button>
                        </div>
                        <textarea
                            value={code}
                            onChange={(event) =>
                                setFiles((current) => ({ ...current, [language]: event.target.value }))
                            }
                            spellCheck={false}
                            // `off` is not enough in Firefox; `new-password` reliably
                            // suppresses autofill on a code field.
                            autoComplete="new-password"
                            className="text-app focus-ring h-[52vh] w-full resize-none bg-[var(--bg-primary)] p-4 font-mono text-[13px] leading-relaxed outline-none"
                            placeholder={`Paste your ${language} code here…`}
                        />
                    </Panel>

                    <div className="flex flex-wrap gap-2">
                        {ACTIONS.map((item) => (
                            <Button
                                key={item.id}
                                variant={action === item.id ? 'primary' : 'ghost'}
                                size="sm"
                                icon={item.icon}
                                onClick={() => run(item.id)}
                                disabled={busy}
                            >
                                {item.label}
                            </Button>
                        ))}
                        {action === 'convert' && (
                            <Select
                                value={target}
                                onChange={(event) => setTarget(event.target.value)}
                                className="text-xs"
                            >
                                {LANGUAGES.filter((option) => option !== language).map((option) => (
                                    <option key={option} value={option}>
                                        → {option}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <ErrorNote error={error} onRetry={action ? () => run(action) : undefined} />

                    <Panel className="min-h-[52vh] p-5">
                        {busy ? (
                            <Spinner label={`Running ${action}…`} />
                        ) : analysis ? (
                            <>
                                <Badge tone="accent" className="mb-3">
                                    {ACTIONS.find((item) => item.id === action)?.label}
                                    {action === 'convert' ? ` → ${target}` : ''}
                                </Badge>
                                <Markdown text={analysis} />
                            </>
                        ) : (
                            <div className="text-app-muted flex h-full min-h-[44vh] flex-col items-center justify-center gap-3 text-center text-sm">
                                <Sparkles size={28} className="opacity-30" />
                                <p className="max-w-xs">
                                    Pick an action to analyse the code on the left.
                                </p>
                            </div>
                        )}
                    </Panel>
                </div>
            </div>
        </div>
    );
};

export default Coding;
