# NEURA AI

An agentic, multimodal study companion. One React app and one FastAPI backend
that runs unchanged on your laptop against Ollama, or on Vercel against any
hosted model.

```
┌──────────────────────────────────────────────────────────────┐
│  web/            React 19 + Vite SPA (the Vercel deployment) │
│  api/index.py    Vercel Python Function -> the FastAPI app    │
│  backend/neura/  the app itself (also runs under uvicorn)     │
│  neura_mobile/   Expo React Native client                     │
└──────────────────────────────────────────────────────────────┘
```

---

## The six capabilities

### 1. Autonomous study agents
Say *"I have a big exam on Quantum Physics next week"* and a crew of role agents
takes over: a **Curriculum Architect** splits the subject up, a **Researcher**
searches the open web per subtopic, a **Librarian** finds downloadable lecture
notes, a **Planner** writes the day-by-day schedule, a **Scheduler** emits an
importable `.ics` calendar plus reminder times, a **Quizmaster** writes a
micro-quiz for each day, and a **Coach** writes the kickoff briefing.

Every step is visible in a live trace, and quiz results feed back into the
knowledge graph.

**Why not CrewAI or LangChain.** They assume a long-lived process and pull in
hundreds of megabytes of transitive dependencies — which collides with both the
serverless function bundle limit and the request timeout. `backend/neura/agents.py`
keeps the shape those frameworks give you (named agents, shared scratchpad, tool
calls, inspectable trace) but makes the loop **resumable**: state lives in the KV
store and each `advance()` runs exactly one step, so a 40-step research job
completes across many short requests instead of one that gets killed.

### 2. Vision
Point a camera at a handwritten problem, a diagram or a textbook page. Works with
`llava` through Ollama locally, or any vision-capable model via `LLM_VISION_MODEL`.
The answer streams in and is spoken sentence by sentence. Available on the web
app (`getUserMedia`) and the Expo app (`expo-camera`).

### 3. Personal knowledge graph
Concepts become graph nodes, relationships become edges, and every node carries a
**mastery score** updated by an exponential moving average over quiz results and
self-reports. Before answering, the tutor retrieves semantically similar past
material *and* the learner's weakest linked concepts, and injects them into the
system prompt — which is what makes it connect today's physics question back to
the calculus you struggled with in April.

Backed by the KV store by default; mirrors into **Neo4j** over its HTTP Query API
when `NEO4J_URI` is set. The Memory page renders the graph in 3D and lets you
inspect exactly what personalisation a given question would pull in.

### 4. Spatial 3D and WebXR
Ask *"how does a four-stroke car engine work?"* and the model returns a validated
**scene description** — labelled primitives, positions, links — which is rendered
with `@react-three/fiber` and can be entered in AR or VR through WebXR.

The model never returns code. `backend/neura/scenes.py` clamps every coordinate,
validates every colour, drops dangling references and repairs unknown primitives,
so a bad generation produces an odd diagram rather than a crash or an injection.

### 5. Live voice with barge-in
Continuous recognition detects the end of your utterance, the answer streams over
SSE, and a `SentenceQueue` speaks each sentence *as it completes* — so audio
starts about a second in rather than after the whole reply. Meanwhile a WebAudio
analyser keeps monitoring the microphone: a few consecutive loud frames cancel
speech and abort the in-flight request, so you can interrupt naturally.

Measured prosody (energy, pitch variance, speech rate, and how often you have
re-asked) selects a tutoring tone. These are documented heuristics over audio
features, not a trained affect classifier — the signal that carries real weight
is repetition, because asking the same thing three times is unambiguous evidence
the explanation is not landing.

### 6. Zero-cloud on-device inference
The **Local AI** page downloads a quantised model via WebLLM and runs it on your
GPU through WebGPU. After the first download the weights live in Cache Storage,
so it answers with no network at all. Set offline mode to *Auto* and chat falls
back to the device automatically when the server is unreachable.

---

## Quick start

