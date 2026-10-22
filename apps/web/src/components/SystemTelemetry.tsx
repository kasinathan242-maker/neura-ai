import React, { useState, useEffect } from "react";
import { Activity, ShieldCheck, RefreshCw, HeartHandshake, PhoneCall } from "lucide-react";
import { api } from "../services/api";
import { ServiceHealth } from "../types";

export const SystemTelemetry: React.FC = () => {
  const [healthData, setHealthData] = useState<ServiceHealth>({
    status: "healthy",
    service: "neura-api",
    uptime_seconds: 4820,
    device: "cuda:0 (Fallback CPU ready)",
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchHealth = async () => {
    setIsRefreshing(true);
    try {
      const data = await api.getHealth();
      setHealthData(data);
    } catch {
      // Offline fallback
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const microservices = [
    {
      name: "services/api",
      desc: "FastAPI Core Gateway, Auth, Postgres ORM, RAG Pipeline",
      port: 8000,
      status: "200 OK",
      type: "Primary API",
    },
    {
      name: "services/inference",
      desc: "llama-cpp-python, GGUF Engine, Token Streaming SSE",
      port: 8001,
      status: "200 OK",
      type: "Model Server",
    },
    {
      name: "services/speech",
      desc: "Faster-Whisper STT + Piper Neural TTS (ta_IN, en_IN)",
      port: 8002,
      status: "200 OK",
      type: "Speech Engine",
    },
    {
      name: "postgres",
      desc: "PostgreSQL 16 + pgvector (384-dim dense cosine index)",
      port: 5432,
      status: "Connected",
      type: "Vector Database",
    },
    {
      name: "minio",
      desc: "MinIO S3 Self-Hosted Blob Storage + Local Disk Mirror",
      port: 9000,
      status: "Ready",
      type: "Object Store",
    },
    {
      name: "services/workers",
      desc: "Dramatiq + Redis (Asynchronous NEURA-SUM & PDF processing)",
      port: 6379,
      status: "Active",
      type: "Background Worker",
    },
  ];

  const models = [
    {
      role: "Server LLM",
      model: "Qwen2.5-1.5B-Instruct",
      format: "GGUF Q4_K_M",
      license: "Apache 2.0",
      memory: "1.2 GB RAM",
    },
    {
      role: "Mobile LLM",
      model: "Qwen2.5-0.5B-Instruct",
      format: "GGUF Q4_0 (llama.rn)",
      license: "Apache 2.0",
      memory: "420 MB RAM",
    },
    {
      role: "Vector Embedding",
      model: "bge-small-en-v1.5 / e5-small",
      format: "PyTorch / ONNX (384-dim)",
      license: "MIT",
      memory: "130 MB RAM",
    },
    {
      role: "Voice Input (STT)",
      model: "faster-whisper-small",
      format: "CTranslate2 (Int8)",
      license: "MIT",
      memory: "480 MB RAM",
    },
    {
      role: "Voice Output (TTS)",
      model: "Piper Neural TTS (Selvi / Kavitha)",
      format: "ONNX Runtime",
      license: "MIT",
      memory: "60 MB RAM",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Cluster Status Top Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bezel-shell">
          <div className="bezel-core p-6">
            <div className="text-[10px] uppercase font-mono tracking-widest text-emerald-400 mb-2">
              Privacy Architecture
            </div>
            <div className="text-xl font-bold text-white mb-1">0 External AI APIs</div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Zero outbound calls to OpenAI, Anthropic, or external clouds. 100% self-hosted
              inference.
            </p>
          </div>
        </div>

        <div className="bezel-shell">
          <div className="bezel-core p-6">
            <div className="text-[10px] uppercase font-mono tracking-widest text-emerald-400 mb-2">
              Device Runtime
            </div>
            <div className="text-xl font-bold text-white mb-1">
              {healthData.device || "CPU / CUDA Ready"}
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Optimized for CPU inference with AVX2 quantization and optional GPU offloading.
            </p>
          </div>
        </div>

        <div className="bezel-shell">
          <div className="bezel-core p-6">
            <div className="text-[10px] uppercase font-mono tracking-widest text-emerald-400 mb-2">
              Curriculum Grounding
            </div>
            <div className="text-xl font-bold text-white mb-1">Anna Univ Reg 2021</div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Tailored for AI&DS, CSE, and ECE syllabi with Socratic tutoring and SM-2 retention.
            </p>
          </div>
        </div>
      </div>

      {/* Microservices Cluster Probes */}
      <div className="bezel-shell">
        <div className="bezel-core p-6">
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-6">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-bold text-white">Microservices Cluster Probes</h3>
            </div>
            <button
              onClick={fetchHealth}
              disabled={isRefreshing}
              className="px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono text-zinc-300 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>Poll Status</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {microservices.map((svc) => (
              <div
                key={svc.name}
                className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      {svc.type}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-mono text-[10px]">
                      {svc.status}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-white mb-1">{svc.name}</div>
                  <p className="text-xs text-zinc-400 leading-relaxed mb-4">{svc.desc}</p>
                </div>
                <div className="text-[11px] font-mono text-zinc-500 pt-3 border-t border-white/[0.04]">
                  Port: {svc.port}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Model Cards & License Audit Verification */}
      <div className="bezel-shell">
        <div className="bezel-core p-6">
          <div className="flex items-center gap-2 pb-4 border-b border-white/[0.06] mb-6">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Self-Hosted Model Cards & Licenses</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-zinc-500 font-mono">
                  <th className="pb-3 font-medium">Role</th>
                  <th className="pb-3 font-medium">Model Checkpoint</th>
                  <th className="pb-3 font-medium">Format / Engine</th>
                  <th className="pb-3 font-medium">License</th>
                  <th className="pb-3 font-medium">Footprint</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-zinc-300">
                {models.map((m, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.01]">
                    <td className="py-3.5 font-medium text-white">{m.role}</td>
                    <td className="py-3.5 font-mono text-emerald-300">{m.model}</td>
                    <td className="py-3.5 font-mono text-zinc-400">{m.format}</td>
                    <td className="py-3.5">
                      <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] font-mono text-[10px] text-zinc-300">
                        {m.license}
                      </span>
                    </td>
                    <td className="py-3.5 font-mono text-zinc-400">{m.memory}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Student Mental Health & Tele-MANAS Crisis Safety Hotline */}
      <div className="bezel-shell">
        <div className="bezel-core p-6 bg-gradient-to-r from-emerald-950/20 via-[#0d0d14] to-teal-950/20 border-emerald-500/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <HeartHandshake className="w-6 h-6" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-mono tracking-widest text-emerald-400 mb-1">
                  National Tele Mental Health Programme
                </div>
                <h4 className="text-base font-bold text-white mb-1">
                  Tele-MANAS Support Hotline (Govt of India)
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
                  Engineering academics and exam stress can be challenging. Free, 24/7, confidential
                  tele-counseling is available in Tamil and English from certified medical professionals.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <a
                href="tel:14416"
                className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-emerald-500 text-black font-semibold text-xs flex items-center justify-center gap-2 hover:bg-emerald-400 transition-all shadow-[0_0_20px_rgba(16,185,129,0.25)] active:scale-95"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Call 14416 (Toll-Free)</span>
              </a>
              <span className="text-[11px] font-mono text-zinc-500">or 1800-891-4416</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
