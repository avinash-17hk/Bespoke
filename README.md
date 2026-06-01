# Bespoke

**AI-powered personalized outreach dashboard.** Define your offering once,
shape how messages should sound, drop in whatever you have on a prospect:
URLs and screenshots, and get back outreach that reads like a human wrote it
specifically for that person. When the prospect replies, paste it in and get a
contextual follow-up that continues the conversation naturally.

> **Live demo:** https://bespoke.avnsh.xyz/
> **Walkthrough video:** https://drive.google.com/file/d/1xcyxgfr21itoNaGHxcCkcmYDqUuplw-h/view?usp=sharing

![Node.js](https://img.shields.io/badge/Node.js-24_LTS-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16.2-000000?logo=next.js&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-5.8-000000?logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-BullMQ-DC382D?logo=redis&logoColor=white)
![Turborepo](https://img.shields.io/badge/Turborepo-2.9-EF4444?logo=turborepo&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.3-06B6D4?logo=tailwindcss&logoColor=white)

---

## Table of Contents

- [Key features](#key-features)
- [How it works](#how-it-works)
- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Error handling](#error-handling)
- [Project structure](#project-structure)
- [Running locally](#running-locally)
- [Environment variables](#environment-variables)
- [How generation works](#how-generation-works)
- [Example outputs](#example-outputs)
- [Architecture decisions](#architecture-decisions)
- [Tradeoffs](#tradeoffs)
- [What I'd do with more time](#what-id-do-with-more-time)

---

## Key features

| Feature | What it gives you |
|---|---|
| **Offering management** | Scrape a URL, type manually, or combine both. Raw scraped content stays separate from your edits. Multiple offerings per account. |
| **Prompt customization** | Save reusable system prompts: tone, length, angle, constraints. A guided Prompt Builder with templates drafts one for you. |
| **Flexible prospect inputs** | LinkedIn screenshot, GitHub URL, personal site, company site, any URL, or free-text notes: all scraped in the background and merged into one context. |
| **Personalized generation** | Offering + prompt + consolidated prospect context produces a message that reads like a human wrote it for that specific person. |
| **Reply handling** | Paste a reply, get a contextual follow-up using the full thread, original offering, and prospect context: never a fresh start. |
| **Analytics** | Generation volume, offering usage breakdown, top-rated messages, conversations with replies: all live counts from the database. |
| **Per-user model selection** | Gemini models free on the platform key; Anthropic/OpenAI models run on the user's own encrypted OpenRouter key (AES-256-GCM at rest). |
| **Background job pipeline** | All scraping and AI work queued via BullMQ: the API never blocks; job status is visible per asset while work runs. |
| **Transparent error surfacing** | Worker failure reasons (rate limit, model unavailable, scrape error) are stored in Postgres and returned in polling responses; the UI shows them inline and as toasts — no log access needed to diagnose a failure. |

---

## How it works

```
   You                          Bespoke                        Background
   ─────                        ───────                        ──────────

1. Create offering    ──────▶  Scrape URL / save manual   ──▶  scrape-offering-source job
                               Compile structured context       writes compiled_context

2. Write prompt       ──────▶  Save system prompt
                               (tone, length, constraints)

3. Add prospect       ──────▶  Create prospect assets      ──▶  scrape-prospect-asset ×N
   (URLs + screenshot)         (LinkedIn, GitHub, sites)        vision-read screenshot
                                                           ──▶  consolidate-insights
                                                                 → prospect_context ready

4. Generate message   ──────▶  Enqueue generate-message   ──▶  worker loads all three IDs
                               Return job ID for polling        builds layered system prompt
                                                                calls OpenRouter
                                                                writes ai_generation + message

5. Prospect replies   ──────▶  Paste reply into thread    ──▶  generate-reply job
                               Full thread stays visible        uses thread + original context
```

---

## What it does

1. **Authentication**: email/password sign-up and sign-in. Every user's
   offerings, prompts, prospects, and message history are fully isolated.
2. **Offering setup**: build an offering by scraping a URL, typing it
   manually, or both (scrape, then edit on top). Raw scraped content is kept
   separate from your edits so neither is lost. A scrape also produces a short
   summary surfaced as a card hover preview. Multiple offerings per user.
3. **Prompt customization**: write and save reusable system prompts that
   drive generation: tone, length, angle, what to emphasize, what to avoid,
   how to open and close. One can be marked default. A guided **Prompt Builder**
   (curated templates + a structured form) drafts a prompt for you, editable
   before save.
4. **Prospect management**: save a prospect once, reuse across offerings. Add
   any combination of a LinkedIn screenshot, GitHub URL, personal site,
   company site, any other URL, or free-text notes. Each input is scraped or
   vision-read in the background; per-input insights are merged into a single
   consolidated context.
5. **Message generation**: combine offering + prompt + prospect context into a
   personalized message. The generation model is a per-user setting (Settings
   modal, strict OpenRouter allow-list). Gemini models are free (platform key);
   starred Anthropic/OpenAI models require the user's own OpenRouter key, stored
   encrypted (AES-256-GCM) and verified live before saving. Once a key is saved,
   all of that user's generations run on it. Every generation is saved; rate (1–5),
   favourite, copy in one click, delete, or regenerate: no re-entry. Generate
   from the prospect detail page or the Home tab composer.
6. **Reply handling**: paste a prospect's reply into the conversation thread
   and get a contextual follow-up using the full thread, original prospect
   context, and original offering. The whole thread stays visible.
7. **Analytics**: total messages generated, offering usage breakdown,
   prospects saved, conversations with replies, top-rated messages, and
   generation volume over time.

---

## Tech stack

Versions pinned to latest stable as of May 2026.

| Layer        | Technology                                              | Version             |
| ------------ | ------------------------------------------------------- | ------------------- |
| Runtime      | Node.js                                                 | `24` (LTS)          |
| Language     | TypeScript (strict)                                     | `6.0.x`             |
| Pkg manager  | pnpm workspaces                                         | `11.x`              |
| Monorepo     | Turborepo                                               | `2.9.x`             |
| Frontend     | Next.js (App Router) / React                            | `16.2.x` / `19.2.x` |
| Styling      | Tailwind CSS                                            | `4.3.x`             |
| Components   | shadcn/ui (CLI v4, unified `radix-ui`)                  | CLI `4.x`           |
| Icons        | lucide-react                                            | `1.17.x`            |
| Client data  | TanStack Query                                          | `5.100.x`           |
| Validation   | Zod                                                     | `4.4.x`             |
| Backend      | Fastify                                                 | `5.8.x`             |
| Database     | PostgreSQL                                              | `18.x`              |
| ORM          | Drizzle ORM + drizzle-kit                               | `0.45.x`            |
| Queue        | BullMQ + ioredis                                        | `5.77.x` / `5.x`    |
| Cache/broker | Upstash Redis (TCP/ioredis)                             | server `8.x`        |
| Auth         | Better Auth                                             | `1.6.x`             |
| AI           | OpenRouter via Vercel AI SDK (`ai` + provider)          | `6.x` / `2.9.x`     |
| Scraping     | Firecrawl (`@mendable/firecrawl-js`)                    | `4.22.x`            |
| File storage | Cloudinary (`cloudinary`): backend-signed upload       | `2.x`               |

---

## Architecture

Three deployable apps and three shared packages in a pnpm + Turborepo monorepo.

```
┌──────────┐      HTTP       ┌──────────┐    enqueue    ┌──────────┐
│   web    │ ──────────────▶ │   api    │ ────────────▶ │  Upstash │
│ Next.js  │ ◀────────────── │ Fastify  │               │  Redis   │
└──────────┘   JSON {data}   └────┬─────┘               └────┬─────┘
                                  │                          │ consume
                            Drizzle queries                  ▼
                                  │                     ┌──────────┐
                                  ▼                     │  worker  │
                            ┌──────────┐                │ BullMQ   │
                            │ Postgres │ ◀───── writes ─┤ Firecrawl│
                            └──────────┘                │ + AI SDK │
                                                        └──────────┘
```

- **`web`**: Next.js UI only. No direct DB access. Calls the Fastify API for
  all data. Server components fetch server-side; client mutations use TanStack
  Query.
- **`api`**: all business logic, validation, auth enforcement, Drizzle
  queries, and job enqueueing. Never runs long-lived scraping or AI work
  inline: always delegates to the queue and returns a job ID for polling.
- **`worker`**: job execution only. Reads BullMQ queues, runs scraping and AI
  extraction/generation, writes results back to Postgres. No HTTP surface;
  stateless, safe to scale horizontally.

### Core invariants

- Request handlers never run long-lived work inline: scraping and AI are
  always queued.
- Auth is enforced before any data access; every user-owned query includes a
  `user_id` filter. The API never trusts a `user_id` from the request body.
- `packages/db` schema is the single source of truth: no inline SQL.
- Job payload types are defined once in `packages/queue` and shared by producer
  (api) and consumer (worker).
- `prospect_context` is always derived by the `consolidate-insights` job, never
  hand-edited. `offerings.compiled_context` is rebuilt on every save.

### Queues

```
scrape-queue
├── scrape-prospect-asset    # scrape a URL or vision-read a screenshot
├── scrape-offering-source   # scrape an offering source URL
└── consolidate-insights     # merge all prospect insights → prospect_context

generate-queue
├── generate-message         # initial outreach generation
└── generate-reply           # conversation reply generation
```

**Prospect scrape flow:** API creates a `prospect_asset` (status `pending`) and
enqueues `scrape-prospect-asset` → worker scrapes/vision-reads, writes a
`prospect_insights` row, marks the asset `done` → when all assets for the
prospect are done, enqueues `consolidate-insights` → that merges every insight
into `prospect_context`, ready for generation.

### Screenshot uploads (Cloudinary signed, browser-direct)

LinkedIn screenshots never pass through the API. The browser uploads them
directly to Cloudinary using a short-lived signature the API issues:

```
┌──────────┐  1. POST /api/uploads/sign   ┌──────────┐
│   web    │ ───────────────────────────▶ │   api    │  signs {timestamp, folder}
│ (browser)│ ◀─────────────────────────── │ Fastify  │  with CLOUDINARY_API_SECRET
└────┬─────┘   {signature, apiKey, …}      └──────────┘  (secret never leaves server)
     │ 2. POST file + signature (multipart, no auth cookie)
     ▼
┌────────────┐  3. {public_id, secure_url}
│ Cloudinary │ ──────────────────────────▶ web then 4. POST /api/prospects/:id/assets
└────────────┘                                { assetType: linkedin_screenshot, fileKey: public_id }
```

1. **Sign**: `POST /api/uploads/sign` (auth required) returns
   `{ timestamp, signature, apiKey, cloudName, folder }`. The API signs the
   exact `timestamp` + `folder` Cloudinary will receive; the API secret stays
   server-side and the bytes never touch the API.
2. **Upload**: the browser POSTs the file plus the signed params straight to
   Cloudinary (`credentials: "omit"`: different origin, no session cookie).
3. **Attach**: Cloudinary returns the `public_id`, which the web app passes as
   `file_key` to `POST /api/prospects/:id/assets`, enqueuing the usual
   `scrape-prospect-asset` job.
4. **Vision read**: the worker rebuilds the delivery URL from
   `CLOUDINARY_CLOUD_NAME` + `public_id` and runs vision extraction (AI SDK
   image message) to produce the `prospect_insights` row.

---

## Error handling

Failures are surfaced at every layer so the user never needs to inspect server
logs to understand what went wrong.

### API response shape

All errors follow a consistent envelope:

```json
{ "error": "...", "code": "...", "issues": [...], "details": "..." }
```

- **`error`**: human-readable message, always the real one (never "Internal
  server error").
- **`code`**: machine-readable string (`VALIDATION_ERROR`, `NOT_FOUND`,
  `AI_GENERATION_FAILED`, `OPENROUTER_KEY_REQUIRED`, …).
- **`issues`** (validation only): field-level Zod errors —
  `[{ "path": "body.offeringId", "message": "Required" }]`.
- **`details`**: optional extra context for unexpected errors.

Structured via `AppError` (`apps/api/src/lib/errors.ts`); Fastify's
`setErrorHandler` catches both typed `AppError` throws and raw unhandled
exceptions, so every response carries a readable message.

### Worker failure propagation

The worker writes the exact exception message to `generation_jobs.error` and
`scrape_jobs.error` on failure (e.g. `"429 Too Many Requests from OpenRouter"`).
Polling endpoints surface these:

- `GET /api/generations/:id` → `failureReason: string | null`
- `GET /api/prospects/:id` → `assets[].failureReason: string | null`

### UI feedback

| Trigger | Where shown |
|---|---|
| Generation worker fails (rate limit, bad key, model unavailable) | `toast.error(failureReason)` + "Try switching your API key in Settings." via `useWatchGeneration` |
| Asset scrape worker fails | `toast.error(failureReason, { description: url })` via `useWatchProspectScrape` |
| Failed asset on prospect detail page | Inline error text under the asset name in red |
| Any mutation error (create, update, delete) | `toast.error(error.message)` at the callsite |
| Zod validation rejected by API | `toast.error` with the field-level issue message |

`useWatchGeneration` and `useWatchProspectScrape` use a `useRef`-based previous-state
tracker to detect transitions (pending/processing → failed) rather than
firing on every poll, so toasts only appear once when a job actually settles.

---

## Project structure

```
bespoke/
├── apps/
│   ├── web/                 # Next.js frontend
│   │   └── src/
│   │       ├── app/         # App Router pages and layouts
│   │       ├── components/  # UI by domain (ui/ offerings/ prospects/ …)
│   │       └── lib/         # api-client, auth-client, TanStack hooks
│   ├── api/                 # Fastify REST API
│   │   └── src/
│   │       ├── plugins/     # auth, cors, db
│   │       ├── routes/      # one folder per domain (handlers + Zod schema)
│   │       ├── services/    # business logic, one file per domain
│   │       └── config.ts    # Zod-validated env
│   └── worker/              # BullMQ standalone worker
│       └── src/processors/  # one file per job type
└── packages/
    ├── db/                  # Drizzle schema, migrations, client factory
    ├── shared/              # shared types, enums, constants
    └── queue/              # queue defs, producers, job payload types
```

---

## Running locally

### Prerequisites

- Node.js `>=24` and pnpm `>=11`
- A PostgreSQL `18.x` database (local or hosted)
- An Upstash Redis database (use the **TCP** `rediss://` connection string)
- API keys: OpenRouter, Firecrawl, Cloudinary (cloud name + key + secret)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
#   then fill in the values (see the next section)

# 3. Apply database migrations (reads ../../.env via dotenv)
pnpm db:migrate

# 4. Start everything (web + api + worker) via Turborepo
pnpm dev
```

All dev/migrate scripts load the root `.env` (via `dotenv-cli`), so the single
gitignored `.env` at the repo root feeds every app locally. Production injects
env vars per service instead. Regenerate migrations after a schema change with
`pnpm db:generate`.

By default:

- web → `http://localhost:3000`
- api → `http://localhost:3001`

Run a single app with, e.g., `pnpm --filter @bespoke/web dev`.

---

## Environment variables

All variables are declared in `.env.example`. Each app reads its own via a
Zod-validated `config.ts`: `process.env` is never accessed directly elsewhere.
`NEXT_PUBLIC_` is used only for values the browser needs.

| Variable                | Used by          | Description                                    |
| ----------------------- | ---------------- | ---------------------------------------------- |
| `DATABASE_URL`          | api, worker, db  | PostgreSQL connection string                   |
| `REDIS_URL`             | api, worker      | Upstash Redis **TCP** URL (`rediss://…`)       |
| `BETTER_AUTH_SECRET`    | api              | Session signing secret                         |
| `BETTER_AUTH_URL`       | api              | Auth base URL                                  |
| `ENCRYPTION_KEY`        | api, worker      | 64 hex chars (32 bytes); encrypts stored secrets (user OpenRouter key). Must match across api + worker |
| `OPENROUTER_API_KEY`    | worker           | Platform OpenRouter key (free models + extraction) |
| `OPENROUTER_MODEL`      | worker           | Default extraction/generation model slug       |
| `FIRECRAWL_API_KEY`     | worker           | Firecrawl scraping key                         |
| `CLOUDINARY_CLOUD_NAME` | api, worker      | Cloudinary cloud name (signing + delivery URL) |
| `CLOUDINARY_API_KEY`    | api              | Cloudinary API key (returned in the signature) |
| `CLOUDINARY_API_SECRET` | api              | Cloudinary secret for signing: server-only    |
| `NEXT_PUBLIC_API_URL`   | web              | Fastify API origin                             |
| `GITHUB_TOKEN`          | worker           | *(optional)* GitHub REST API token. GitHub URLs are scraped via the GitHub API first (higher rate limits, structured data); falls back to Firecrawl on any error. Without this token the fallback always runs. |

> The Vercel AI SDK is a library: it needs no key of its own. The platform
> `OPENROUTER_API_KEY` covers extraction and free (Gemini) generations; paid
> models route through each user's own encrypted OpenRouter key.
>
> Generate `ENCRYPTION_KEY` with `openssl rand -hex 32`. It must be identical
> for api and worker, or stored keys cannot be decrypted.

> Upstash must use the **TCP** endpoint with `ioredis`
> (`maxRetriesPerRequest: null`). The serverless REST SDK (`@upstash/redis`)
> is **not** compatible with BullMQ.

> The web app needs **no** Cloudinary env: the sign endpoint returns the
> cloud name alongside the signature, so the cloud name is never hardcoded in
> the browser bundle.

---

## How generation works

Job payloads carry **IDs only**: web sends the three IDs
(offering/prompt/prospect), the API enqueues the same IDs, and the **worker
loads every row by ID and composes the system prompt there**. A message is built
from three inputs:

- **System prompt**: the worker layers the user's saved prompt on top of a base
  persona + anti-AI-tell craft layer (`buildMessageSystemPrompt` in
  `@bespoke/shared`); the user's prompt overrides on conflict. Controls tone,
  length, structure, and constraints.
- **Offering**: the selected offering's `compiled_context`, giving the model
  the value proposition to anchor on.
- **Prospect context**: the consolidated `prospect_context` merged from every
  scraped URL and vision-read screenshot, with `## Recent Activity` and
  `## Talking Points` elevated to the top so the model opens on a real hook.

Because the prompt and offering are distinct inputs, changing either one
meaningfully changes the output: not just cosmetically. Replies
(`buildReplySystemPrompt`) reuse the full conversation thread plus the original
prospect context and offering, anchored to the original outreach, so a follow-up
continues the conversation rather than starting fresh.

The worker resolves the model per generation: it uses the slug recorded on the
`ai_generation` row and, if the user has a stored OpenRouter key
(`getUserOpenRouterKey` → decrypt), runs the call on that key; otherwise it falls
back to the platform key. The API gates paid-model selection so a user can never
reach the worker with a paid model and no key.

---

## Example outputs

**Example 1: initial outreach**

- **Offering:** Bespoke
- **Prompt:** Partnership request — ≤90 words, opens with a specific mutual fit, proposes shared upside, soft close. No jargon, no templates.
- **Prospect inputs:** LinkedIn screenshot + company site (Kakiyo — LinkedIn automation tool)
- **Generated message:**
  ```
  Hey Ayush, congrats on migrating Kakiyo's data from Appwrite to PlanetScale with zero downtime.

  Since you are scaling your LinkedIn automation, I wondered if you've thought about adding
  background web scraping or vision-reading to your messaging engine. We built Bespoke to
  handle this context-gathering automatically.

  Open to seeing if there is a way to partner and plug this into Kakiyo?
  ```

**Example 2: same prospect, different prompt** (shows prompt customization changing the angle)

- **Prompt A** — Partnership request, ≤90 words, partnership framing:
  ```
  Hey Ayush, congrats on migrating Kakiyo's data from Appwrite to PlanetScale with zero downtime.

  Since you are scaling your LinkedIn automation, I wondered if you've thought about adding
  background web scraping or vision-reading to your messaging engine. We built Bespoke to
  handle this context-gathering automatically.

  Open to seeing if there is a way to partner and plug this into Kakiyo?
  ```
- **Prompt B** — LinkedIn note, ≤60 words, curiosity-first, lighter touch:
  ```
  Hey Ayush, how has the reception been for MemContext among the Cursor and Claude communities?
  We are tackling context for sales at Bespoke, using background scraping to help teams run
  natural reply flows. Let me know if you are open to swapping notes on memory layers.
  ```

---

## Architecture decisions

- **Monorepo (pnpm + Turborepo)**: share Drizzle row types and BullMQ payload
  types across web/api/worker without duplication or drift.
- **Separate worker process**: scraping and AI calls are slow (5–30s) and must
  not block API response time; the worker scales independently of the API.
- **BullMQ + Redis over a DB-based queue**: superior retry, rate limiting, and
  concurrency control; job status is mirrored into Postgres so failures are
  visible without inspecting Redis.
- **Upstash Redis over TCP**: managed, serverless-friendly Redis that still
  exposes a TCP endpoint BullMQ can use.
- **Derived `prospect_context`**: rebuilt by a job rather than merged on every
  generation, so generation reads one clean context row.
- **Offering source tracking**: raw scraped content is stored separately from
  the user-edited offering, so scraping and manual editing compose freely.
- **OpenRouter via the Vercel AI SDK**: one typed interface, easy model
  switching, and built-in vision support for screenshot extraction, behind a
  single API key.
- **Cloudinary signed, browser-direct uploads**: the API signs an upload and
  the browser sends the file straight to Cloudinary, so screenshot bytes never
  hit the API process and the API secret never leaves the server. Only the
  returned `public_id` is stored (`prospect_assets.file_key`); the worker
  rebuilds the delivery URL on demand for vision extraction.
- **Worker failure reasons persisted in Postgres**: `generation_jobs.error` and
  `scrape_jobs.error` store the raw exception message on failure. Polling
  endpoints return these as `failureReason`, so the UI can show "Rate limit
  exceeded from OpenRouter" without requiring log access. The alternative
  (inspecting BullMQ/Redis job state) would add infrastructure coupling and
  make failures invisible once a job is garbage-collected from Redis.

---

## Tradeoffs

- **Three services + Redis is more infrastructure** than a single Next.js app.
  Chosen for clean boundaries and independent scaling of slow background work,
  at the cost of more deploy surface and more env wiring.
- **Polling for job status** (rather than websockets/SSE) keeps the API and
  client simple; the UI shows per-asset scrape status while jobs run.
- **Upstash per-command billing**: BullMQ polls continuously, so command count
  accrues even when idle. Acceptable at this scale; worker concurrency and poll
  intervals are left at defaults to keep it bounded.
- **Cloudinary for screenshot storage**: a hosted image service avoids running
  file infrastructure and gives free delivery-time transforms (the worker fetches
  `f_auto,q_auto` for vision). Adds a third-party dependency and a signed-upload
  round trip vs. a plain API multipart endpoint, traded for keeping file bytes
  off the API and the secret off the client.

---

## What I'd do with more time

- Real-time job status via SSE/websockets instead of polling.
- Streaming generation output token-by-token in the UI.
- A/B comparison view for prompts and offerings on the same prospect.
- Richer analytics (reply rate by offering, rating trends over time).
- Background re-scrape and context refresh when a prospect's sources change.
- Per-user temperature/creativity control (model selection already ships).
- Inline AI "explain" helpers for the offering and prompt editors.
- End-to-end tests covering the full scrape → consolidate → generate flow.
- **RAG over prospect insights for ranking + tight context selection.** Today
  `consolidate-insights` flattens every per-asset insight into one
  `prospect_context` blob and the whole thing is handed to the model. That works
  at small scale but doesn't rank: a prospect with many sources dilutes the
  strongest hook, and irrelevant detail eats the context window. The upgrade:
  - **Chunk + embed** each `prospect_insights` row (and offering fields) at
    consolidation time, store vectors in Postgres via `pgvector` (no new
    datastore: it's a Postgres extension).
  - **Retrieve + rank** at generation time: embed a query built from the
    offering's value prop + prompt intent, pull the top-k most relevant insight
    chunks by cosine similarity, and feed only those into
    `buildMessageSystemPrompt` instead of the full blob.
  - **Score hooks** so `## Recent Activity` / `## Talking Points` are selected by
    relevance to *this* offering rather than recency alone: different offerings
    surface different angles from the same prospect.
  - Keeps generation cost bounded as a prospect accumulates sources, and makes
    the "close context picking" deterministic and inspectable (you can log which
    chunks were retrieved for each message). `pgvector` + an embeddings model
    (OpenRouter already in the stack) is the only new wiring.

---

_Built for the Personalized Outreach Dashboard assignment. Every decision above
is documented in `context/` and can be explained in detail._
