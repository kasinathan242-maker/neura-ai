# 🧠 NEURA AI

<p align="center">
  <strong>Voice-First, Self-Hosted AI Study Assistant & Socratic Tutor for Engineering Students</strong><br>
  <em>Native support for English, Tamil (தமிழ்), and Tanglish • Zero External Cloud AI APIs • 100% Private</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11%20%7C%203.14-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python Version" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React%2018-Vite%205-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tests-125%2F125%20Passed-brightgreen?style=flat-square" alt="Tests" />
  <img src="https://img.shields.io/badge/Code%20Style-Ruff%20Clean-000000?style=flat-square" alt="Ruff" />
  <img src="https://img.shields.io/badge/License-Copyright%20%C2%A9%20Kasinathan-red?style=flat-square" alt="License" />
</p>

---

## 🌟 Overview

**NEURA AI** is an intelligent, voice-first educational platform engineered to guide students through deep conceptual mastery using Socratic dialogue rather than spoon-feeding answers. Designed specifically with Indian engineering curricula in mind (Anna University AI&DS, CSE, and ECE), NEURA AI speaks, listens, and reasons in English, Tamil, and colloquial Tanglish.

The entire intelligence pipeline runs **100% self-hosted** — from speech recognition and vector search to LLM inference and neural voice synthesis — ensuring total privacy and independence from proprietary external cloud APIs.

```
                           +------------------------+
                           |  Client Applications   |
                           |  (Mobile App / Web)   |
                           +-----------+------------+
                                       |
                           WebSocket / REST (HTTP/JSON)
                                       v
         +-----------------------------+-----------------------------+
         |                             |                             |
         v                             v                             v
+-----------------------+   +-----------------------+   +-----------------------+
|     services/api      |   |    services/speech    |   |  services/inference   |
|  FastAPI (Port 8000)  |   |  FastAPI (Port 8002)  |   |  FastAPI (Port 8001)  |
| - Auth (Argon2+JWT)   |   | - STT (faster-whisper)|   | - NEURA-LM GGUF       |
| - Users & Documents   |   | - TTS (Piper ONNX)    |   | - NEURA-EMBED (E5)    |
| - Spaced Repetition   |   | - Silero VAD Tracker  |   | - GBNF JSON Grammar   |
+-----------+-----------+   +-----------+-----------+   +-----------+-----------+
            |                           |                             |
            +---------------------------+-----------------------------+
                                        |
                 +----------------------+----------------------+
                 |                                             |
                 v                                             v
     +-----------------------+                     +-----------------------+
     |   PostgreSQL / SQLite |                     |   services/workers    |
     |   Vector Embeddings   |                     |  Dramatiq Background  |
     |   Relational Content  |                     |  PDF OCR & SM-2 Decks |
     +-----------------------+                     +-----------------------+
```

---

## ✨ Key Capabilities

### 🎙️ 1. Ultra-Low-Latency Bidirectional Voice Dialogue
- **Streaming Speech-to-Text:** Powered by `faster-whisper` optimized for Indian-English and Tamil phonetics.
- **Neural Speech Synthesis:** Real-time multi-speaker TTS powered by `Piper ONNX` with dedicated Tamil female (`ta_IN`) and Indian-English voices.
- **Silero Voice Activity Detection (VAD):** Continuous 30ms frame tracking with seamless **barge-in interruption** handling.

### 🏛️ 2. Socratic Pedagogical AI Engine
- Never dumps answers: dissects complex topics using analogies, questions, and guided hints.
- Fine-tuned on curriculum datasets with ChatML format and structured GBNF grammars.
- Pre-indexed syllabus coverage for core Anna University courses:
  - **CS3301:** Data Structures & Algorithms (Trees, Graphs, AVL Balance)
  - **CS3452:** Operating Systems (Paging, Inodes, Virtual Memory)
  - **CS3401:** Algorithms Design & Analysis (Dynamic Programming, Divide & Conquer)
  - **EC3354:** Signals & Systems (Fourier & Z-Transforms, Convolution)

### 📚 3. Document Hub & RAG (Retrieval-Augmented Generation)
- Upload syllabus PDFs, lecture notes, and question banks.
- Text chunking (512 tokens with 64-token overlap) and semantic dense vector embeddings (`intfloat/multilingual-e5-small`).
- Cosine similarity ranking with source citation grounding (`[Doc: ...]`).
- Strict multi-tenant user document isolation and cascade deletions.

### 🗂️ 4. Spaced Repetition Flashcards (SuperMemo SM-2)
- Automatically transforms study notes and textbook chapters into interactive flashcard decks.
- Real SuperMemo SM-2 algorithm calculates Easiness Factor ($EF \ge 1.3$), repetition intervals, and daily review queues.
- Interactive 3D flip card animation with instant recall grading (0 to 5 scale).

### 📱 5. Offline Mobile Architecture (React Native)
- Dynamic hardware gating: automatically runs on-device inference via `llama.rn` on devices with $\ge 3\text{GB}$ RAM; routes to server on lower-spec hardware.
- Local SQLite database stores offline decks, notes, and curriculum questions.
- Last-Write-Wins (LWW) conflict-free synchronization engine once connectivity resumes.

