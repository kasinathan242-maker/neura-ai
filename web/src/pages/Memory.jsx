import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain, Database, Eye, Network, Search, Trash2, TrendingDown, Upload } from 'lucide-react';
import clsx from 'clsx';
import {
    Badge,
    Button,
    EmptyState,
    ErrorNote,
    PageHeader,
    Panel,
    Progress,
    Select,
    Spinner,
    TextArea,
    TextInput,
} from '../components/ui';
import SceneRenderer from '../components/SceneRenderer';
import api from '../lib/api';
import { useStore } from '../store/useStore';

/**
 * The learner's evolving knowledge graph.
 *
 * Concepts become nodes, relationships become edges, and each node carries a
 * mastery score updated by quiz results. The chat and study prompts read the weak
 * nodes back, which is the mechanism behind "you struggled with calculus three
 * months ago, so let me connect this physics question to that".
 */

const MASTERY_COLOURS = [
    { max: 0.35, colour: '#f87171', label: 'Weak' },
    { max: 0.55, colour: '#fbbf24', label: 'Shaky' },
    { max: 0.8, colour: '#38bdf8', label: 'Solid' },
    { max: 1.01, colour: '#34d399', label: 'Strong' },
];

const masteryStyle = (mastery) =>
    MASTERY_COLOURS.find((band) => mastery < band.max) || MASTERY_COLOURS[3];

/**
 * Lay the graph out as a 3D scene.
 *
 * A deterministic Fibonacci sphere rather than a force simulation: the positions
 * are stable across renders (so nodes do not jump when a score updates), it costs
 * nothing to compute, and it reuses the same SceneRenderer as the Spatial page.
 */
function graphToScene(graph) {
    const nodes = graph.nodes || [];
    if (!nodes.length) return null;

    const golden = Math.PI * (3 - Math.sqrt(5));
    const radius = Math.min(7, 2.2 + nodes.length * 0.22);

    const objects = nodes.map((node, index) => {
        const y = nodes.length === 1 ? 0 : 1 - (index / (nodes.length - 1)) * 2;
        const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = golden * index;

        const mastery = node.mastery ?? 0.5;
        return {
            id: node.id,
            type: mastery < 0.55 ? 'octahedron' : 'sphere',
            label: node.name,
            position: [
                Number((Math.cos(theta) * ringRadius * radius).toFixed(3)),
                Number((y * radius * 0.55 + 1.2).toFixed(3)),
                Number((Math.sin(theta) * ringRadius * radius).toFixed(3)),
            ],
            rotation: [0, 0, 0],
            // Encountered more often = larger, so the graph shows attention as
            // well as competence.
            scale: Array(3).fill(0.42 + Math.min(0.5, (node.encounters || 1) * 0.06)),
            color: masteryStyle(mastery).colour,
            opacity: 1,
            spin: mastery < 0.55 ? 0.6 : 0.12,
            metalness: 0.3,
            roughness: 0.4,
        };
    });

    return {
        title: 'Knowledge graph',
        description: '',
        objects,
        connections: (graph.edges || []).map((edge) => ({
            from: edge.source,
            to: edge.target,
            label: '',
        })),
        annotations: [],
        camera: { position: [0, 3.5, radius * 2.1], target: [0, 1, 0] },
        grid: false,
        valid: true,
    };
}

