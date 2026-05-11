import type { StartTaskMessage, TaskContext, HandlerResult } from '@blocks-network/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

const DEEP_RESEARCH_PROMPT = `**Role:** You are a Senior Strategic Researcher and GTM Specialist. Your goal is to conduct a deep-dive analysis of **[TOPIC]** to provide the foundational data needed for a world-class Go-To-Market strategy.

**Task:** Research and synthesize a comprehensive "Business Potential & Market Overview" report. Your analysis must be data-driven, objective, and focused on commercial viability.

**Structure of Output:**

1. **Market Landscape & Dynamics:**
   - Define the current market size (TAM/SAM/SOM) and projected growth rates (CAGR).
   - Identify the top 3 macro-trends (technological, regulatory, or social) driving this space.

2. **Competitive Intelligence:**
   - Map the "Big Three" incumbents and the "Rising Disruptors."
   - For each, identify their core value proposition and their "Achilles' Heel" (weakness).

3. **The Ideal Customer Profile (ICP):**
   - Define the high-intent buyer personas.
   - List their top 3 "Pains" and the specific "Gains" they seek from a new solution.

4. **The Value Gap:**
   - Where is the current market failing? Identify the specific "white space" or underserved segment that a new entrant can dominate.

5. **Barrier Analysis:**
   - What are the primary hurdles to entry (e.g., high switching costs, regulatory moats, technical debt)?

6. **GTM "Hooks":**
   - Suggest 3 specific messaging angles or "hooks" that would resonate in current market conditions for sales collateral.

**Constraints:**
- Use professional, executive-level tone.
- Prioritize "Unobvious Insights" over general knowledge.
- If specific data points aren't available, provide a logical framework for how to calculate or find them.
- Do NOT include a date, timestamp, or "Date:" field anywhere in the output.`;

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';

interface KeywordItem {
  keyword: string;
  search_volume: number | null;
  keyword_difficulty: number | null;
  cpc: number | null;
  competition: number | null;
}

interface IntentItem {
  keyword: string;
  intent: string | null;
}

