import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    CheckCircle2,
    Cpu,
    Download,
    Gauge,
    HardDrive,
    Plane,
    Send,
    Trash2,
    TriangleAlert,
    Zap,
} from 'lucide-react';
import clsx from 'clsx';
import {
    Badge,
    Button,
    ErrorNote,
    Markdown,
    PageHeader,
    Panel,
    Progress,
    Select,
    Spinner,
    TextInput,
} from '../components/ui';
import api from '../lib/api';
import { edgeLLM } from '../lib/edgeLLM';
import { useStore } from '../store/useStore';

/**
 * Zero-cloud inference: download a model once, then run it on the local GPU.
 *
 * After the first download the weights live in the browser's Cache Storage, so
 * subsequent sessions work with no network at all and cost the operator nothing.
 */

export const LocalAI = () => {
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');
    const [state, setState] = useState(edgeLLM.getState());
    const [probe, setProbe] = useState(null);
    const [error, setError] = useState(null);

    const [prompt, setPrompt] = useState('');
    const [answer, setAnswer] = useState('');
    const [generating, setGenerating] = useState(false);
    const [benchmark, setBenchmark] = useState(null);

    const edgeMode = useStore((s) => s.settings.edgeMode);
    const updateSettings = useStore((s) => s.updateSettings);
    const setEdgeState = useStore((s) => s.setEdgeState);

    const abortRef = useRef(null);

    // Mirror engine state into the store so the top bar can show readiness.
    useEffect(() => {
        const unsubscribe = edgeLLM.subscribe((snapshot) => {
            setState(snapshot);
            setEdgeState(snapshot);
        });
        return unsubscribe;
    }, [setEdgeState]);

    useEffect(() => {
        edgeLLM.constructor.probe().then(setProbe);

        api.edgeModels()
            .then((data) => {
                setModels(data.models || []);
                const recommended = data.models?.find((m) => m.recommended) || data.models?.[0];
                setSelectedModel((current) => current || recommended?.id || '');
            })
            .catch((err) => setError(err.message));
    }, []);

    useEffect(
        () => () => {
            abortRef.current?.abort();
        },
        [],
    );

    const download = async () => {
        if (!selectedModel) return;
        setError(null);
        try {
            await edgeLLM.load(selectedModel);
        } catch (err) {
            setError(err.message);
        }
    };

    const generate = useCallback(async () => {
        const question = prompt.trim();
        if (!question || generating || !edgeLLM.isReady()) return;

        setGenerating(true);
        setAnswer('');
        setError(null);
        setBenchmark(null);

        const controller = new AbortController();
        abortRef.current = controller;

        const startedAt = performance.now();
        let firstTokenAt = null;
        let characters = 0;

        try {
            const text = await edgeLLM.stream(question, {
                signal: controller.signal,
                onDelta: (delta, full) => {
                    if (firstTokenAt === null) firstTokenAt = performance.now();
                    characters = full.length;
                    setAnswer(full);
                },
            });

            const elapsed = (performance.now() - startedAt) / 1000;
            setBenchmark({
                // Characters/4 is the usual rough token proxy; labelled as
                // approximate in the UI rather than presented as exact.
                tokensPerSecond: elapsed > 0 ? Math.round(characters / 4 / elapsed) : 0,
                firstTokenMs: firstTokenAt ? Math.round(firstTokenAt - startedAt) : null,
                totalSeconds: Number(elapsed.toFixed(1)),
                characters: text.length,
            });
        } catch (err) {
            if (err?.name !== 'AbortError') setError(err.message);
        } finally {
            setGenerating(false);
            abortRef.current = null;
        }
    }, [generating, prompt]);

    const unload = async () => {
        await edgeLLM.unload();
        setAnswer('');
        setBenchmark(null);
    };

    const activeModel = models.find((m) => m.id === (state.modelId || selectedModel));
    const loading = state.status === 'loading';
    const ready = state.status === 'ready';

    return (
        <div className="animate-fade">
            <PageHeader
                title="Local AI"
                subtitle="Run a language model on your own GPU. No server, no network, no cost."
                badge={
                    ready ? (
                        <Badge tone="good">
                            <CheckCircle2 size={11} /> Model loaded
                        </Badge>
                    ) : probe?.supported ? (
                        <Badge tone="accent">
                            <Zap size={11} /> WebGPU ready
                        </Badge>
                    ) : probe ? (
                        <Badge tone="warn">WebGPU unavailable</Badge>
                    ) : null
                }
                actions={
                    ready && (
                        <Button variant="danger" size="sm" icon={Trash2} onClick={unload}>
                            Unload
                        </Button>
                    )
                }
            />

            {probe && !probe.supported && (
                <Panel className="mb-6 border-amber-500/30 bg-amber-500/5 p-4">
                    <p className="text-app flex items-center gap-2 text-sm font-medium">
                        <TriangleAlert size={15} className="text-amber-400" />
                        On-device inference is not available here
                    </p>
                    <p className="text-app-muted mt-1.5 text-sm">{probe.reason}</p>
                </Panel>
            )}

            <ErrorNote error={error} className="mb-6" />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
                <div className="space-y-4">
                    <Panel className="p-5">
                        <p className="text-app mb-3 flex items-center gap-2 text-sm font-semibold">
                            <HardDrive size={15} className="accent-text" /> Choose a model
                        </p>

                        {models.length === 0 ? (
                            <Spinner label="Loading the catalogue…" />
                        ) : (
                            <div className="mb-4 space-y-2">
                                {models.map((model) => (
                                    <button
                                        key={model.id}
                                        type="button"
                                        disabled={loading}
                                        onClick={() => setSelectedModel(model.id)}
                                        className={clsx(
                                            'focus-ring w-full rounded-xl p-3 text-left transition-all disabled:opacity-50',
                                            selectedModel === model.id
                                                ? 'accent-bg border border-[var(--accent)]'
                                                : 'border-app hover:accent-bg border',
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-app text-sm font-medium">{model.label}</span>
                                            {model.recommended && <Badge tone="good">recommended</Badge>}
                                            {state.modelId === model.id && ready && (
                                                <Badge tone="accent">loaded</Badge>
                                            )}
                                        </div>
                                        <p className="text-app-muted mt-1 text-xs">{model.good_for}</p>
                                        <p className="text-app-muted mt-1.5 text-[11px] opacity-70">
                                            {(model.size_mb / 1024).toFixed(1)} GB download ·{' '}
                                            {(model.vram_mb / 1024).toFixed(1)} GB VRAM
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}

                        {loading ? (
                            <div>
                                <Progress value={state.progress} className="mb-2" />
                                <p className="text-app-muted text-xs">{state.message}</p>
                                <p className="text-app-muted mt-2 text-[11px] opacity-70">
                                    The download is cached, so this only happens once per model.
                                </p>
                            </div>
                        ) : (
                            <Button
                                icon={Download}
                                onClick={download}
                                disabled={!selectedModel || !probe?.supported}
                                className="w-full"
                            >
                                {ready && state.modelId === selectedModel
                                    ? 'Reload model'
                                    : ready
                                      ? 'Switch to this model'
                                      : 'Download and load'}
                            </Button>
                        )}
                    </Panel>

                    <Panel className="p-5">
                        <p className="text-app mb-1 flex items-center gap-2 text-sm font-semibold">
                            <Plane size={15} className="accent-text" /> Offline behaviour
                        </p>
                        <p className="text-app-muted mb-3 text-xs">
                            Controls when the app uses the on-device model instead of the server.
                        </p>
                        <Select
                            value={edgeMode}
                            onChange={(event) => updateSettings({ edgeMode: event.target.value })}
                            className="w-full"
                        >
                            <option value="auto">Auto — only when the server is unreachable</option>
                            <option value="always">Always — never call the server for chat</option>
                            <option value="never">Never — server only</option>
                        </Select>
                        {edgeMode === 'always' && !ready && (
                            <p className="mt-2 text-xs text-amber-400">
                                Always-on-device is selected but no model is loaded. Chat will fail until you
                                download one.
                            </p>
                        )}
                    </Panel>

                    {probe?.supported && (
                        <Panel className="p-5">
                            <p className="text-app-muted mb-2 text-xs font-semibold uppercase tracking-wider">
                                Your GPU
                            </p>
                            <dl className="text-app-muted space-y-1 text-xs">
                                <div className="flex justify-between">
                                    <dt>WebGPU</dt>
                                    <dd className="text-emerald-400">available</dd>
                                </div>
                                {probe.maxBufferMB && (
                                    <div className="flex justify-between">
                                        <dt>Max buffer</dt>
                                        <dd className="text-app tabular">{probe.maxBufferMB} MB</dd>
                                    </div>
                                )}
                                {probe.maxStorageBufferMB && (
                                    <div className="flex justify-between">
                                        <dt>Max storage buffer</dt>
                                        <dd className="text-app tabular">{probe.maxStorageBufferMB} MB</dd>
                                    </div>
                                )}
                            </dl>
                        </Panel>
                    )}
                </div>

                <div className="space-y-4">
                    <Panel className="p-5">
                        <p className="text-app mb-3 flex items-center gap-2 text-sm font-semibold">
                            <Cpu size={15} className="accent-text" />
                            {ready ? `Talking to ${activeModel?.label || state.modelId}` : 'Load a model to test it'}
                        </p>

                        <div className="flex gap-2">
                            <TextInput
                                value={prompt}
                                onChange={(event) => setPrompt(event.target.value)}
                                onKeyDown={(event) => event.key === 'Enter' && generate()}
                                placeholder={
                                    ready
                                        ? 'Ask something — this never leaves your device'
                                        : 'Download a model first'
                                }
                                disabled={!ready || generating}
                            />
                            <Button
                                icon={Send}
                                onClick={generate}
                                loading={generating}
                                disabled={!ready || !prompt.trim()}
                            >
                                Run
                            </Button>
                        </div>

                        {answer && (
                            <div className="surface-raised mt-4 rounded-xl p-4">
                                <Markdown text={answer} className={generating ? 'stream-caret' : ''} />
                            </div>
                        )}

                        {benchmark && (
                            <div className="border-app mt-4 border-t pt-4">
                                <p className="text-app-muted mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                                    <Gauge size={12} /> This run
                                </p>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        {
                                            label: 'tokens/sec (approx.)',
                                            value: benchmark.tokensPerSecond,
                                        },
                                        {
                                            label: 'first token',
                                            value: benchmark.firstTokenMs ? `${benchmark.firstTokenMs}ms` : '—',
                                        },
                                        { label: 'total', value: `${benchmark.totalSeconds}s` },
                                    ].map((metric) => (
                                        <div key={metric.label}>
                                            <p className="text-app tabular text-lg font-bold">{metric.value}</p>
                                            <p className="text-app-muted text-[11px]">{metric.label}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Panel>

                    <Panel className="p-5">
                        <p className="text-app mb-2 text-sm font-semibold">What runs locally</p>
                        <ul className="text-app-muted space-y-1.5 text-sm">
                            <li>· Chat, when offline mode is Auto and the server is unreachable</li>
                            <li>· Chat always, when set to Always</li>
                            <li>· Quiz generation for offline study sessions</li>
                        </ul>
                        <p className="text-app-muted mt-3 text-xs">
                            Vision, PDF analysis, web research and the knowledge graph still need the server —
                            they depend on multimodal models, document parsing and network access that a
                            browser-resident model cannot provide.
                        </p>
                    </Panel>
                </div>
            </div>
        </div>
    );
};

export default LocalAI;