export const Memory = () => {
    const [graph, setGraph] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [view, setView] = useState('3d');
    const [selected, setSelected] = useState(null);

    const [query, setQuery] = useState('');
    const [hits, setHits] = useState(null);
    const [searching, setSearching] = useState(false);

    const [contextQuery, setContextQuery] = useState('');
    const [contextPreview, setContextPreview] = useState(null);
    const [previewing, setPreviewing] = useState(false);

    const [ingestText, setIngestText] = useState('');
    const [ingestTitle, setIngestTitle] = useState('');
    const [ingesting, setIngesting] = useState(false);
    const [ingestResult, setIngestResult] = useState(null);

    const [profile, setProfile] = useState(null);

    const notify = useStore((s) => s.notify);

    const load = useCallback(async ({ showSpinner = true } = {}) => {
        if (showSpinner) setLoading(true);
        setError(null);
        try {
            const [graphData, profileData] = await Promise.all([
                api.memoryGraph(),
                api.getProfile().catch(() => null),
            ]);
            setGraph(graphData);
            if (profileData) setProfile(profileData.profile);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // `loading` already starts true, so the initial fetch never needs to set it
    // synchronously here -- every state write happens after an await, and the
    // cancelled flag stops a late response updating an unmounted page.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [graphData, profileData] = await Promise.all([
                    api.memoryGraph(),
                    api.getProfile().catch(() => null),
                ]);
                if (cancelled) return;
                setGraph(graphData);
                if (profileData) setProfile(profileData.profile);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const scene = useMemo(() => (graph ? graphToScene(graph) : null), [graph]);

    const weakest = useMemo(
        () =>
            [...(graph?.nodes || [])]
                .filter((node) => (node.mastery ?? 0.5) < 0.55)
                .sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0)),
        [graph],
    );

    const search = async () => {
        if (!query.trim()) return;
        setSearching(true);
        setError(null);
        try {
            const result = await api.searchMemory(query.trim(), 8);
            setHits(result.hits || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setSearching(false);
        }
    };

    const previewContext = async () => {
        if (!contextQuery.trim()) return;
        setPreviewing(true);
        setError(null);
        try {
            setContextPreview(await api.memoryContext(contextQuery.trim()));
        } catch (err) {
            setError(err.message);
        } finally {
            setPreviewing(false);
        }
    };

    const ingest = async () => {
        if (!ingestText.trim()) return;
        setIngesting(true);
        setError(null);
        setIngestResult(null);
        try {
            const result = await api.ingestMemory(ingestText.trim(), {
                source: 'notes',
                title: ingestTitle.trim() || 'Pasted notes',
            });
            setIngestResult(result);
            setIngestText('');
            setIngestTitle('');
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setIngesting(false);
        }
    };

    const rate = async (concept, score) => {
        try {
            await api.setMastery(concept, score, 'self-report');
            await load();
        } catch (err) {
            setError(err.message);
        }
    };

    const reset = async () => {
        // Destructive and unrecoverable, so confirm explicitly.
        if (!window.confirm('Delete every stored concept, chunk and mastery score? This cannot be undone.')) {
            return;
        }
        try {
            await api.resetMemory();
            notify('Memory cleared', 'The knowledge graph is now empty.');
            setHits(null);
            setContextPreview(null);
            setSelected(null);
            await load();
        } catch (err) {
            setError(err.message);
        }
    };

    const stats = graph?.stats || {};
    const selectedNode = graph?.nodes?.find((node) => node.id === selected);

    return (
        <div className="animate-fade">
            <PageHeader
                title="Memory Graph"
                subtitle="Everything NEURA has learned about how you learn."
                badge={
                    <Badge tone="accent">
                        <Database size={11} /> {stats.backend || 'in-process'}
                    </Badge>
                }
                actions={
                    <>
                        <Select value={view} onChange={(event) => setView(event.target.value)}>
                            <option value="3d">3D graph</option>
                            <option value="list">List</option>
                        </Select>
                        <Button variant="danger" size="sm" icon={Trash2} onClick={reset}>
                            Clear
                        </Button>
                    </>
                }
            />

            <ErrorNote error={error} onRetry={load} className="mb-6" />

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    { label: 'Concepts', value: stats.concepts ?? 0, icon: Brain },
                    { label: 'Connections', value: stats.edges ?? 0, icon: Network },
                    { label: 'Memory chunks', value: stats.chunks ?? 0, icon: Database },
                    { label: 'Weak spots', value: stats.weak ?? 0, icon: TrendingDown },
                ].map((stat) => (
                    <Panel key={stat.label} className="p-4">
                        <stat.icon size={16} className="accent-text mb-2" />
                        <p className="text-app tabular text-2xl font-bold">{stat.value}</p>
                        <p className="text-app-muted text-xs">{stat.label}</p>
                    </Panel>
                ))}
            </div>

            {loading ? (
                <Spinner label="Loading your graph…" />
            ) : !graph?.nodes?.length ? (
                <Panel className="mb-6">
                    <EmptyState icon={Brain} title="Your graph is empty">
                        Concepts appear here automatically as you chat, upload PDFs, take quizzes and run study
                        agents. You can also paste notes below to seed it directly.
                    </EmptyState>
                </Panel>
            ) : view === '3d' && scene ? (
                <Panel className="mb-6 overflow-hidden">
                    <SceneRenderer
                        scene={scene}
                        className="h-[420px] w-full"
                        onSelect={(spec) => setSelected(spec.id)}
                        selectedId={selected}
                        enableXR={false}
                        showGrid={false}
                    />
                    <div className="border-app flex flex-wrap items-center gap-4 border-t px-4 py-2.5 text-xs">
                        {MASTERY_COLOURS.map((band) => (
                            <span key={band.label} className="text-app-muted flex items-center gap-1.5">
                                <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ background: band.colour }}
                                />
                                {band.label}
                            </span>
                        ))}
                        <span className="text-app-muted ml-auto">
                            Click a node for detail · drag to orbit
                        </span>
                    </div>
                </Panel>
            ) : (
                <Panel className="mb-6 p-4">
                    <div className="space-y-2">
                        {[...graph.nodes]
                            .sort((a, b) => (a.mastery ?? 0.5) - (b.mastery ?? 0.5))
                            .map((node) => {
                                const band = masteryStyle(node.mastery ?? 0.5);
                                return (
                                    <button
                                        key={node.id}
                                        type="button"
                                        onClick={() => setSelected(node.id)}
                                        className={clsx(
                                            'focus-ring w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                                            selected === node.id
                                                ? 'accent-bg'
                                                : 'hover:bg-[var(--border-subtle)]',
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span
                                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                                style={{ background: band.colour }}
                                            />
                                            <span className="text-app min-w-0 flex-1 truncate text-sm font-medium">
                                                {node.name}
                                            </span>
                                            <Badge>{node.kind}</Badge>
                                            <span className="text-app-muted tabular w-10 text-right text-xs">
                                                {Math.round((node.mastery ?? 0.5) * 100)}%
                                            </span>
                                        </div>
                                        <Progress value={(node.mastery ?? 0.5) * 100} className="mt-2" />
                                    </button>
                                );
                            })}
                    </div>
                </Panel>
            )}

            {selectedNode && (
                <Panel className="accent-bg mb-6 p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="text-app text-base font-semibold">{selectedNode.name}</p>
                        <Badge>{selectedNode.kind}</Badge>
                        <Badge tone={masteryStyle(selectedNode.mastery).label === 'Weak' ? 'bad' : 'good'}>
                            {Math.round(selectedNode.mastery * 100)}% mastery
                        </Badge>
                        <Badge>seen {selectedNode.encounters}×</Badge>
                    </div>
                    {selectedNode.summary && (
                        <p className="text-app-muted mb-4 text-sm">{selectedNode.summary}</p>
                    )}
                    <p className="text-app-muted mb-2 text-xs font-semibold uppercase tracking-wider">
                        How well do you know this?
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { label: 'Not at all', score: 0.1 },
                            { label: 'Shaky', score: 0.4 },
                            { label: 'Getting it', score: 0.65 },
                            { label: 'Confident', score: 0.9 },
                        ].map((option) => (
                            <Button
                                key={option.label}
                                variant="ghost"
                                size="sm"
                                onClick={() => rate(selectedNode.name, option.score)}
                            >
                                {option.label}
                            </Button>
                        ))}
                    </div>
                </Panel>
            )}

            {weakest.length > 0 && (
                <Panel className="mb-6 border-amber-500/25 p-5">
                    <p className="text-app mb-3 flex items-center gap-2 text-sm font-semibold">
                        <TrendingDown size={15} className="text-amber-400" />
                        Weak spots the tutor will compensate for
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {weakest.map((node) => (
                            <button
                                key={node.id}
                                type="button"
                                onClick={() => setSelected(node.id)}
                                className="focus-ring rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200 transition-colors hover:bg-amber-500/20"
                            >
                                {node.name} · {Math.round(node.mastery * 100)}%
                            </button>
                        ))}
                    </div>
                    <p className="text-app-muted mt-3 text-xs">
                        These are injected into the system prompt for chat, study and voice, so explanations
                        connect back to them when relevant.
                    </p>
                </Panel>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                <Panel className="p-5">
                    <p className="text-app mb-3 flex items-center gap-2 text-sm font-semibold">
                        <Search size={15} className="accent-text" /> Search your memory
                    </p>
                    <div className="mb-3 flex gap-2">
                        <TextInput
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && search()}
                            placeholder="What did I learn about entropy?"
                        />
                        <Button onClick={search} loading={searching}>
                            Search
                        </Button>
                    </div>
                    {hits !== null && (
                        <div className="space-y-2">
                            {hits.length === 0 ? (
                                <p className="text-app-muted text-sm">
                                    Nothing stored matches that yet.
                                </p>
                            ) : (
                                hits.map((hit) => (
                                    <div key={hit.id} className="surface-raised rounded-lg p-3">
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                            <span className="accent-text truncate text-xs font-medium">
                                                {hit.title}
                                            </span>
                                            <Badge>{Math.round(hit.score * 100)}% match</Badge>
                                        </div>
                                        <p className="text-app-muted line-clamp-3 text-xs">{hit.text}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </Panel>

                <Panel className="p-5">
                    <p className="text-app mb-3 flex items-center gap-2 text-sm font-semibold">
                        <Eye size={15} className="accent-text" /> Inspect the personalisation
                    </p>
                    <p className="text-app-muted mb-3 text-xs">
                        See exactly what gets added to the prompt for a given question — nothing about the
                        tailoring is hidden from you.
                    </p>
                    <div className="mb-3 flex gap-2">
                        <TextInput
                            value={contextQuery}
                            onChange={(event) => setContextQuery(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && previewContext()}
                            placeholder="How do I differentiate sin(3x)?"
                        />
                        <Button onClick={previewContext} loading={previewing}>
                            Preview
                        </Button>
                    </div>
                    {contextPreview && (
                        <div className="surface-raised rounded-lg p-3">
                            {contextPreview.has_memory ? (
                                <pre className="text-app-muted whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
                                    {contextPreview.prompt_block}
                                </pre>
                            ) : (
                                <p className="text-app-muted text-xs">
                                    Nothing personalised yet for this question — the tutor would answer from
                                    general knowledge.
                                </p>
                            )}
                        </div>
                    )}
                </Panel>
            </div>

            <Panel className="mt-6 p-5">
                <p className="text-app mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Upload size={15} className="accent-text" /> Teach it directly
                </p>
                <TextInput
                    value={ingestTitle}
                    onChange={(event) => setIngestTitle(event.target.value)}
                    placeholder="Title (optional) — e.g. Thermodynamics lecture 4"
                    className="mb-2"
                />
                <TextArea
                    value={ingestText}
                    onChange={(event) => setIngestText(event.target.value)}
                    rows={5}
                    placeholder="Paste notes, a syllabus, or anything you want NEURA to remember…"
                    className="mb-3"
                />
                <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={ingest} loading={ingesting} disabled={!ingestText.trim()}>
                        Add to memory
                    </Button>
                    {ingestResult && (
                        <p className="text-app-muted text-xs">
                            Stored {ingestResult.chunks_added} chunk
                            {ingestResult.chunks_added === 1 ? '' : 's'}
                            {ingestResult.concepts?.length
                                ? ` · found: ${ingestResult.concepts.join(', ')}`
                                : ''}
                        </p>
                    )}
                </div>
            </Panel>

            {profile && (
                <p className="text-app-muted mt-4 text-center text-xs">
                    Learner profile: {profile.level} level · {profile.style} style · {profile.tone} tone
                </p>
            )}
        </div>
    );
};

export default Memory;