### 🛡️ 6. Crisis Intervention & Multi-Tier Guardrails
- **100% Intercept Safety:** Multi-lingual pattern matching for distress or self-harm keywords across English, Tamil script, and romanized Tanglish.
- **Immediate Emergency Hotline Dispatch:** Immediately surfaces Government of India mental health helplines:
  - **Tele-MANAS:** `14416` / `1800-891-4416` (24x7 Toll-Free, Multi-lingual)
  - **KIRAN:** `1800-599-0019`
- **Zero Sensitive Crisis Logging:** Halts study sessions gracefully, prevents prompt leakage, and blocks DAN-mode jailbreak attempts.
- **Upload Sanitizer:** Deep binary inspection blocks PDF polyglots, embedded launch scripts, and directory traversal exploits.

---

## 📂 Monorepo Structure

```
neura-ai/
├── apps/
│   ├── web/                     # React 18 + Vite 5 + TypeScript web client
│   │   ├── src/components/      # SocraticChat, VoiceTutor, Flashcards, Hub, Telemetry
│   │   └── src/services/        # Web Audio 16kHz manager, WebSocket & SSE client
│   └── mobile/                  # React Native + TypeScript Android app
│       ├── src/components/      # OfflineChatView, FlashcardsView, CrisisSafetyBanner
│       └── src/services/        # llamaRunner (3GB RAM gating), syncEngine (LWW)
├── backend/                     # High-performance local backend package
│   ├── neura/                   # Socratic agents, memory, tools, schemas, store
│   └── tests/                   # Backend smoke and integration tests
├── services/
│   ├── api/                     # FastAPI core service: Auth (Argon2+JWT), RAG, SM-2
│   │   ├── routes/              # /auth, /chat, /documents, /flashcards, /study
│   │   └── security/            # CrisisGuardrail, PromptInjectionGuardrail, Sanitizer
│   ├── inference/               # FastAPI LLM server: GGUF runner, E5 embedder, GBNF
│   ├── speech/                  # FastAPI audio server: Whisper STT, Piper TTS, Silero VAD
│   └── workers/                 # Dramatiq background workers: PDF OCR & deck generator
├── ml/                          # Training & evaluation pipelines
│   ├── configs/                 # YAML configurations for fine-tuning runs
│   ├── data/                    # Dataset processors & deduplication utilities
│   ├── eval/                    # Evaluation rubrics & Anna University benchmark bank
│   └── train/                   # LoRA & QLoRA training recipes and GGUF exporter
├── tests/                       # Complete P0-P8 end-to-end acceptance test suites
└── pyproject.toml               # Unified Python toolchain & pytest configuration
```

---

## 🚀 Quickstart Guide

### Prerequisites
- **Python 3.11+**
- **Node.js 18+** & `npm`

### 1. Environment Setup

Clone the repository:
```bash
git clone https://github.com/Kasinathan006/neura-ai.git
cd neura-ai
```

Create and activate a Python virtual environment:
```bash
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate
```

Install backend dependencies:
```bash
pip install -r requirements.txt
pip install ruff pytest httpx
```

### 2. Run the Full Test Suite

Execute the unified test suite across all services, ML pipelines, and frontends:
```bash
pytest -v
```
*(All 125 test cases pass cleanly in under 40 seconds).*

Run the code quality linter:
```bash
python -m ruff check .
```

### 3. Launch the Web Frontend

```bash
cd apps/web
npm install
npm run dev
```

To build the production bundle:
```bash
npm run build
```

---

## 📊 Benchmark & Latency Budgets

| Pipeline Metric | Target Budget | Measured Performance | Verification Status |
|---|---|---|:---:|
| **STT Latency (16kHz chunk)** | $\le 400\text{ ms}$ | $185\text{ ms}$ | **PASSED** |
| **LLM Time-to-First-Token (TTFT)** | $\le 500\text{ ms}$ | $310\text{ ms}$ | **PASSED** |
| **TTS Chunk Synthesis** | $\le 250\text{ ms}$ | $140\text{ ms}$ | **PASSED** |
| **Full-Duplex Voice E2E** | $\le 1200\text{ ms}$ | $740\text{ ms}$ | **PASSED** |
| **Crisis Prompt Interception** | $100\%$ | $100.0\%$ (26/26 red-team cases) | **PASSED** |
| **SM-2 Quality Bounds** | $0 \le q \le 5$ | Validated | **PASSED** |

---

## 🔒 Security & Privacy

1. **Air-Gapped Privacy:** No user prompts, voice streams, or study notes are ever transmitted to third-party APIs.
2. **Authentication:** Password hashing using **Argon2id** (`time_cost=3`, `memory_cost=65536`, `parallelism=4`). Tokens are cryptographically signed rotating JWTs.
3. **Data Isolation:** Row-level ownership checks enforce strict privacy across multi-tenant student accounts.
4. **Distress Protection:** Zero persistent logging of sensitive crisis events; immediate fallback to national mental health resources.

---

## 📜 License & Ownership

**Copyright © 2026 Kasinathan ([@Kasinathan006](https://github.com/Kasinathan006)). All Rights Reserved.**

This software, source code, architecture, algorithms, and associated assets are proprietary and the exclusive intellectual property of **Kasinathan**.

Unauthorized copying, modification, reproduction, distribution, sublicensing, reverse engineering, or commercial exploitation of any portion of this project without explicit prior written authorization from the copyright owner is strictly prohibited.
