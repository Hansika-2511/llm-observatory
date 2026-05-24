<p align="center">
  <h1 align="center">🔭 LLM Observatory</h1>
  <p align="center">A full-stack inference logging and analytics platform for LLM applications</p>
  <p align="center">
    <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white" />
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" />
    <img src="https://img.shields.io/badge/SQLite-WAL-003B57?style=flat-square&logo=sqlite&logoColor=white" />
    <img src="https://img.shields.io/badge/Redis-pub%2Fsub-DC382D?style=flat-square&logo=redis&logoColor=white" />
    <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" />
  </p>
</p>

---

## What is this?

LLM Observatory is a production-grade system for capturing, storing, and visualising every LLM inference call your application makes. Drop in the SDK wrapper around your existing OpenAI calls — it transparently captures latency, token usage, errors, and streaming TTFT without adding overhead to your users.

**Built for the Ollive.ai take-home assignment.**

---

## Features

| Category | What's included |
|---|---|
| 💬 **Chatbot** | Multi-turn, streaming SSE, conversation list / cancel / resume |
| 📦 **SDK Wrapper** | Captures latency, TTFT, token usage, status, previews — fire-and-forget |
| 🔀 **Multi-provider** | OpenAI (live), Anthropic & Gemini (stubbed, one env var to enable) |
| ⚡ **Streaming** | SSE-based with time-to-first-token tracking |
| 🔁 **Ingestion Pipeline** | Zod validation → SQLite WAL → Redis pub/sub |
| 📊 **Dashboard** | Latency, throughput, error rate, per-provider breakdown — live charts |
| 🛡️ **PII Redaction** | Emails, phones, SSNs, credit cards, IPs, API keys stripped before storage |
| 🐳 **Docker Compose** | One command to run everything |
| 📡 **Event-based** | Redis pub/sub fans out to SSE for real-time log streaming to the UI |

---

## Quick Start

### Option 1 — Docker (recommended)

```bash
git clone https://github.com/your-username/llm-observatory
cd llm-observatory

# Copy and fill in your API key
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-...

docker compose up --build
```

| Service | URL |
|---|---|
| Chat UI | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| Health check | http://localhost:4000/health |

### Option 2 — Local Dev (no Docker)

You need Node 20+ and optionally Redis running locally.

```bash
# Terminal 1 — Backend
cd backend
npm install
cp ../.env.example .env   # fill in OPENAI_API_KEY
node src/index.js

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

> **Redis is optional.** If it's not running, logs still persist to SQLite and the API works fully. Only real-time SSE events to the dashboard are skipped.

---

## Environment Variables

Create a `.env` file in the project root (or set these in your shell):

```env
# Required
OPENAI_API_KEY=sk-your-openai-key-here

# Optional — enable additional providers
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

# Optional — override defaults
PORT=4000
DB_PATH=./observatory.db
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-in-production
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | ✅ Yes | — | Your OpenAI secret key |
| `ANTHROPIC_API_KEY` | ❌ No | — | Enables the Anthropic provider |
| `GEMINI_API_KEY` | ❌ No | — | Enables the Gemini provider |
| `PORT` | ❌ No | `4000` | Backend HTTP port |
| `DB_PATH` | ❌ No | `./observatory.db` | SQLite file location |
| `REDIS_URL` | ❌ No | `redis://localhost:6379` | Redis connection string |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          React Frontend (Vite)                        │
│                                                                      │
│   ┌─────────────┐   ┌──────────────────┐   ┌────────────────────┐   │
│   │  ChatPage   │   │  DashboardPage   │   │    LogsPage        │   │
│   │  (SSE stream│   │  (Recharts, live │   │  (paginated table, │   │
│   │   + REST)   │   │   KPI cards)     │   │   SSE live feed)   │   │
│   └──────┬──────┘   └────────┬─────────┘   └─────────┬──────────┘   │
│          │                   │                        │              │
└──────────┼───────────────────┼────────────────────────┼──────────────┘
           │  REST / SSE       │  REST                  │  SSE
           ▼                   ▼                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Express Backend (Node 20)                      │
