import OpenAI from "openai";

const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";

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
  const login = process.env.DATAFORSEO_LOGIN ?? "";
  const password = process.env.DATAFORSEO_PASSWORD ?? "";
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

async function dfsPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${DATAFORSEO_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: dfsAuth(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DataforSEO ${path} failed: ${res.status}`);
  return res.json();
}

async function extractSeedKeywords(
  openai: OpenAI,
  topic: string,
  researchSummary: string
): Promise<string[]> {
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 256,
    messages: [
      {
        role: "system",
        content:
          "You are an SEO strategist. Return a JSON array of exactly 5 short search keywords (2-5 words each) that a potential buyer would type into Google to find solutions related to the topic. No explanations, only valid JSON array of strings.",
      },
      {
        role: "user",
        content: `Topic: ${topic}\n\nContext from market research:\n${researchSummary.slice(0, 1500)}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const text = resp.choices[0]?.message?.content ?? '{"keywords":[]}';
  try {
    const parsed = JSON.parse(text) as { keywords?: string[] };
    const kws = parsed.keywords ?? (Object.values(parsed)[0] as string[]);
    return Array.isArray(kws) ? kws.slice(0, 5) : [];
  } catch {
    return [];
  }
}

async function fetchKeywordIdeas(seeds: string[]): Promise<KeywordItem[]> {
  if (!seeds.length) return [];
  try {
    const data = (await dfsPost(
      "/dataforseo_labs/google/keyword_ideas/live",
      [{ keywords: seeds, language_name: "English", location_name: "United States", limit: 15 }]
    )) as {
      tasks?: Array<{ result?: Array<{ items?: KeywordItem[] }> }>;
    };
    return data.tasks?.[0]?.result?.[0]?.items ?? [];
  } catch {
    return [];
  }
}

async function fetchKeywordOverview(seeds: string[]): Promise<KeywordItem[]> {
  if (!seeds.length) return [];
  try {
    const data = (await dfsPost(
      "/dataforseo_labs/google/bulk_keyword_difficulty/live",
      [{ keywords: seeds, language_name: "English", location_name: "United States" }]
    )) as {
      tasks?: Array<{ result?: Array<{ items?: KeywordItem[] }> }>;
    };
    return data.tasks?.[0]?.result?.[0]?.items ?? [];
  } catch {
    return [];
  }
}

async function fetchSearchIntent(keywords: string[]): Promise<IntentItem[]> {
  if (!keywords.length) return [];
  try {
    const data = (await dfsPost(
      "/dataforseo_labs/google/search_intent/live",
      [{ keywords: keywords.slice(0, 10), language_name: "English", location_name: "United States" }]
    )) as {
      tasks?: Array<{ result?: Array<{ items?: IntentItem[] }> }>;
    };
    return data.tasks?.[0]?.result?.[0]?.items ?? [];
  } catch {
    return [];
  }
}

function formatDifficulty(val: number | null): string {
  if (val === null || val === undefined) return "—";
  return String(Math.round(val));
}

function formatVolume(val: number | null): string {
  if (val === null || val === undefined) return "—";
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
  return String(val);
}

function classifyIntent(keyword: string, intentItems: IntentItem[]): string {
  const found = intentItems.find(
    (i) => i.keyword.toLowerCase() === keyword.toLowerCase()
  );
  if (!found?.intent) return "Info";
  const i = found.intent.toLowerCase();
  if (i.includes("transactional")) return "Trans";
  if (i.includes("commercial")) return "Comm";
  if (i.includes("navigational")) return "Nav";
  return "Info";
}

export async function runStage2(
  topic: string,
  researchMarkdown: string
): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Step 1: extract seed keywords
  const seeds = await extractSeedKeywords(openai, topic, researchMarkdown);

  // Step 2: fetch keyword ideas first, then intent using combined keyword list
  const ideas = await fetchKeywordIdeas(seeds);
  const intentKeywords = [...seeds, ...ideas.slice(0, 5).map((i: KeywordItem) => i.keyword)];
  const intentItems = await fetchSearchIntent(intentKeywords);

  // Pick top 5 primary keywords by search volume
  const allKeywords: KeywordItem[] = [
    ...seeds.map((kw) => {
      const match = ideas.find(
        (i: KeywordItem) => i.keyword.toLowerCase() === kw.toLowerCase()
      );
      return match ?? { keyword: kw, search_volume: null, keyword_difficulty: null, cpc: null, competition: null };
    }),
    ...ideas.slice(0, 10),
  ];

  // Deduplicate by keyword text
  const seen = new Set<string>();
  const deduped = allKeywords.filter((k) => {
    const key = k.keyword.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const primaryKeywords = deduped
    .sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0))
    .slice(0, 5);

  const longTailKeywords = deduped
    .filter((k) => k.keyword.split(" ").length >= 4)
    .slice(0, 8);

  // Build real SEO data block to feed into GPT-4o-mini
  const seoDataBlock = `
Primary keyword candidates (from DataforSEO):
${primaryKeywords.map((k) => `- "${k.keyword}" | vol: ${formatVolume(k.search_volume)} | difficulty: ${formatDifficulty(k.keyword_difficulty)} | intent: ${classifyIntent(k.keyword, intentItems)}`).join("\n")}

Long-tail keyword candidates:
${longTailKeywords.length ? longTailKeywords.map((k) => `- "${k.keyword}" (vol: ${formatVolume(k.search_volume)})`).join("\n") : seeds.map((s) => `- "${s} for small business"`).join("\n")}
`.trim();

  // Step 3: GPT-4o-mini fills the template — SEO first, then messaging informed by it
  const systemPrompt = `You are a senior GTM strategist, SEO specialist, and copywriter.
You will receive deep market research AND real keyword data from DataforSEO.
Your job is to produce a fully completed report in the exact template structure provided.

Critical rules:
- The SEO & Content Strategy section comes FIRST. Complete it fully before writing the Messaging Framework.
- The Messaging Framework comes SECOND and must be explicitly shaped by the keyword clusters, semantic sub-topics, and search intent patterns uncovered in Section 1. Headlines, key messages, and the elevator pitch should reflect the dominant keyword themes.
- The Semantic Sub-topics section (1.2) must be derived from a semantic cluster analysis of the keywords — group related keywords by theme, then name each cluster as a sub-topic a buyer would recognise.
- Replace every [fill] placeholder with real, specific, executive-level content. Never output placeholder labels.
- The keyword table rows for Section 1.1 are pre-filled — reproduce them exactly as given, do not invent or alter the numbers.
- Output only the filled markdown, starting from the ## 1. SEO & Content Strategy heading.`;

  const userPrompt = `
TOPIC: ${topic}

--- DEEP MARKET RESEARCH (Stage 1) ---
${researchMarkdown.slice(0, 4000)}

--- REAL SEO KEYWORD DATA (DataforSEO) ---
${seoDataBlock}

--- TEMPLATE TO FILL (output this structure, filled in) ---

## 1. SEO & Content Strategy

### 1.1 Keyword Mapping

**Primary keywords (top 5 by volume — real DataforSEO data, reproduce exactly):**

| Keyword | Search Volume | Difficulty | Intent | Source |
|---------|-------------:|----------:|--------|--------|
${primaryKeywords.map((k) => `| ${k.keyword} | ${formatVolume(k.search_volume)} | ${formatDifficulty(k.keyword_difficulty)} | ${classifyIntent(k.keyword, intentItems)} | DataforSEO |`).join("\n")}

**Long-tail keywords (max 8 — from DataforSEO data and research context):**
${longTailKeywords.length ? longTailKeywords.map((k) => `- ${k.keyword}`).join("\n") : seeds.map((s) => `- ${s} for small business`).join("\n")}

**Question keywords (max 5 — derive from ICP pains in the research and keyword intent patterns):**
- [fill]
- [fill]
- [fill]
- [fill]
- [fill]

### 1.2 Semantic Sub-topics

> *Cluster the keywords and research themes into 3–5 distinct sub-topics a buyer would recognise. For each, name the sub-topic and explain why it matters strategically.*

| # | Sub-topic | Core keywords in cluster | Strategic relevance (max 15 words) |
|---|-----------|--------------------------|-------------------------------------|
| 1 | [fill] | [fill] | [fill] |
| 2 | [fill] | [fill] | [fill] |
| 3 | [fill] | [fill] | [fill] |
| 4 | [fill — or omit if fewer than 4 clusters] | [fill] | [fill] |
| 5 | [fill — or omit if fewer than 5 clusters] | [fill] | [fill] |

### 1.3 Content Opportunities (max 6)

> *Informed by the keyword data and market research above.*

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

> *Informed by the SEO keyword clusters and semantic sub-topics in Section 1, and grounded in the market research.*

### Headline Options
> *3-5 headline variations for A/B testing — reflect the dominant keyword themes and search intent*

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
> *Conversational version for sales use — language should echo the top keyword themes*

"[fill — opening hook using a pain point from ICP research]. [fill — what we do, using language from the top keyword cluster]. [fill — key differentiator from value gap analysis]. [fill — proof point]. [fill — CTA]."

### Key Messages (Priority Order)
> *Each message should map to one of the semantic sub-topics from Section 1.2*

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

**One-liner (max 18 words — must use language from the top keyword cluster):**
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
[fill]
`.trim();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  return completion.choices[0]?.message?.content ?? "";
}
