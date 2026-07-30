# Deploying NEURA AI to Vercel

One Vercel project serves both halves of the app: the Vite build as static files,
and `api/index.py` as a single Python Function running the FastAPI app.

---

## 1. What Vercel does with this repository

`vercel.json` already describes the whole deployment, so there is nothing to
configure in the dashboard:

```jsonc
{
  "framework": "vite",
  "buildCommand": "npm --prefix web ci && npm --prefix web run build",
  "outputDirectory": "web/dist",       // the SPA
  "functions": { "api/index.py": { "maxDuration": 60, "memory": 1024 } },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "api/index.py" },  // API
    { "source": "/((?!api/).*)", "destination": "/index.html" } // SPA routing
  ]
}
```

The rewrite preserves the original request path, and every FastAPI route is
declared under `/api`, so `/api/chat` arrives as `/api/chat` with no prefix
juggling. Root `requirements.txt` and `.python-version` pin the function's
dependencies and Python 3.12.

---

## 2. Deploy

### Push to GitHub

```bash
git add .
git commit -m "NEURA AI v2: agents, vision, knowledge graph, XR, voice, edge AI"
git push
```

### Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
2. **Leave the Root Directory as the repository root.** Do not set it to `web/` —
   Vercel needs to see both `vercel.json` and `api/`.
3. Click Deploy.

It will deploy successfully with no environment variables at all. Every screen
renders; answers come from the offline engine and say so. Add the variables below
to make it a real product.

---

## 3. Environment variables

Project → Settings → Environment Variables. Full reference in
[`.env.example`](.env.example).

### Required for real answers

A serverless function cannot reach Ollama on your machine, so the deployed app
needs a hosted, OpenAI-compatible endpoint.

| Variable | Example | Notes |
| --- | --- | --- |
| `LLM_API_KEY` | `gsk_…` | Any OpenAI-compatible provider |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` | Omit for OpenAI |
| `LLM_MODEL` | `llama-3.3-70b-versatile` | |
| `LLM_VISION_MODEL` | `gpt-4o-mini` | Needed for the Vision tab |

Provider examples:

```bash
# OpenAI
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini

# Groq — fast, has a free tier
LLM_API_KEY=gsk_...
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile

# OpenRouter — one key, many models
LLM_API_KEY=sk-or-...
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=anthropic/claude-3.5-sonnet
```

### Strongly recommended: durable storage

Without this, uploaded PDFs, study plans and knowledge graphs live in a single
function instance's memory — and on serverless that can disappear between the
upload and the question about it.

1. Vercel dashboard → **Storage** → add the **Upstash Redis** integration.
2. It injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.

Redis over its REST API is used deliberately: no sockets and no connection
pooling, so it works where every request may be a fresh process.

### Optional: Neo4j knowledge graph

The graph works without this. Setting it additionally mirrors concepts into Neo4j
over its HTTP Query API, so you can run Cypher against them.

```bash
NEO4J_URI=https://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=...
```

Redeploy after adding variables — they are read at function start.

---

## 4. Verify the deployment

```bash
curl https://your-app.vercel.app/api/health
```

```json
{
  "ok": true,
  "active_provider": "openai",
  "active_model": "gpt-4o-mini",
  "vision_available": true,
  "persistence": "redis",
  "graph_backend": "neo4j",
  "serverless": true
}
```

The app surfaces the same information in **Settings → System status**, so you can
see at a glance which capabilities are live. If `active_provider` is `offline`,
the key is missing or misspelt.

---

## 5. Plan limits worth knowing

| | Hobby | Pro |
| --- | --- | --- |
| Function timeout | 10s (config asks for 60) | 60s |
| Bundle size | 500MB | 500MB (5GB on Fluid compute beta) |

The 10-second Hobby timeout is why the agent crew runs **one step per request**
and the client drives the loop — no single request needs to be long. Streaming
also means time-to-first-token matters more than total duration.

If quiz generation times out on Hobby, use a faster model (Groq is a good fit).

---

## 6. Local production check

```bash
cd web && npm run build && npm run preview   # http://localhost:4173
python backend/server.py                     # in another terminal
```

`preview` proxies `/api` the same way the dev server does, so this exercises the
real production bundle.

---

## 7. Self-hosting instead

The backend is a plain ASGI app, so anywhere that runs Python works — and unlike
Vercel, a container **can** reach Ollama.

```bash
docker compose up --build   # web on :5173, API on :8001
```

For Render, Fly.io or a VPS:

```bash
pip install -r backend/requirements.txt
uvicorn neura.main:app --host 0.0.0.0 --port 8001 --app-dir backend
```

Then build the frontend with `VITE_API_BASE=https://your-api-host/api`.

---

## 8. Android build (Capacitor)

```bash
cd web
npm run cap:sync   # build + copy into the Android project
npm run cap:apk    # assembleDebug
```

The APK lands in `web/android/app/build/outputs/apk/debug/`. Set
`VITE_API_BASE` to a reachable URL before building — a packaged app has no dev
server to proxy through.

---

## Troubleshooting

**`/api/*` returns the HTML page.** The Root Directory is set to `web/`. Change it
back to the repository root so `vercel.json` and `api/` are visible.

**`FUNCTION_INVOCATION_FAILED`.** Check the function logs. Usually a missing
dependency — confirm the root `requirements.txt` was picked up.

**Answers are placeholders.** `active_provider` is `offline`: no `LLM_API_KEY`, or
it was added without redeploying.

**PDF uploads "forget" the document.** No Redis configured, so the upload landed
on a different function instance than the question. Add the Upstash integration.

**Vision returns 503.** No vision-capable model. Set `LLM_VISION_MODEL` to one
that accepts images.

**Camera or microphone does nothing.** Both require HTTPS. Vercel provides it;
locally use `localhost`, which browsers treat as a secure context.
