import React, { useEffect, useState } from 'react';
import { Bell, Check, Cpu, Database, Server, Trash2, Wifi, WifiOff } from 'lucide-react';
import clsx from 'clsx';
import {
    Badge,
    Button,
    ErrorNote,
    PageHeader,
    Panel,
    Select,
    Spinner,
} from '../components/ui';
import api, { API_BASE, getUserId } from '../lib/api';
import { useStore } from '../store/useStore';

/** Settings, plus a live view of what the deployment can actually do. */

const Toggle = ({ label, description, checked, onChange }) => (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
        <span className="min-w-0">
            <span className="text-app block text-sm font-medium">{label}</span>
            {description && <span className="text-app-muted mt-0.5 block text-xs">{description}</span>}
        </span>
        <span className="relative mt-0.5 shrink-0">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="peer sr-only"
            />
            <span
                className={clsx(
                    'block h-5 w-9 rounded-full transition-colors',
                    checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]',
                )}
            />
            <span
                className={clsx(
                    'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                    checked && 'translate-x-4',
                )}
            />
        </span>
    </label>
);

export const Settings = () => {
    const settings = useStore((s) => s.settings);
    const updateSettings = useStore((s) => s.updateSettings);
    const health = useStore((s) => s.health);
    const healthError = useStore((s) => s.healthError);
    const checkHealth = useStore((s) => s.checkHealth);
    const requestPermission = useStore((s) => s.requestNotificationPermission);
    const notify = useStore((s) => s.notify);
    const scheduled = useStore((s) => s.scheduledNotifications);

    const [permission, setPermission] = useState(
        typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    );
    const [profile, setProfile] = useState(null);
    const [error, setError] = useState(null);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        api.getProfile()
            .then((result) => setProfile(result.profile))
            .catch(() => {});
    }, []);

    const refresh = async () => {
        setChecking(true);
        await checkHealth();
        setChecking(false);
    };

    const saveProfile = async (patch) => {
        setError(null);
        const next = { ...profile, ...patch };
        setProfile(next);
        try {
            await api.setProfile(patch);
        } catch (err) {
            setError(err.message);
        }
    };

    const askPermission = async () => {
        const result = await requestPermission();
        setPermission(result);
        if (result === 'granted') {
            notify('Notifications enabled', 'Study reminders will appear here and on your desktop.');
        }
    };

    const clearLocal = () => {
        if (!window.confirm('Clear all local data — tasks, notes, flashcards, XP and settings?')) return;
        try {
            localStorage.removeItem('neura-storage');
        } catch { /* storage unavailable */ }
        window.location.reload();
    };

    const provider = health?.active_provider;

    return (
        <div className="animate-fade max-w-3xl">
            <PageHeader
                title="Settings"
                subtitle="Behaviour, notifications and system status."
                actions={
                    <Button variant="ghost" size="sm" onClick={refresh} loading={checking}>
                        Re-check
                    </Button>
                }
            />

            <ErrorNote error={error || healthError} onRetry={refresh} className="mb-6" />

            <Panel className="mb-6 p-5">
                <p className="text-app mb-4 flex items-center gap-2 text-sm font-semibold">
                    <Server size={15} className="accent-text" /> System status
                </p>

                {!health && !healthError ? (
                    <Spinner label="Checking the API…" />
                ) : (
                    <dl className="space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-4">
                            <dt className="text-app-muted">API endpoint</dt>
                            <dd className="text-app truncate font-mono text-xs">{API_BASE}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <dt className="text-app-muted">Reachable</dt>
                            <dd>
                                {health ? (
                                    <Badge tone="good">
                                        <Wifi size={10} /> yes
                                    </Badge>
                                ) : (
                                    <Badge tone="bad">
                                        <WifiOff size={10} /> no
                                    </Badge>
                                )}
                            </dd>
                        </div>
                        {health && (
                            <>
                                <div className="flex items-center justify-between gap-4">
                                    <dt className="text-app-muted">Language model</dt>
                                    <dd>
                                        {provider === 'offline' ? (
                                            <Badge tone="warn">not configured</Badge>
                                        ) : (
                                            <Badge tone="good">
                                                {provider} · {health.active_model}
                                            </Badge>
                                        )}
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <dt className="text-app-muted">Vision</dt>
                                    <dd>
                                        <Badge tone={health.vision_available ? 'good' : 'warn'}>
                                            {health.vision_available ? health.vision_model : 'unavailable'}
                                        </Badge>
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <dt className="text-app-muted">Persistence</dt>
                                    <dd>
                                        <Badge tone={health.persistence === 'redis' ? 'good' : 'warn'}>
                                            <Database size={10} /> {health.persistence}
                                        </Badge>
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <dt className="text-app-muted">Knowledge graph</dt>
                                    <dd>
                                        <Badge>{health.graph_backend}</Badge>
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <dt className="text-app-muted">Web research</dt>
                                    <dd>
                                        <Badge tone={health.web_search ? 'good' : 'neutral'}>
                                            {health.web_search ? 'enabled' : 'disabled'}
                                        </Badge>
                                    </dd>
                                </div>
                            </>
                        )}
                    </dl>
                )}

                {provider === 'offline' && (
                    <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                        <p className="text-app text-xs font-medium">No language model is configured</p>
                        <p className="text-app-muted mt-1 text-xs">
                            Locally: install Ollama and run <code className="accent-text">ollama pull llama3.2</code>.
                            On a deployment: set <code className="accent-text">LLM_API_KEY</code> (and
                            optionally <code className="accent-text">LLM_BASE_URL</code> and{' '}
                            <code className="accent-text">LLM_MODEL</code>) in your project's environment
                            variables. Until then every screen works but answers are structured placeholders.
                        </p>
                    </div>
                )}

                {health?.persistence === 'memory' && (
                    <p className="text-app-muted mt-3 text-xs">
                        Data is held in the server's memory, so uploads and plans can disappear when the
                        process restarts. Attach an Upstash Redis integration and set{' '}
                        <code className="accent-text">KV_REST_API_URL</code> /{' '}
                        <code className="accent-text">KV_REST_API_TOKEN</code> to make it durable.
                    </p>
                )}
            </Panel>

            <Panel className="mb-6 p-5">
                <p className="text-app mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Cpu size={15} className="accent-text" /> AI behaviour
                </p>
                <div className="divide-y divide-[var(--border-subtle)]">
                    <Toggle
                        label="Stream responses"
                        description="Show tokens as they arrive rather than waiting for the whole answer."
                        checked={settings.streamResponses}
                        onChange={(value) => updateSettings({ streamResponses: value })}
                    />
                    <Toggle
                        label="Personalised memory"
                        description="Let past conversations and quiz results shape new answers."
                        checked={settings.personalisedMemory}
                        onChange={(value) => updateSettings({ personalisedMemory: value })}
                    />
                    <Toggle
                        label="Speak answers aloud"
                        description="Read vision and voice replies out loud by default."
                        checked={settings.voiceResponses}
                        onChange={(value) => updateSettings({ voiceResponses: value })}
                    />
                    <Toggle
                        label='Listen for "Hey NEURA"'
                        description="Holds the microphone open the whole time this is on. Off by default."
                        checked={settings.wakeWord}
                        onChange={(value) => updateSettings({ wakeWord: value })}
                    />
                    <Toggle
                        label="Show the focus timer"
                        checked={settings.pomodoro}
                        onChange={(value) => updateSettings({ pomodoro: value })}
                    />
                </div>

                <div className="border-app mt-4 border-t pt-4">
                    <p className="text-app-muted mb-2 text-xs font-medium">On-device inference</p>
                    <Select
                        value={settings.edgeMode}
                        onChange={(event) => updateSettings({ edgeMode: event.target.value })}
                        className="w-full"
                    >
                        <option value="auto">Auto — only when the server is unreachable</option>
                        <option value="always">Always — run every chat in this browser</option>
                        <option value="never">Never — server only</option>
                    </Select>
                </div>
            </Panel>

            {profile && (
                <Panel className="mb-6 p-5">
                    <p className="text-app mb-4 text-sm font-semibold">How you like to be taught</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {[
                            {
                                key: 'level',
                                label: 'Level',
                                options: ['beginner', 'intermediate', 'advanced'],
                            },
                            {
                                key: 'style',
                                label: 'Style',
                                options: ['balanced', 'examples-first', 'theory-first', 'visual'],
                            },
                            {
                                key: 'tone',
                                label: 'Tone',
                                options: ['encouraging', 'direct', 'socratic'],
                            },
                        ].map((field) => (
                            <div key={field.key}>
                                <p className="text-app-muted mb-1.5 text-xs font-medium">{field.label}</p>
                                <Select
                                    value={profile[field.key]}
                                    onChange={(event) => saveProfile({ [field.key]: event.target.value })}
                                    className="w-full"
                                >
                                    {field.options.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                        ))}
                    </div>
                </Panel>
            )}

            <Panel className="mb-6 p-5">
                <p className="text-app mb-4 flex items-center gap-2 text-sm font-semibold">
                    <Bell size={15} className="accent-text" /> Notifications
                </p>

                <div className="mb-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-app text-sm">Desktop notifications</p>
                        <p className="text-app-muted mt-0.5 text-xs">
                            {permission === 'granted'
                                ? 'Enabled. Study reminders will appear even when this tab is in the background.'
                                : permission === 'denied'
                                  ? 'Blocked. Re-enable it in your browser site settings.'
                                  : permission === 'unsupported'
                                    ? 'This browser does not support notifications.'
                                    : 'Not yet requested.'}
                        </p>
                    </div>
                    {permission === 'granted' ? (
                        <Badge tone="good">
                            <Check size={10} /> on
                        </Badge>
                    ) : (
                        <Button
                            size="sm"
                            onClick={askPermission}
                            disabled={permission === 'denied' || permission === 'unsupported'}
                        >
                            Enable
                        </Button>
                    )}
                </div>

                <div className="divide-y divide-[var(--border-subtle)]">
                    <Toggle
                        label="Study reminders"
                        description="Nudges when an agent-scheduled session or micro-quiz is due."
                        checked={settings.studyReminders}
                        onChange={(value) => updateSettings({ studyReminders: value })}
                    />
                    <Toggle
                        label="Task deadlines"
                        checked={settings.taskDeadlines}
                        onChange={(value) => updateSettings({ taskDeadlines: value })}
                    />
                </div>

                {scheduled.length > 0 && (
                    <p className="text-app-muted border-app mt-4 border-t pt-3 text-xs">
                        {scheduled.filter((item) => !item.fired).length} reminder(s) pending.
                    </p>
                )}
            </Panel>

            <Panel className="p-5">
                <p className="text-app mb-3 text-sm font-semibold">Data</p>
                <p className="text-app-muted mb-3 text-xs">
                    Your anonymous id is <code className="accent-text">{getUserId()}</code>. There are no
                    accounts — this id is what keys your memory on the server.
                </p>
                <div className="flex flex-wrap gap-2">
                    <Button variant="danger" size="sm" icon={Trash2} onClick={clearLocal}>
                        Clear local data
                    </Button>
                    <Button
                        variant="danger"
                        size="sm"
                        icon={Database}
                        onClick={async () => {
                            if (!window.confirm('Delete your server-side memory and knowledge graph?')) return;
                            try {
                                await api.resetMemory();
                                notify('Server memory cleared', 'Your knowledge graph is now empty.');
                            } catch (err) {
                                setError(err.message);
                            }
                        }}
                    >
                        Clear server memory
                    </Button>
                </div>
            </Panel>
        </div>
    );
};

export default Settings;
