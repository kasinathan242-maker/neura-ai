import React, { useEffect, useState } from 'react';
import { Check, Globe, Mic, Volume2 } from 'lucide-react';
import clsx from 'clsx';
import { Badge, PageHeader, Panel } from '../components/ui';
import { speechSynthesisAvailable } from '../lib/voicePipeline';
import { useStore } from '../store/useStore';

/**
 * Language selection for speech recognition and synthesis.
 *
 * Availability is probed rather than assumed: which voices exist depends on the
 * OS and browser, so each language shows whether this device can actually speak
 * it before the user picks it.
 */

const LANGUAGES = [
    { code: 'en-US', name: 'English', region: 'United States', flag: '🇺🇸' },
    { code: 'en-GB', name: 'English', region: 'United Kingdom', flag: '🇬🇧' },
    { code: 'en-IN', name: 'English', region: 'India', flag: '🇮🇳' },
    { code: 'hi-IN', name: 'हिन्दी', region: 'Hindi', flag: '🇮🇳' },
    { code: 'ta-IN', name: 'தமிழ்', region: 'Tamil', flag: '🇮🇳' },
    { code: 'te-IN', name: 'తెలుగు', region: 'Telugu', flag: '🇮🇳' },
    { code: 'es-ES', name: 'Español', region: 'Spain', flag: '🇪🇸' },
    { code: 'fr-FR', name: 'Français', region: 'France', flag: '🇫🇷' },
    { code: 'de-DE', name: 'Deutsch', region: 'Germany', flag: '🇩🇪' },
    { code: 'pt-BR', name: 'Português', region: 'Brazil', flag: '🇧🇷' },
    { code: 'ja-JP', name: '日本語', region: 'Japan', flag: '🇯🇵' },
    { code: 'zh-CN', name: '中文', region: 'Simplified', flag: '🇨🇳' },
    { code: 'ar-SA', name: 'العربية', region: 'Arabic', flag: '🇸🇦' },
    { code: 'ko-KR', name: '한국어', region: 'Korea', flag: '🇰🇷' },
];

export const Languages = () => {
    const language = useStore((s) => s.language);
    const setLanguage = useStore((s) => s.setLanguage);
    const [voices, setVoices] = useState([]);

    useEffect(() => {
        if (!speechSynthesisAvailable()) return undefined;

        const load = () => setVoices(window.speechSynthesis.getVoices());
        load();
        // Chrome populates the voice list asynchronously after this event.
        window.speechSynthesis.addEventListener('voiceschanged', load);
        return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
    }, []);

    const voiceCountFor = (code) =>
        voices.filter((voice) => voice.lang?.startsWith(code.split('-')[0])).length;

    const preview = (code) => {
        if (!speechSynthesisAvailable()) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance('This is how I will sound.');
        utterance.lang = code;
        const match = voices.find((voice) => voice.lang === code) ||
            voices.find((voice) => voice.lang?.startsWith(code.split('-')[0]));
        if (match) utterance.voice = match;
        window.speechSynthesis.speak(utterance);
    };

    return (
        <div className="animate-fade max-w-3xl">
            <PageHeader
                title="Languages"
                subtitle="Sets the language for speech recognition and spoken replies."
                badge={
                    <Badge tone="accent">
                        <Globe size={11} /> {voices.length} voices on this device
                    </Badge>
                }
            />

            <div className="grid gap-3 sm:grid-cols-2">
                {LANGUAGES.map((option) => {
                    const active = language === option.code;
                    const available = voiceCountFor(option.code);
                    return (
                        <div
                            key={option.code}
                            className={clsx(
                                'flex items-center gap-3 rounded-xl border p-4 transition-all',
                                active ? 'border-[var(--accent)] accent-bg' : 'border-app',
                            )}
                        >
                            <button
                                type="button"
                                onClick={() => setLanguage(option.code)}
                                className="focus-ring flex min-w-0 flex-1 items-center gap-3 text-left"
                            >
                                <span className="text-2xl">{option.flag}</span>
                                <span className="min-w-0">
                                    <span className="text-app block truncate text-sm font-semibold">
                                        {option.name}
                                    </span>
                                    <span className="text-app-muted block text-xs">
                                        {option.region} · {option.code}
                                    </span>
                                </span>
                            </button>

                            <div className="flex shrink-0 items-center gap-1.5">
                                {available > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => preview(option.code)}
                                        aria-label={`Hear ${option.name}`}
                                        title={`${available} voice(s) available`}
                                        className="text-app-muted hover:accent-text focus-ring rounded-lg p-1.5 transition-colors"
                                    >
                                        <Volume2 size={15} />
                                    </button>
                                ) : (
                                    <span
                                        title="No installed voice for this language, so replies will not be spoken."
                                        className="text-app-muted p-1.5 opacity-40"
                                    >
                                        <Volume2 size={15} />
                                    </span>
                                )}
                                {active && (
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)]">
                                        <Check size={11} className="text-black" />
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <Panel className="mt-6 p-4">
                <p className="text-app-muted flex items-start gap-2 text-xs">
                    <Mic size={13} className="mt-0.5 shrink-0" />
                    Recognition quality depends on your browser's speech service, and a greyed-out speaker
                    means this device has no installed voice for that language — replies will still be shown
                    as text. The tutor answers in whichever language you speak to it.
                </p>
            </Panel>
        </div>
    );
};

export default Languages;