function dfsAuth(): string {
  const login = process.env.DATAFORSEO_LOGIN ?? '';
  const password = process.env.DATAFORSEO_PASSWORD ?? '';
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

async function dfsPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${DATAFORSEO_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: dfsAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DataforSEO ${path} failed: ${res.status}`);
  return res.json();
}

function formatVolume(val: number | null): string {
  if (val === null || val === undefined) return '—';
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return String(val);
}

function formatDifficulty(val: number | null): string {
  if (val === null || val === undefined) return '—';
  return String(Math.round(val));
}

function classifyIntent(keyword: string, intentItems: IntentItem[]): string {
  const found = intentItems.find(i => i.keyword.toLowerCase() === keyword.toLowerCase());
  if (!found?.intent) return 'Info';
  const i = found.intent.toLowerCase();
  if (i.includes('transactional')) return 'Trans';
  if (i.includes('commercial')) return 'Comm';
  if (i.includes('navigational')) return 'Nav';
  return 'Info';
}

async function runStage1(topic: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const prompt = DEEP_RESEARCH_PROMPT.replace('[TOPIC]', topic);
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { maxOutputTokens: 8192 },
  });
  const raw = response.text ?? '';
  return raw
    .split('\n')
    .filter(line => !/^\*{0,2}date\*{0,2}:\s*.+$/i.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function runStage2(topic: string, researchMarkdown: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const seedResp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 256,
    messages: [
      {
        role: 'system',
        content:
          'You are an SEO strategist. Return a JSON array of exactly 5 short search keywords (2-5 words each) that a potential buyer would type into Google to find solutions related to the topic. No explanations, only valid JSON array of strings.',
      },
      { role: 'user', content: `Topic: ${topic}\n\nContext from market research:\n${researchMarkdown.slice(0, 1500)}` },
    ],
    response_format: { type: 'json_object' },
  });

  let seeds: string[] = [];
  try {
    const parsed = JSON.parse(seedResp.choices[0]?.message?.content ?? '{}') as { keywords?: string[] };
    const kws = parsed.keywords ?? (Object.values(parsed)[0] as string[]);
    seeds = Array.isArray(kws) ? kws.slice(0, 5) : [];
  } catch { seeds = []; }

  const ideasRaw = seeds.length
    ? (await dfsPost('/dataforseo_labs/google/keyword_ideas/live', [
        { keywords: seeds, language_name: 'English', location_name: 'United States', limit: 15 },
      ]).catch(() => null)) as { tasks?: Array<{ result?: Array<{ items?: KeywordItem[] }> }> } | null
    : null;
  const ideas: KeywordItem[] = ideasRaw?.tasks?.[0]?.result?.[0]?.items ?? [];

  const intentKeywords = [...seeds, ...ideas.slice(0, 5).map(i => i.keyword)];
  const intentRaw = intentKeywords.length
    ? (await dfsPost('/dataforseo_labs/google/search_intent/live', [
        { keywords: intentKeywords.slice(0, 10), language_name: 'English', location_name: 'United States' },
      ]).catch(() => null)) as { tasks?: Array<{ result?: Array<{ items?: IntentItem[] }> }> } | null
    : null;
  const intentItems: IntentItem[] = intentRaw?.tasks?.[0]?.result?.[0]?.items ?? [];

  const seen = new Set<string>();
  const allKeywords: KeywordItem[] = [
    ...seeds.map(kw => ideas.find(i => i.keyword.toLowerCase() === kw.toLowerCase()) ?? { keyword: kw, search_volume: null, keyword_difficulty: null, cpc: null, competition: null }),
    ...ideas.slice(0, 10),
  ].filter(k => { const key = k.keyword.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });

  const primaryKeywords = [...allKeywords].sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0)).slice(0, 5);
  const longTailKeywords = allKeywords.filter(k => k.keyword.split(' ').length >= 4).slice(0, 8);

  const seoDataBlock = `Primary keyword candidates (from DataforSEO):
${primaryKeywords.map(k => `- "${k.keyword}" | vol: ${formatVolume(k.search_volume)} | difficulty: ${formatDifficulty(k.keyword_difficulty)} | intent: ${classifyIntent(k.keyword, intentItems)}`).join('\n')}

Long-tail keyword candidates:
${longTailKeywords.length ? longTailKeywords.map(k => `- "${k.keyword}" (vol: ${formatVolume(k.search_volume)})`).join('\n') : seeds.map(s => `- "${s} for small business"`).join('\n')}`.trim();

  const keywordTableRows = primaryKeywords.map(k => `| ${k.keyword} | ${formatVolume(k.search_volume)} | ${formatDifficulty(k.keyword_difficulty)} | ${classifyIntent(k.keyword, intentItems)} | DataforSEO |`).join('\n');
  const longTailList = longTailKeywords.length ? longTailKeywords.map(k => `- ${k.keyword}`).join('\n') : seeds.map(s => `- ${s} for small business`).join('\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 8192,
    messages: [
      {
        role: 'system',
        content: `You are a senior GTM strategist, SEO specialist, and copywriter.
You will receive deep market research AND real keyword data from DataforSEO.
Your job is to produce a fully completed report in the exact template structure provided.

Critical rules:
- The SEO & Content Strategy section comes FIRST. Complete it fully before writing the Messaging Framework.
- The Messaging Framework comes SECOND and must be explicitly shaped by the keyword clusters, semantic sub-topics, and search intent patterns uncovered in Section 1.
- The Semantic Sub-topics section (1.2) must be derived from a semantic cluster analysis of the keywords.
- Replace every [fill] placeholder with real, specific, executive-level content. Never output placeholder labels.
- The keyword table rows for Section 1.1 are pre-filled — reproduce them exactly as given.
- Output only the filled markdown, starting from the ## 1. SEO & Content Strategy heading.`,
      },
      {
        role: 'user',
        content: `TOPIC: ${topic}

--- DEEP MARKET RESEARCH (Stage 1) ---
${researchMarkdown.slice(0, 4000)}

--- REAL SEO KEYWORD DATA (DataforSEO) ---
${seoDataBlock}

--- TEMPLATE TO FILL ---

## 1. SEO & Content Strategy

### 1.1 Keyword Mapping

**Primary keywords (top 5 by volume — real DataforSEO data, reproduce exactly):**

| Keyword | Search Volume | Difficulty | Intent | Source |
|---------|-------------:|----------:|--------|--------|
${keywordTableRows}

**Long-tail keywords (max 8):**
${longTailList}

**Question keywords (max 5):**
- [fill]
- [fill]
- [fill]
- [fill]
- [fill]

### 1.2 Semantic Sub-topics

> *Cluster the keywords and research themes into 3–5 distinct sub-topics a buyer would recognise.*

| # | Sub-topic | Core keywords in cluster | Strategic relevance (max 15 words) |
|---|-----------|--------------------------|-------------------------------------|
| 1 | [fill] | [fill] | [fill] |
| 2 | [fill] | [fill] | [fill] |
| 3 | [fill] | [fill] | [fill] |
| 4 | [fill — omit if fewer than 4] | [fill] | [fill] |
| 5 | [fill — omit if fewer than 5] | [fill] | [fill] |

### 1.3 Content Opportunities (max 6)

| Content Type | Topic | Funnel Stage | Why This Topic Wins | Proof Needed |
|-------------|-------|-------------|---------------------|-------------|
| [fill] | [fill] | [fill] | [fill] | [fill] |
| [fill] | [fill] | [fill] | [fill] | [fill] |
| [fill] | [fill] | [fill] | [fill] | [fill] |
| [fill] | [fill] | [fill] | [fill] | [fill] |
| [fill] | [fill] | [fill] | [fill] | [fill] |
| [fill] | [fill] | [fill] | [fill] | [fill] |

---

## 2. Messaging Framework

> *Informed by the SEO keyword clusters and semantic sub-topics in Section 1.*

### Headline Options

1. **Benefit-Led:** [fill]
2. **Problem-Led:** [fill]
3. **Audience-Led:** [fill]
4. **Differentiator-Led:** [fill]
5. **Proof-Led:** [fill]

### Tagline/Subhead Options
1. [fill]
2. [fill]
3. [fill]

### Elevator Pitch (30 seconds)

"[fill — opening hook]. [fill — what we do using top keyword language]. [fill — differentiator]. [fill — proof point]. [fill — CTA]."

### Key Messages (Priority Order)

1. **Primary Message:** [fill]
2. **Supporting Message 1:** [fill — maps to sub-topic]
3. **Supporting Message 2:** [fill — maps to sub-topic]
4. **Supporting Message 3:** [fill — maps to sub-topic]

### Proof Points & Evidence
| Claim | Evidence Type | Specific Proof |
|-------|--------------|----------------|
| [fill] | [fill] | [fill] |
| [fill] | [fill] | [fill] |
| [fill] | [fill] | [fill] |

---

## Quick Reference

**One-liner (max 18 words — use language from the top keyword cluster):**
[fill]

**Top 3 pain points:**
1. [fill — max 10 words]
2. [fill — max 10 words]
3. [fill — max 10 words]

**Top 3 benefits:**
1. [fill — max 10 words]
2. [fill — max 10 words]
3. [fill — max 10 words]

**Key differentiator (max 10 words):**
[fill]

**Best proof point:**
[fill]

**Primary call to action (max 6 words):**
[fill]`,
      },
    ],
  });

  return completion.choices[0]?.message?.content ?? '';
}

