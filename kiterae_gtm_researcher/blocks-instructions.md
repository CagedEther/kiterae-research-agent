# Kiterae GTM Researcher — Blocks Network Guide

## What this agent does

`kiterae_gtm_researcher` is a two-stage GTM research agent published on the [Blocks Network](https://app.blocks.ai). Given a business idea or market topic, it runs a full research pipeline and returns three markdown artifacts:

| Artifact | `outputId` | Contents |
|----------|-----------|----------|
| Full combined report | `full_report` | Stage 1 + Stage 2 joined in one document |
| Stage 1 — Market Research | `stage1` | Deep market analysis from Gemini 2.5 Pro |
| Stage 2 — SEO & Messaging | `stage2` | SEO strategy and messaging framework |

---

## Pipeline

```
User topic
    │
    ▼
Stage 1 — Gemini 2.5 Pro
    Deep market research report covering:
    • Market size (TAM/SAM/SOM) and CAGR
    • Competitive intelligence (incumbents + disruptors)
    • Ideal Customer Profile (ICP) and pains/gains
    • Value gap / white space
    • Barriers to entry
    • GTM messaging hooks
    │
    ▼
Stage 2 — GPT-4o-mini + DataforSEO
    Seed keyword extraction → DataforSEO keyword ideas + search intent
    → GPT-4o-mini fills the full strategy template:

    Section 1: SEO & Content Strategy
      1.1 Keyword Mapping       (real DataforSEO data)
      1.2 Semantic Sub-topics   (keyword cluster analysis)
      1.3 Content Opportunities (informed by research + SEO)

    Section 2: Messaging Framework
      (headlines, taglines, elevator pitch, key messages, proof points)
      — explicitly grounded in Section 1 keyword themes

    Quick Reference
      (one-liner, pain points, benefits, differentiator, CTA)
```

---

## Agent card summary (`agent-card.json`)

| Field | Value |
|-------|-------|
| `agentName` | `kiterae_gtm_researcher` |
| `displayName` | Kiterae GTM Researcher |
| `taskKinds` | `["request"]` |
| `maxRunningTimeSec` | `300` (5 minutes — pipeline is Gemini + DataforSEO + GPT-4o-mini) |
| `concurrency` | `3` |
| `billing` | Free / playground |
| `visibility` | Public |

### Input schema

The agent accepts a single JSON input (`application/json`):

```json
{
  "topic": "AI-powered legal contract review for SMBs"
}
```

The `topic` field is required. The `text` field is accepted as a fallback alias.

### Output schema

Three `text/markdown` artifacts are returned (see table above). Only `full_report` is guaranteed; `stage1` and `stage2` are returned on success.

---

## Running the agent locally

The agent runs as a persistent Replit workflow (`kiterae_gtm_researcher: Blocks Agent`). It uses `blocks run` to register with the Blocks Network and listen for tasks via PubNub.

**Required environment variables** (set in `kiterae_gtm_researcher/.env`):

| Variable | Purpose |
|----------|---------|
| `BLOCKS_API_KEY` | Blocks Network authentication |
| `GEMINI_API_KEY` | Stage 1 — Gemini 2.5 Pro via Google GenAI SDK |
| `OPENAI_API_KEY` | Stage 2 — GPT-4o-mini for keyword extraction + template fill |
| `DATAFORSEO_LOGIN` | Stage 2 — DataforSEO REST API (Basic auth) |
| `DATAFORSEO_PASSWORD` | Stage 2 — DataforSEO REST API (Basic auth) |

**Note:** The agent is self-contained — it does not call back to the Kiterae API server. All AI calls are made directly from `handler.ts`.

---

## Sending a task (trigger script)

```bash
cd kiterae_gtm_researcher
BLOCKS_API_KEY=<your-key> npx tsx trigger.ts
```

The trigger sends the topic `"AI-powered legal contract review for SMBs"` by default. Edit `trigger.ts` to change it.

Expected output on success:

```
[trigger] Sending task...
[trigger] Task created: <uuid>
[trigger] Waiting up to 5 minutes for task to complete...
[progress] Stage 1: Running deep market research with Gemini 2.5 Pro…
[progress] Stage 2: Building SEO strategy and messaging framework…
[progress] Done.
[artifact] text/markdown   ← stage1
[artifact] text/markdown   ← stage2
[artifact] text/markdown   ← full_report
[done] Terminal state: completed | reason: none
```

---

## Calling the agent from another service

```typescript
import { TaskClient } from '@blocks-network/sdk';

const client = await TaskClient.create({
  billingMode: 'free',
  apiKey: process.env.BLOCKS_API_KEY,
});

const session = await client.sendMessage({
  agentName: 'kiterae_gtm_researcher',
  requestParts: [{
    partId: 'request',
    text: JSON.stringify({ topic: 'B2B sustainable packaging marketplace' }),
  }],
});

const terminal = await session.waitForTerminal(300_000);
const artifacts = session.listArtifacts();
// artifacts[0] → full_report.md
```

---

## Blocks dashboard

View tasks, inspect artifacts, and trigger the agent manually:

**https://app.blocks.ai** → search `kiterae_gtm_researcher`

---

## Key files

| File | Purpose |
|------|---------|
| `handler.ts` | Main agent logic — runs Stage 1 and Stage 2 end-to-end |
| `agent-card.json` | Agent metadata, IO schema, and runtime config |
| `trigger.ts` | Test script to send a task and print results |
| `.env` | Local environment variables (API keys) |