│                                                                      │
│  POST /api/chat/:id     GET /api/analytics/*    GET /api/events      │
│  GET  /api/conversations/*                      POST /api/ingest     │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                      LLM SDK Wrapper                         │    │
│  │                                                              │    │
│  │  llmComplete(messages, model, provider)                      │    │
│  │    ├── starts timer                                          │    │
│  │    ├── calls provider (OpenAI / Anthropic / Gemini)          │    │
│  │    ├── records latency, tokens, status, error                │    │
│  │    └── fire-and-forget → ingest(logEntry)                    │    │
│  │                                                              │    │
│  │  llmStream(messages, model, provider)                        │    │
│  │    ├── tracks time-to-first-token (TTFT)                     │    │
│  │    ├── yields deltas to SSE response                         │    │
│  │    └── fire-and-forget → ingest(logEntry)                    │    │
│  └──────────────────────────┬───────────────────────────────────┘    │
│                             │                                        │
│                    ingest(logEntry)                                  │
│                             │                                        │
│                    ┌────────▼─────────┐                              │
│                    │ Ingestion Service │                              │
│                    │                  │                              │
│                    │  1. Zod validate  │                              │
│                    │  2. PII redact   │                              │
│                    │  3. SQLite write  │                              │
│                    │  4. Redis publish │                              │
│                    └────────┬─────────┘                              │
│                             │                                        │
└─────────────────────────────┼────────────────────────────────────────┘
                              │
                 ┌────────────┴────────────┐
                 │                         │
          ┌──────▼──────┐          ┌───────▼──────┐
          │   SQLite     │          │    Redis      │
          │  (WAL mode)  │          │  pub/sub      │
          │              │          │               │
          │ conversations│          │ channel:      │
          │ messages     │          │ inference:logs│
          │ inference_logs│         └───────┬───────┘
          └─────────────┘                  │
                                   ┌───────▼───────┐
                                   │  SSE Clients  │
                                   │ (dashboard,   │
                                   │  logs page)   │
                                   └───────────────┘
```

### Ingestion Flow (step by step)

```
User sends message
       │
       ▼
  Chat route saves user message to SQLite
       │
       ▼
  Builds context (last 20 messages) + system prompt
       │
       ▼
  llmStream() / llmComplete() called
       │
       ├── startTimer = Date.now()
       ├── calls OpenAI API (streaming or batch)
       │         │
       │    [streaming] yields deltas → SSE → browser renders incrementally
       │    [batch]     waits for full response
       │
       ├── records: latency, TTFT, prompt_tokens, completion_tokens, finish_reason
       │
       ▼
  Response returned to chat route (user sees reply)
       │
       ▼   ← fire-and-forget (doesn't block user)
  ingest(logEntry)
       │
       ├── Zod validates schema (invalid payloads silently dropped)
       ├── PII redacted from input_preview + output_preview
       ├── INSERT into inference_logs (SQLite WAL — non-blocking)
       └── PUBLISH to Redis "inference:logs"
                 │
                 └── SSE /api/events → dashboard updates in real time
```

---

## Database Schema

### `conversations`
```sql
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT 'New Conversation',
  provider    TEXT NOT NULL DEFAULT 'openai',
  model       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active'   -- 'active' | 'cancelled' | 'archived'
              CHECK(status IN ('active','cancelled','archived')),
  created_at  INTEGER NOT NULL,                -- Unix ms
  updated_at  INTEGER NOT NULL,
  metadata    TEXT                             -- JSON blob for future k/v
);
```

### `messages`
```sql
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content         TEXT NOT NULL,               -- full message text
  content_preview TEXT NOT NULL,               -- first 200 chars, pre-computed
  created_at      INTEGER NOT NULL,
  token_count     INTEGER,
  is_redacted     INTEGER NOT NULL DEFAULT 0   -- 1 if PII was found + stripped
);
```

### `inference_logs`
```sql
CREATE TABLE inference_logs (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id        TEXT REFERENCES messages(id),
  provider          TEXT NOT NULL,             -- 'openai' | 'anthropic' | 'gemini'
  model             TEXT NOT NULL,             -- e.g. 'gpt-4.1-mini'
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  total_tokens      INTEGER,
  latency_ms        INTEGER NOT NULL,          -- wall-clock time for full response
  status            TEXT NOT NULL              -- 'success' | 'error' | 'cancelled'
                    CHECK(status IN ('success','error','cancelled')),
  error_code        TEXT,                      -- HTTP status or SDK error code
  error_message     TEXT,
  finish_reason     TEXT,                      -- 'stop' | 'length' | 'content_filter'
  is_streaming      INTEGER NOT NULL DEFAULT 0,
  first_token_ms    INTEGER,                   -- time-to-first-token for streaming calls
  request_at        INTEGER NOT NULL,          -- epoch ms when request was sent
  response_at       INTEGER NOT NULL,          -- epoch ms when response completed
  input_preview     TEXT,                      -- first 200 chars of last user message (PII-redacted)
  output_preview    TEXT                       -- first 200 chars of assistant reply (PII-redacted)
);
```

### Indexes
```sql
CREATE INDEX idx_messages_conv   ON messages(conversation_id, created_at);
CREATE INDEX idx_logs_conv       ON inference_logs(conversation_id);
CREATE INDEX idx_logs_provider   ON inference_logs(provider, request_at);
CREATE INDEX idx_logs_status     ON inference_logs(status, request_at);
CREATE INDEX idx_convs_updated   ON conversations(updated_at DESC);
CREATE INDEX idx_logs_request_at ON inference_logs(request_at DESC);
```

### Schema Design Decisions

| Decision | Rationale |
|---|---|
| **SQLite + WAL mode** | Zero-ops for evaluation. WAL allows concurrent readers without blocking writers — crucial when SSE analytics queries run alongside chat writes. Swap to Postgres by changing only the DB layer; schema is identical. |
| **`inference_logs` separate from `messages`** | Logs are append-only telemetry; messages are mutable chat state. Different access patterns, different retention policies. Analytics queries never need to touch full message content. |
| **Previews in logs, full content in messages** | Keeps `inference_logs` lean for aggregation. `GROUP BY` and `AVG()` over millions of rows doesn't need the full text. Prevents double-storing large content. |
| **`request_at` + `response_at` (not just `latency_ms`)** | Allows timeline reconstruction and cross-request analysis even if clocks drift. `latency_ms` is a derived convenience column. |
| **`status` as enum column** | Enables fast indexed filtering — `WHERE status = 'error'` is a common dashboard query. Also self-documents intent vs. a boolean `is_error`. |
| **`is_streaming` + `first_token_ms`** | Streaming and batch have fundamentally different latency profiles. TTFT matters independently from total latency. Separating them avoids averaging apples with oranges. |
| **Redis pub/sub (not Streams)** | Dashboard events are ephemeral — a browser reconnecting doesn't need to replay history; it just re-fetches from SQLite. Pub/sub is simpler and sufficient. SQLite is the durable store. |

---

## API Reference

### Conversations

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/conversations` | List all conversations (newest first) |
| `POST` | `/api/conversations` | Create a new conversation |
| `GET` | `/api/conversations/:id` | Get conversation + all messages |
| `PATCH` | `/api/conversations/:id` | Update title or status |
| `DELETE` | `/api/conversations/:id` | Cancel a conversation (soft delete) |
| `GET` | `/api/conversations/:id/messages` | Get messages only |

### Chat

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/chat/:conversationId` | Send a message. Body: `{ content, stream: bool }`. SSE stream if `stream: true`. |

### Analytics

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/analytics/overview` | KPI summary (total requests, avg latency, error rate, token counts) |
| `GET` | `/api/analytics/latency` | Latency over time, bucketed by minute/hour/day |
| `GET` | `/api/analytics/throughput` | Request counts over time, bucketed |
| `GET` | `/api/analytics/errors` | Error breakdown by code, provider, model |
| `GET` | `/api/analytics/providers` | Per-provider stats table |
| `GET` | `/api/analytics/logs` | Paginated raw log feed (filterable by provider/status) |

All analytics endpoints accept `?from=<epochMs>&to=<epochMs>` query params.

### Other

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/providers` | List configured providers and their available models |
| `GET` | `/api/events` | SSE stream — pushes a JSON event for every new inference log |
| `POST` | `/api/ingest` | External ingestion endpoint — push log entries from any SDK |
| `GET` | `/health` | Health check — returns `{ status: "ok", logs: <count> }` |

---

## Logging Strategy

**What is captured:** Every LLM API call — successful, failed, or cancelled — produces exactly one row in `inference_logs`.

**When it's captured:** After the response is returned to the caller. This means latency measurement is accurate and ingestion never adds to user-facing response time.

**Streaming specifics:** For streaming calls, `first_token_ms` (TTFT) is recorded the moment the first non-empty delta arrives. `latency_ms` records the time until the stream closes. Both are stored so you can analyse them independently.

**PII handling:** Before writing `input_preview` and `output_preview`, the text passes through the redaction utility which strips:
- Email addresses
- US phone numbers
- Social Security Numbers (XXX-XX-XXXX)
- Credit card numbers (13–16 digit patterns)
- IPv4 addresses
- API keys and bearer tokens (common prefixes like `sk-`, `pk-`, `Bearer`)

Full message content in the `messages` table is stored as-is (assuming your users have consented). If you need full redaction, set `is_redacted = 1` and pass content through `redact()` before saving.

**Fire-and-forget:** `ingest()` is called without `await` after the LLM call completes. If ingestion fails (Redis down, SQLite contention), the error is logged to console but the user's chat response is unaffected.

---

## Failure Handling

| Failure | Behaviour |
|---|---|
| **Redis unavailable** | `ingest()` catches the publish error, logs a warning, and continues. SQLite write succeeds. SSE clients won't receive live pushes but can still query `/api/analytics/*`. |
| **SQLite write fails** | Logged to console. Caller is unaffected (fire-and-forget). |
| **OpenAI API error** | SDK records `status = 'error'`, captures `error_code` and `error_message`, re-throws. Chat route returns `502`. |
| **Stream aborted by user** | `AbortController` signals the fetch. SDK catches `AbortError`, records `status = 'cancelled'`, stops yielding. |
| **Invalid log payload** | Zod `safeParse` fails silently — warning logged, no partial write. |
| **Provider not configured** | `getProvider()` throws immediately. Chat route returns `502` with a clear message. |
| **Conversation cancelled** | Chat route checks status before accepting new messages. Returns `400` with explanation. |

---

## Scaling Considerations

| Layer | Current | Next step | At scale |
|---|---|---|---|
| **Database** | SQLite WAL | Postgres (same schema) | TimescaleDB hypertables for `inference_logs`; automatic partitioning + `time_bucket()` |
| **Ingestion** | Fire-and-forget inline call | BullMQ queue (Redis) with retry/backoff | Kafka topic; multiple consumer groups (analytics, alerting, billing) |
| **Real-time events** | Redis pub/sub → SSE | Redis Streams (durability, replay) | Kafka + WebSocket gateway |
| **Backend** | Single Express process | PM2 cluster (N cores) | Horizontally scaled containers behind a load balancer; stateless design already supports this |
| **Frontend** | Vite dev server / Nginx | CDN-hosted static assets | Edge CDN + API on load-balanced backend; no changes needed to app code |
| **Analytics queries** | SQLite `GROUP BY` | Postgres + indexes | Materialised views or a dedicated OLAP store (ClickHouse / DuckDB) for aggregation at scale |

---

## Project Structure

```
llm-observatory/
│
├── docker-compose.yml          # One-command boot: backend + frontend + Redis
├── .env.example                # Copy to .env and fill in your keys
├── .gitignore
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js                    # Express app bootstrap, routes wiring, health check
│       │
│       ├── db/
│       │   └── index.js                # SQLite init, WAL pragma, schema migrations
│       │
│       ├── services/
│       │   ├── sdk.js                  # ⭐ LLM SDK wrapper — llmComplete() + llmStream()
│       │   ├── ingestion.js            # ⭐ Ingestion pipeline — validate → SQLite → Redis
│       │   ├── providers.js            # Provider registry (OpenAI live, Anthropic/Gemini stubbed)
│       │   └── redis.js                # Redis client singleton (pub + sub connections)
│       │
│       ├── routes/
│       │   ├── conversations.js        # CRUD: list, create, get, update, cancel, resume
│       │   ├── chat.js                 # POST /chat/:id — streaming + non-streaming
│       │   ├── analytics.js            # Dashboard endpoints: overview, latency, throughput, errors
│       │   ├── events.js               # GET /events — SSE real-time feed from Redis
│       │   └── ingest.js               # POST /ingest — external SDK push endpoint
│       │
│       └── utils/
│           └── redact.js               # PII scrubbing (regex patterns for common PII types)
│
└── frontend/
    ├── Dockerfile
    ├── nginx.conf                      # Nginx SPA config + /api proxy to backend
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx                    # React root + router setup
        ├── App.jsx                     # Layout: icon sidebar + <Outlet />
        ├── index.css                   # Design system (CSS variables, fonts, animations)
        │
        ├── lib/
        │   └── api.js                  # Typed API client — REST + streaming fetch helper
        │
        └── pages/
            ├── ChatPage.jsx            # Conversation list, chat bubbles, streaming, cancel/resume
            ├── DashboardPage.jsx       # Live KPI cards + Recharts (latency, throughput, errors, providers)
            └── LogsPage.jsx            # Paginated inference log table + SSE live feed + expand row
```

---

## What I'd Improve with More Time

**Reliability**
- Wrap `ingest()` in a BullMQ job queue so DB write failures are retried with exponential backoff
- Add a dead-letter queue for payloads that consistently fail validation

**Observability**
- Replace SQLite with Postgres + TimescaleDB — `time_bucket()` aggregations at any granularity with zero code changes
- Add a `cost_usd` column: map `(provider, model)` → cost-per-token and compute spend per conversation

**Dashboard**
- p50/p95/p99 latency percentiles (currently only avg/min/max)
- Latency waterfall view per conversation (visualise multi-turn timing)
- Alert rules: fire a Slack/PagerDuty webhook when error rate > X% or p99 latency > threshold
- CSV/JSON export of filtered log ranges

**Auth & multi-tenancy**
- JWT middleware on all routes; per-user conversation isolation
- API key management so external services can push logs to `/api/ingest`

**Providers**
- Full Anthropic streaming (Claude SDK)
- Full Gemini streaming (Google Generative AI SDK)
- DeepSeek + Grok stubs → live (they're OpenAI-compatible, trivial to add)

**Infrastructure**
- Helm chart for k8s deployment
- Proper secrets management (Vault / k8s Secrets)
- Horizontal pod autoscaling based on request queue depth

---

## License

MIT