### Prerequisites
- Node.js 20+
- Python 3.12+
- [Ollama](https://ollama.com) (optional, but it is the free path to real answers)

### 1. Backend

```bash
cd neura-ai
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements.txt
python backend/server.py
```

Serves `http://localhost:8001`, with interactive docs at
`http://localhost:8001/api/docs`.

### 2. Frontend

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to the backend, so no URL
configuration is needed.

### 3. A model (optional but recommended)

```bash
ollama pull llama3.2          # chat, study, agents
ollama pull llava             # the Vision tab
ollama pull nomic-embed-text  # better memory retrieval
```

The backend detects a running Ollama automatically. **With no model configured
the app still works end to end** — every screen renders and every API contract
holds, answers just come from a deterministic offline engine that says so.

### 4. Mobile (optional)

```bash
cd neura_mobile
npm install
npx expo start
```

On a physical device, set `LAN_IP` in `src/api/config.js` to your machine's IP, or
point `EXPO_PUBLIC_API_BASE` at your deployment.

---

## Deploy to Vercel

See **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** for the full walkthrough. The
short version:

1. Push to GitHub and import the repository at [vercel.com/new](https://vercel.com/new).
   Leave the root directory as the repository root — `vercel.json` handles the rest.
2. Add `LLM_API_KEY` (plus `LLM_BASE_URL` and `LLM_MODEL` if you are not using
   OpenAI). **A serverless function cannot reach Ollama on your machine**, so the
   deployed app needs a hosted model.
3. Add the Upstash Redis integration for durable storage. Without it, uploads and
   study plans live in a function's memory and can vanish between requests.

Everything is optional — you can deploy first and add keys after; the app degrades
honestly rather than erroring.

---

## Tests

```bash
python backend/tests/test_smoke.py   # 87 assertions, no model or Redis needed
cd web && npm run lint && npm run build
```

The smoke tests deliberately run with nothing configured — exactly the state a
fresh deployment is in — and assert the app stays *usable*: real status codes,
real JSON shapes, no 500s. They cover the full agent pipeline, RFC 5545 calendar
correctness, PDF parsing against a hand-built PDF, and hostile scene input.

---

## Architecture notes

**One app, three runtimes.** `backend/neura/main.py` mounts every route under
`/api`, so the same ASGI app works whether uvicorn serves it on port 8001 or
Vercel serves it as a function behind the `/api/(.*)` rewrite.

**SSE, not WebSockets.** Vercel Functions do not support WebSocket upgrades. SSE
gives the same token-by-token feel over plain HTTP and survives any proxy. (The
previous version opened `ws://localhost:8001` directly, which also meant an HTTPS
page could never connect.)

**Three LLM providers behind one interface** (`backend/neura/llm.py`): local
Ollama, any OpenAI-compatible endpoint, and a deterministic offline engine.
Selection is automatic — a cloud key wins, else a reachable Ollama, else offline.

**Stateless by construction.** Anything that must outlive a request goes through
`backend/neura/store.py`, which uses Upstash Redis over its REST API when
configured and an in-process dict otherwise.

**Bundle discipline.** three.js, the WebXR emulator (~6MB of IWER room captures)
and the WebLLM runtime (~6MB) are all code-split and excluded from the service
worker precache, so a first visit downloads about 1.6MB rather than 13MB.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, Vite 7, Tailwind CSS 4, Zustand, react-router 7 |
| 3D / XR | three.js, @react-three/fiber, @react-three/drei, @react-three/xr |
| On-device AI | @mlc-ai/web-llm (WebGPU) |
| Backend | FastAPI, Pydantic 2, httpx, pypdf |
| Storage | Upstash Redis (REST) with an in-memory fallback; optional Neo4j |
| Mobile | Expo 54, React Native 0.81, expo-camera |
| Hosting | Vercel (static SPA + one Python Function) |

## Known limitations

- **The RSC-mode CSRF advisory on react-router 7.12+** has no patched release
  yet. It affects React Server Components request handling, which this SPA does
  not use; earlier 7.x versions carry an RCE and several XSS advisories instead,
  so staying on the latest is the safer choice.
- **Speech recognition** relies on the Web Speech API — Chrome, Edge, or
  Safari 14.1+. Everything else in the app works everywhere.
- **On-device inference** needs WebGPU (Chrome/Edge 113+, Safari 18+).
- **`mobile/`** holds an early Flutter prototype that predates this API. The Expo
  app in `neura_mobile/` is the maintained mobile client.
