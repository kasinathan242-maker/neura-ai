import React from 'react';
import { Volume2, Bell, Clock, ToggleLeft, ToggleRight, Monitor, Moon, Sun } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../store/useStore';

const Toggle = ({ enabled, onToggle }) => (
    <button
        onClick={onToggle}
        className={clsx(
            "w-12 h-6 rounded-full transition-colors relative",
            enabled ? "bg-cyan-500" : "bg-white/10"
        )}
    >
        <div className={clsx(
            "w-4 h-4 rounded-full bg-white absolute top-1 transition-all",
            enabled ? "left-7" : "left-1"
        )} />
    </button>
);

const SettingSection = ({ title, icon: Icon, children }) => (
    <div className="glass-panel p-6 rounded-2xl border border-white/5 bg-[#0e0e12] mb-6">
        <div className="flex items-center gap-3 mb-6">
            <Icon size={20} className="text-cyan-500" />
            <h2 className="text-xl font-bold text-white">{title}</h2>
        </div>
        <div className="space-y-6">
            {children}
        </div>
    </div>
);

const SettingItem = ({ title, desc, enabled, onToggle }) => (
    <div className="flex items-center justify-between">
        <div>
            <h3 className="font-medium text-white mb-1">{title}</h3>
            <p className="text-sm text-gray-400">{desc}</p>
        </div>
        <Toggle enabled={enabled} onToggle={onToggle} />
    </div>
);

export const Settings = () => {
    const { settings, updateSettings } = useStore();

    const toggle = (key) => updateSettings({ [key]: !settings[key] });

    return (
        <div className="flex flex-col animate-in fade-in zoom-in-95 duration-500 max-w-4xl mx-auto w-full pb-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
                <p className="text-gray-400">Configure your NEURA AI experience</p>
            </div>

            <SettingSection title="Voice & Audio" icon={Volume2}>
                <SettingItem
                    title="Voice Responses"
                    desc="Enable AI voice playback for responses"
                    enabled={settings?.voiceResponses}
                    onToggle={() => toggle('voiceResponses')}
                />
                <SettingItem
                    title="Auto-play Audio"
                    desc="Automatically play voice responses"
                    enabled={settings?.autoPlay}
                    onToggle={() => toggle('autoPlay')}
                />
            </SettingSection>

            <SettingSection title="Notifications" icon={Bell}>
                <SettingItem
                    title="Study Reminders"
                    desc="Get notified about study sessions"
                    enabled={settings?.studyReminders}
                    onToggle={() => toggle('studyReminders')}
                />
                <SettingItem
                    title="Task Deadlines"
                    desc="Alerts for upcoming task deadlines"
                    enabled={settings?.taskDeadlines}
                    onToggle={() => toggle('taskDeadlines')}
                />
            </SettingSection>

            <SettingSection title="Study Preferences" icon={Clock}>
                <SettingItem
                    title="Pomodoro Timer"
                    desc="25 minute focus sessions"
                    enabled={settings?.pomodoro}
                    onToggle={() => toggle('pomodoro')}
                />
            </SettingSection>
        </div>
    );
};
