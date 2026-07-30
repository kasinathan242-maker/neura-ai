import React, { useEffect, useState } from 'react';
import { Box, Boxes, Eye, EyeOff, Glasses, Grid3x3, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import {
    Badge,
    Button,
    EmptyState,
    ErrorNote,
    PageHeader,
    Panel,
    TextInput,
} from '../components/ui';
import SceneRenderer from '../components/SceneRenderer';
import { xrStore } from '../lib/xrStore';
import api from '../lib/api';
import { useStore } from '../store/useStore';

/**
 * Ask a question, get an explorable 3D diagram — on screen, or in AR/VR.
 *
 * The model returns a validated scene *description*, never code. The renderer
 * maps that description onto primitives, so a bad generation degrades to an odd
 * diagram rather than executing anything or crashing the canvas.
 */

const EXAMPLES = [
    'How does a four-stroke car engine work?',
    'Show the structure of an animal cell',
    'How does a transformer neural network process a sentence?',
    'The layers of the Earth',
    'How does a p-n junction diode work?',
    'The water cycle',
];

export const Spatial = () => {
    const [prompt, setPrompt] = useState('');
    const [scene, setScene] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(null);
    const [showLabels, setShowLabels] = useState(true);
    const [showGrid, setShowGrid] = useState(true);
    const [xrSupport, setXrSupport] = useState({ vr: false, ar: false, checked: false });

    const awardXp = useStore((s) => s.awardXp);

    useEffect(() => {
        let cancelled = false;

        const probe = async () => {
            if (typeof navigator === 'undefined' || !navigator.xr) {
                if (!cancelled) setXrSupport({ vr: false, ar: false, checked: true });
                return;
            }
            // Each mode is queried separately: a phone typically supports AR only,
            // a headset VR only.
            const [vr, ar] = await Promise.all([
                navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
                navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
            ]);
            if (!cancelled) setXrSupport({ vr, ar, checked: true });
        };

        probe();
        return () => {
            cancelled = true;
        };
    }, []);

    const generate = async (text = prompt) => {
        const question = text.trim();
        if (!question || busy) return;

        setBusy(true);
        setError(null);
        setSelected(null);
        setPrompt(question);

        try {
            const result = await api.generateScene(question);
            setScene(result.scene);
            if (result.scene?.objects?.length) awardXp(20, 'spatial scene');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const selectedObject = scene?.objects?.find((object) => object.id === selected);
    const selectedNote = scene?.annotations?.find((note) => note.target === selected);

    return (
        <div className="animate-fade">
            <PageHeader
                title="Spatial 3D"
                subtitle="Turn an explanation into something you can walk around."
                badge={
                    xrSupport.ar || xrSupport.vr ? (
                        <Badge tone="good">
                            <Glasses size={11} /> WebXR available
                        </Badge>
                    ) : xrSupport.checked ? (
                        <Badge>Screen only</Badge>
                    ) : null
                }
            />

            <Panel className="mb-6 p-5">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <TextInput
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && generate()}
                        placeholder="What should I build in 3D?"
                        disabled={busy}
                    />
                    <Button icon={Sparkles} onClick={() => generate()} loading={busy}>
                        {busy ? 'Building…' : 'Generate'}
                    </Button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                    {EXAMPLES.map((example) => (
                        <button
                            key={example}
                            type="button"
                            onClick={() => generate(example)}
                            disabled={busy}
                            className="border-app text-app-muted hover:accent-text focus-ring rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40"
                        >
                            {example}
                        </button>
                    ))}
                </div>
            </Panel>

            <ErrorNote error={error} onRetry={() => generate()} className="mb-6" />

            {scene ? (
                <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,300px)]">
                    <Panel className="overflow-hidden">
                        <div className="border-app flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                            <div className="min-w-0">
                                <p className="text-app truncate text-sm font-semibold">{scene.title}</p>
                                {scene.description && (
                                    <p className="text-app-muted mt-0.5 line-clamp-2 text-xs">
                                        {scene.description}
                                    </p>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setShowLabels((value) => !value)}
                                    title={showLabels ? 'Hide labels' : 'Show labels'}
                                    className="text-app-muted hover:text-app focus-ring rounded-lg p-1.5 transition-colors"
                                >
                                    {showLabels ? <Eye size={15} /> : <EyeOff size={15} />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowGrid((value) => !value)}
                                    title={showGrid ? 'Hide grid' : 'Show grid'}
                                    className={clsx(
                                        'focus-ring rounded-lg p-1.5 transition-colors',
                                        showGrid ? 'accent-text' : 'text-app-muted hover:text-app',
                                    )}
                                >
                                    <Grid3x3 size={15} />
                                </button>
                            </div>
                        </div>

                        <SceneRenderer
                            scene={scene}
                            className="h-[460px] w-full"
                            onSelect={(spec) => setSelected(spec.id)}
                            selectedId={selected}
                            showLabels={showLabels}
                            showGrid={showGrid}
                        />

                        <div className="border-app flex flex-wrap items-center gap-2 border-t px-4 py-3">
                            {xrSupport.ar && (
                                <Button
                                    variant="subtle"
                                    size="sm"
                                    icon={Glasses}
                                    onClick={() => xrStore.enterAR()}
                                >
                                    View in AR
                                </Button>
                            )}
                            {xrSupport.vr && (
                                <Button
                                    variant="subtle"
                                    size="sm"
                                    icon={Glasses}
                                    onClick={() => xrStore.enterVR()}
                                >
                                    Enter VR
                                </Button>
                            )}
                            <p className="text-app-muted ml-auto text-xs">
                                Drag to orbit · scroll to zoom · click a part
                                {!xrSupport.ar && !xrSupport.vr && xrSupport.checked
                                    ? ' · open on a headset or an AR phone for immersive mode'
                                    : ''}
                            </p>
                        </div>
                    </Panel>

                    <div className="space-y-4">
                        {selectedObject ? (
                            <Panel className="accent-bg p-4">
                                <div className="mb-2 flex items-center gap-2">
                                    <span
                                        className="h-3 w-3 rounded-full"
                                        style={{ background: selectedObject.color }}
                                    />
                                    <p className="text-app text-sm font-semibold">
                                        {selectedObject.label || selectedObject.id}
                                    </p>
                                </div>
                                <Badge>{selectedObject.type}</Badge>
                                {selectedNote && (
                                    <p className="text-app-muted mt-3 text-sm">{selectedNote.text}</p>
                                )}
                            </Panel>
                        ) : (
                            <Panel className="p-4">
                                <p className="text-app-muted text-sm">
                                    Click any part of the model to read what it does.
                                </p>
                            </Panel>
                        )}

                        <Panel className="p-4">
                            <p className="text-app-muted mb-2 text-xs font-semibold uppercase tracking-wider">
                                Parts ({scene.objects.length})
                            </p>
                            <div className="no-scrollbar max-h-72 space-y-1 overflow-y-auto">
                                {scene.objects.map((object) => (
                                    <button
                                        key={object.id}
                                        type="button"
                                        onClick={() => setSelected(object.id)}
                                        className={clsx(
                                            'focus-ring flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
                                            selected === object.id
                                                ? 'accent-bg accent-text'
                                                : 'text-app-muted hover:bg-[var(--border-subtle)]',
                                        )}
                                    >
                                        <span
                                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                                            style={{ background: object.color }}
                                        />
                                        <span className="truncate">{object.label || object.id}</span>
                                    </button>
                                ))}
                            </div>
                        </Panel>

                        {scene.annotations?.length > 0 && (
                            <Panel className="p-4">
                                <p className="text-app-muted mb-2 text-xs font-semibold uppercase tracking-wider">
                                    Notes
                                </p>
                                <div className="space-y-2.5">
                                    {scene.annotations.map((note, index) => {
                                        const target = scene.objects.find((o) => o.id === note.target);
                                        return (
                                            <div key={index}>
                                                <p className="accent-text text-xs font-medium">
                                                    {target?.label || note.target}
                                                </p>
                                                <p className="text-app-muted text-xs">{note.text}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Panel>
                        )}

                        {(scene.fallback || scene.degraded) && (
                            <Panel className="border-amber-500/30 bg-amber-500/5 p-4">
                                <p className="text-xs text-amber-300">
                                    This is a generic diagram because no language model produced a scene.
                                    Configure a model for a bespoke one.
                                </p>
                            </Panel>
                        )}
                    </div>
                </div>
            ) : (
                <Panel>
                    <EmptyState
                        icon={Boxes}
                        title="Ask for anything spatial"
                        action={
                            <Button icon={Box} onClick={() => generate(EXAMPLES[0])} loading={busy}>
                                Try the car engine
                            </Button>
                        }
                    >
                        The model returns a described scene — labelled parts, positions and links — which is
                        rendered here as interactive geometry. On an AR-capable phone or a VR headset you can
                        step inside it.
                    </EmptyState>
                </Panel>
            )}
        </div>
    );
};

export default Spatial;