export default async function handler(
  task: StartTaskMessage,
  ctx?: TaskContext,
): Promise<HandlerResult> {
  const input = task.requestParts?.[0];
  const body = typeof input === 'string' ? JSON.parse(input) : (input as Record<string, unknown>);
  const topic = ((body?.topic as string) ?? (body?.text as string) ?? '').trim();

  if (!topic) {
    return { artifacts: [{ data: 'Error: topic is required.', mimeType: 'text/plain' }] };
  }

  ctx?.reportStatus('Stage 1: Running deep market research with Gemini 2.5 Pro…');
  let stage1Markdown: string;
  try {
    stage1Markdown = await runStage1(topic);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { artifacts: [{ data: `Stage 1 failed: ${msg}`, mimeType: 'text/plain' }] };
  }

  ctx?.reportStatus('Stage 2: Building SEO strategy and messaging framework…');
  let stage2Markdown: string;
  try {
    stage2Markdown = await runStage2(topic, stage1Markdown);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      artifacts: [
        { data: stage1Markdown, mimeType: 'text/markdown', fileName: 'stage1-market-research.md', outputId: 'stage1' },
        { data: `Stage 2 failed: ${msg}`, mimeType: 'text/plain', outputId: 'stage2_error' },
      ],
    };
  }

  const combined = `# Kiterae GTM Research: ${topic}\n\n${stage1Markdown}\n\n---\n\n${stage2Markdown}`;
  ctx?.reportStatus('Done.');

  return {
    artifacts: [
      { data: combined, mimeType: 'text/markdown', fileName: 'kiterae-gtm-research.md', outputId: 'full_report' },
      { data: stage1Markdown, mimeType: 'text/markdown', fileName: 'stage1-market-research.md', outputId: 'stage1' },
      { data: stage2Markdown, mimeType: 'text/markdown', fileName: 'stage2-seo-messaging.md', outputId: 'stage2' },
    ],
  };
}
