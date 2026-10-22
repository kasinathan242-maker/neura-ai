import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Square, Volume2, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { audioManager } from "../services/audio";
import { api } from "../services/api";

interface VoiceMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
  language?: string;
}

export const VoiceTutor: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [transcript, setTranscript] = useState<VoiceMessage[]>([
    {
      id: "init",
      sender: "assistant",
      text: "Vanakkam! I am NEURA AI, your personal Socratic tutor for Anna University engineering subjects. You can speak in English or Tamil. What topic shall we master today?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [liveUserSpeech, setLiveUserSpeech] = useState<string>("");
  const [liveAssistantSpeech, setLiveAssistantSpeech] = useState<string>("");
  const [selectedVoice, setSelectedVoice] = useState<string>("ta_IN");
  const [rmsEnergy, setRmsEnergy] = useState<number>(0.0);
  const [statusMessage, setStatusMessage] = useState<string>("Ready to listen");

  const wsRef = useRef<WebSocket | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Monitor mic energy for reactive visualizer orb
  useEffect(() => {
    const updateEnergy = () => {
      if (isRecording) {
        const energy = audioManager.getEnergy();
        setRmsEnergy(energy);
      } else if (isPlaying) {
        // Subtle simulated rhythmic wave during synthesized speech playback
        const synthetic = 0.35 + Math.sin(Date.now() / 150) * 0.2;
        setRmsEnergy(synthetic);
      } else {
        setRmsEnergy(0.0);
      }
      animFrameRef.current = requestAnimationFrame(updateEnergy);
    };

    animFrameRef.current = requestAnimationFrame(updateEnergy);
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isRecording, isPlaying]);

  // Connect to Duplex Voice WebSocket
  const connectWebSocket = async () => {
    try {
      const token = await api.ensureAuthenticated();
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host || "localhost:8000";
      const wsUrl = `${protocol}//${host}/voice?token=${token}&voice=${selectedVoice}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        setStatusMessage("Voice link connected");
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "transcript") {
            setLiveUserSpeech(data.text);
          } else if (data.type === "token") {
            setLiveAssistantSpeech((prev) => prev + data.text);
          } else if (data.type === "audio_chunk" && data.data) {
            setIsPlaying(true);
            await audioManager.playBase64Wav(data.data);
          } else if (data.type === "turn_end") {
            setIsPlaying(false);
            if (liveUserSpeech) {
              setTranscript((prev) => [
                ...prev,
                {
                  id: `usr-${Date.now()}`,
                  sender: "user",
                  text: liveUserSpeech,
                  timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                },
              ]);
              setLiveUserSpeech("");
            }
            if (liveAssistantSpeech) {
              setTranscript((prev) => [
                ...prev,
                {
                  id: `ast-${Date.now()}`,
                  sender: "assistant",
                  text: liveAssistantSpeech,
                  timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                },
              ]);
              setLiveAssistantSpeech("");
            }
            setStatusMessage("Ready to listen");
          } else if (data.type === "interrupted") {
            setIsPlaying(false);
            audioManager.clearPlaybackQueue();
            setStatusMessage("Interrupted (Barge-in registered)");
          }
        } catch {
          // If non-JSON message received
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
        setStatusMessage("WebSocket offline (Direct streaming active)");
      };

      ws.onclose = () => {
        setWsConnected(false);
      };
    } catch {
      setWsConnected(false);
    }
  };

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      audioManager.stopRecording();
    };
  }, [selectedVoice]);

  const toggleRecording = async () => {
    if (isRecording) {
      audioManager.stopRecording();
      setIsRecording(false);
      setStatusMessage("Processing speech...");
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "finish_utterance" }));
      }
    } else {
      try {
        setStatusMessage("Listening...");
        await audioManager.startRecording(
          (pcmChunk) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(pcmChunk);
            }
          },
          (err) => {
            console.error("Recording error:", err);
            setStatusMessage("Microphone permission denied");
            setIsRecording(false);
          }
        );
        setIsRecording(true);
      } catch (err) {
        console.error("Mic start failed:", err);
        setIsRecording(false);
      }
    }
  };

  const handleInterrupt = () => {
    audioManager.clearPlaybackQueue();
    setIsPlaying(false);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "interrupt" }));
    }
    setStatusMessage("Barge-in: playback halted");
  };

  const socraticStarters = [
    "Dijkstra algorithm step-by-step sollu pa (Tamil)",
    "Why does Bellman-Ford handle negative edges?",
    "Derive the Master Theorem case 2 for QuickSort",
    "Explain Turing Machine decidability simply",
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Visualizer & Voice Orb Column */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        <div className="bezel-shell">
          <div className="bezel-core p-8 flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[460px]">
            {/* Background reactive particle field */}
            <div className="absolute inset-0 bg-radial-vignette opacity-50 pointer-events-none" />

            {/* Microservice Voice Health Badge */}
            <div className="flex items-center gap-2 mb-8 z-10">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono ${
                  wsConnected
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                    : "bg-amber-500/10 border border-amber-500/30 text-amber-400"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    wsConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                  }`}
                />
                {wsConnected ? "Duplex WebSocket Linked" : "Standby (Offline Safe)"}
              </span>
            </div>

            {/* Reactive Visualizer Orb (Triple concentric rings with RMS scale & glow) */}
            <div className="relative flex items-center justify-center my-6 z-10">
              {/* Outer pulsing atmospheric aura */}
              <div
                className="absolute w-56 h-56 rounded-full bg-emerald-500/15 filter blur-3xl transition-transform duration-300"
                style={{
                  transform: `scale(${1 + rmsEnergy * 1.5})`,
                  opacity: 0.3 + rmsEnergy * 0.7,
                }}
              />

              {/* Middle acoustic reactive ring */}
              <div
                className="absolute w-44 h-44 rounded-full border border-emerald-400/30 transition-transform duration-200"
                style={{
                  transform: `scale(${1 + rmsEnergy * 0.8})`,
                  borderColor: isRecording ? "rgba(16, 185, 129, 0.6)" : isPlaying ? "rgba(56, 189, 248, 0.6)" : "rgba(255, 255, 255, 0.1)",
                }}
              />

              {/* Core Physical Orb Button */}
              <button
                onClick={toggleRecording}
                className={`relative w-32 h-32 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all duration-500 group ${
                  isRecording
                    ? "bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-[0_0_40px_rgba(16,185,129,0.5)] scale-105"
                    : isPlaying
                    ? "bg-gradient-to-tr from-cyan-600 to-blue-500 text-white shadow-[0_0_35px_rgba(6,182,212,0.4)]"
                    : "bg-gradient-to-b from-[#1c1c24] to-[#121217] text-zinc-300 border border-white/[0.12] hover:border-emerald-500/50 hover:text-white"
                }`}
              >
                {isRecording ? (
                  <Mic className="w-10 h-10 animate-bounce" />
                ) : isPlaying ? (
                  <Volume2 className="w-10 h-10 animate-pulse text-cyan-200" />
                ) : (
                  <Mic className="w-10 h-10 text-zinc-400 group-hover:text-emerald-400 transition-colors" />
                )}
                <span className="text-[10px] font-mono tracking-widest uppercase mt-1">
                  {isRecording ? "Listening" : isPlaying ? "Speaking" : "Tap to Speak"}
                </span>
              </button>
            </div>

            {/* Dynamic Status Display */}
            <div className="z-10 mt-6 max-w-xs">
              <p className="text-xs font-mono text-zinc-400 tracking-wide uppercase">
                {statusMessage}
              </p>
              {isRecording && (
                <div className="flex items-center justify-center gap-1 mt-3">
                  <span className="w-1 h-3 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="w-1 h-5 bg-emerald-400 rounded-full animate-pulse delay-75" />
                  <span className="w-1 h-7 bg-emerald-400 rounded-full animate-pulse delay-150" />
                  <span className="w-1 h-4 bg-emerald-400 rounded-full animate-pulse delay-100" />
                  <span className="w-1 h-2 bg-emerald-400 rounded-full animate-pulse" />
                </div>
              )}
            </div>

            {/* Primary Controls Row: Interrupt & Push-to-Talk */}
            <div className="flex items-center gap-3 mt-8 z-10">
              {isPlaying && (
                <button
                  onClick={handleInterrupt}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-semibold hover:bg-rose-500/30 transition-all shadow-lg active:scale-95"
                >
                  <Square className="w-3.5 h-3.5 fill-rose-300" />
                  <span>Barge-in / Interrupt</span>
                </button>
              )}
              {isRecording && (
                <button
                  onClick={toggleRecording}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-medium hover:text-white transition-all"
                >
                  <MicOff className="w-3.5 h-3.5" />
                  <span>Finish Turn</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Neural Speech Persona Selector */}
        <div className="bezel-shell">
          <div className="bezel-core p-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-white">Synthesizer Voice Persona</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">Piper Neural On-Device ONNX</div>
            </div>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="bg-[#181820] text-zinc-200 border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-emerald-500/50"
            >
              <option value="ta_IN">Tamil (Selvi - ta_IN)</option>
              <option value="en_IN">Indian English (Kavitha - en_IN)</option>
              <option value="en_US">Global English (Lessac - en_US)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Socratic Dialogue Stream & Suggestions Column */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        {/* Live Utterance Banner */}
        {(liveUserSpeech || liveAssistantSpeech) && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 flex items-start gap-3 animate-fadeIn">
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-sm leading-relaxed">
              {liveUserSpeech && <div className="font-medium text-emerald-300">"{liveUserSpeech}"</div>}
              {liveAssistantSpeech && <div className="text-zinc-200 mt-1">{liveAssistantSpeech}</div>}
            </div>
          </div>
        )}

        {/* Conversation Turn Transcript Container */}
        <div className="bezel-shell">
          <div className="bezel-core p-6 flex flex-col h-[460px]">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Socratic Dialogue Transcript</h3>
              </div>
              <button
                onClick={() => setTranscript([transcript[0]])}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 font-mono transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            {/* Scrollable Transcript List */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {transcript.map((msg) => {
                const isAssistant = msg.sender === "assistant";
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isAssistant ? "items-start" : "items-end"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                        isAssistant
                          ? "bg-white/[0.04] text-zinc-200 border border-white/[0.08]"
                          : "bg-emerald-600/20 text-emerald-100 border border-emerald-500/30"
                      }`}
                    >
                      <p>{msg.text}</p>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-mono mt-1 px-1">
                      {isAssistant ? "NEURA AI" : "You"} · {msg.timestamp}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Socratic Practice Prompts & Anna University Topic Starters */}
        <div className="bezel-shell">
          <div className="bezel-core p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-emerald-400" />
              <div className="text-xs font-semibold text-white">Quick Socratic Starters</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {socraticStarters.map((starter, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setLiveUserSpeech(starter);
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                      wsRef.current.send(JSON.stringify({ type: "text_query", text: starter }));
                    }
                  }}
                  className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-emerald-500/40 text-left text-xs text-zinc-400 hover:text-emerald-300 transition-all active:scale-[0.98]"
                >
                  "{starter}"
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
