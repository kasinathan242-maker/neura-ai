import React from 'react';
import { Languages as LangIcon, Check, Globe } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../store/useStore';

const LanguageCard = ({ code, name, native, active, onClick }) => (
    <div
        onClick={() => onClick(code)}
        className={clsx(
            "relative p-5 rounded-xl border cursor-pointer transition-all duration-200 flex items-center gap-4 group",
            active
                ? "bg-[#0e0e12] border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.1)]"
                : "bg-[#0e0e12] border-white/5 hover:border-white/20 hover:bg-white/5"
        )}
    >
        <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center text-lg font-bold text-gray-400 uppercase">
            {code}
        </div>

        <div className="flex-1">
            <h3 className={clsx("font-bold text-lg", active ? "text-white" : "text-gray-200")}>{name}</h3>
            <p className="text-sm text-gray-500">{native}</p>
        </div>

        {active ? (
            <div className="w-6 h-6 bg-cyan-500 rounded-full flex items-center justify-center shrink-0">
                <Check size={14} className="text-black" strokeWidth={3} />
            </div>
        ) : (
            <div className="w-6 h-6 rounded-full border-2 border-white/10 shrink-0 group-hover:border-white/30" />
        )}
    </div>
);

export const Languages = () => {
    const { language: activeLang, setLanguage } = useStore();

    const languages = [
        { code: 'US', name: 'English', native: 'English', id: 'en-US' },
        { code: 'IN', name: 'Tamil', native: 'தமிழ்', id: 'ta-IN' },
        { code: 'IN', name: 'Hindi', native: 'हिन्दी', id: 'hi-IN' },
        { code: 'IN', name: 'Telugu', native: 'తెలుగు', id: 'te-IN' },
        { code: 'IN', name: 'Malayalam', native: 'മലയാളം', id: 'ml-IN' },
        { code: 'IN', name: 'Kannada', native: 'ಕನ್ನಡ', id: 'kn-IN' },
        { code: 'IN', name: 'Bengali', native: 'বাংলা', id: 'bn-IN' },
        { code: 'SA', name: 'Arabic', native: 'العربية', id: 'ar-SA' },
        { code: 'FR', name: 'French', native: 'Français', id: 'fr-FR' },
        { code: 'ES', name: 'Spanish', native: 'Español', id: 'es-ES' },
        { code: 'JP', name: 'Japanese', native: '日本語', id: 'ja-JP' },
        { code: 'KR', name: 'Korean', native: '한국어', id: 'ko-KR' },
    ];

    return (
        <div className="flex flex-col animate-in fade-in zoom-in-95 duration-500 max-w-6xl mx-auto w-full pb-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                    <LangIcon className="text-cyan-500" /> Languages
                </h1>
                <p className="text-gray-400">Choose your preferred language</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {languages.map(lang => (
                    <LanguageCard
                        key={lang.id}
                        {...lang}
                        active={activeLang === lang.id}
                        onClick={() => setLanguage(lang.id)}
                    />
                ))}
            </div>

            <div className="mt-12 text-center p-8 glass-panel rounded-2xl border border-white/5 bg-[#0e0e12]">
                <Globe className="mx-auto text-cyan-500 mb-4" size={32} />
                <p className="text-gray-500">Currently using</p>
                <h2 className="text-2xl font-bold text-white mt-2">
                    {languages.find(l => l.id === activeLang)?.code === 'US' ? 'us' : ''} {languages.find(l => l.id === activeLang)?.name}
                </h2>
            </div>
        </div>
    );
};
