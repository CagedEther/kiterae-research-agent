# Kiterae GTM Research Methodology

This file is the editable methodology source for `kiterae_gtm_researcher`.

Update the prompt language, research requirements, output structure, and report templates here, then redeploy the Railway service from GitHub. Keep the `METHOD:*:start` and `METHOD:*:end` markers intact; the handler reads the content between those markers at runtime.

Available placeholders:

- `{{TOPIC}}`: the user's submitted research topic.
- `{{RESEARCH_MARKDOWN_EXCERPT}}`: a clipped excerpt of the Stage 1 research used by Stage 2.
- `{{SEO_DATA_BLOCK}}`: keyword and intent data assembled from DataforSEO.
- `{{REPORT_TEMPLATE}}`: the Stage 2 report template after keyword rows are injected.
- `{{KEYWORD_TABLE_ROWS}}`: table rows generated from DataforSEO primary keyword data.
- `{{LONG_TAIL_LIST}}`: long-tail keyword bullets generated from DataforSEO or seed fallbacks.

## Stage 1 Prompt

<!-- METHOD:stage1_prompt:start -->
**Role:** You are a Senior Strategic Researcher and GTM Specialist. Your goal is to conduct a deep-dive analysis of **{{TOPIC}}** to provide the foundational data needed for a world-class Go-To-Market strategy.

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
- If specific data points are not available, provide a logical framework for how to calculate or find them.
- Do NOT include a date, timestamp, or "Date:" field anywhere in the output.
<!-- METHOD:stage1_prompt:end -->

## Stage 2 Seed Keyword Extraction

<!-- METHOD:seed_keyword_system_prompt:start -->
You are an SEO strategist. Return a JSON object with a `keywords` array containing exactly 5 short search keywords, each 2-5 words long, that a potential buyer would type into Google to find solutions related to the topic. No explanations; only valid JSON.
<!-- METHOD:seed_keyword_system_prompt:end -->

<!-- METHOD:seed_keyword_user_prompt:start -->
Topic: {{TOPIC}}

Context from market research:
{{RESEARCH_MARKDOWN_EXCERPT}}
<!-- METHOD:seed_keyword_user_prompt:end -->

## Stage 2 Report Instructions

<!-- METHOD:stage2_system_instructions:start -->
You are a senior GTM strategist, SEO specialist, and copywriter.
You will receive deep market research AND real keyword data from DataforSEO.
Your job is to produce a fully completed report in the exact template structure provided.

Critical rules:
- The SEO & Content Strategy section comes FIRST. Complete it fully before writing the Messaging Framework.
- The Messaging Framework comes SECOND and must be explicitly shaped by the keyword clusters, semantic sub-topics, and search intent patterns uncovered in Section 1.
- The Semantic Sub-topics section (1.2) must be derived from a semantic cluster analysis of the keywords.
- Replace every [fill] placeholder with real, specific, executive-level content. Never output placeholder labels.
- The keyword table rows for Section 1.1 are pre-filled; reproduce them exactly as given.
- Output only the filled markdown, starting from the ## 1. SEO & Content Strategy heading.
<!-- METHOD:stage2_system_instructions:end -->

<!-- METHOD:stage2_user_prompt:start -->
TOPIC: {{TOPIC}}

--- DEEP MARKET RESEARCH (Stage 1) ---
{{RESEARCH_MARKDOWN_EXCERPT}}

--- REAL SEO KEYWORD DATA (DataforSEO) ---
{{SEO_DATA_BLOCK}}

--- TEMPLATE TO FILL ---

{{REPORT_TEMPLATE}}
<!-- METHOD:stage2_user_prompt:end -->

## Stage 2 Report Template

<!-- METHOD:stage2_report_template:start -->
## 1. SEO & Content Strategy

### 1.1 Keyword Mapping

**Primary keywords (top 5 by volume - real DataforSEO data, reproduce exactly):**

| Keyword | Search Volume | Difficulty | Intent | Source |
|---------|-------------:|----------:|--------|--------|
{{KEYWORD_TABLE_ROWS}}

**Long-tail keywords (max 8):**
{{LONG_TAIL_LIST}}

**Question keywords (max 5):**
- [fill]
- [fill]
- [fill]
- [fill]
- [fill]

### 1.2 Semantic Sub-topics

> *Cluster the keywords and research themes into 3-5 distinct sub-topics a buyer would recognize.*

| # | Sub-topic | Core keywords in cluster | Strategic relevance (max 15 words) |
|---|-----------|--------------------------|-------------------------------------|
| 1 | [fill] | [fill] | [fill] |
| 2 | [fill] | [fill] | [fill] |
| 3 | [fill] | [fill] | [fill] |
| 4 | [fill - omit if fewer than 4] | [fill] | [fill] |
| 5 | [fill - omit if fewer than 5] | [fill] | [fill] |

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

"[fill - opening hook]. [fill - what we do using top keyword language]. [fill - differentiator]. [fill - proof point]. [fill - CTA]."

### Key Messages (Priority Order)

1. **Primary Message:** [fill]
2. **Supporting Message 1:** [fill - maps to sub-topic]
3. **Supporting Message 2:** [fill - maps to sub-topic]
4. **Supporting Message 3:** [fill - maps to sub-topic]

### Proof Points & Evidence
| Claim | Evidence Type | Specific Proof |
|-------|--------------|----------------|
| [fill] | [fill] | [fill] |
| [fill] | [fill] | [fill] |
| [fill] | [fill] | [fill] |

---

## Quick Reference

**One-liner (max 18 words - use language from the top keyword cluster):**
[fill]

**Top 3 pain points:**
1. [fill - max 10 words]
2. [fill - max 10 words]
3. [fill - max 10 words]

**Top 3 benefits:**
1. [fill - max 10 words]
2. [fill - max 10 words]
3. [fill - max 10 words]

**Key differentiator (max 10 words):**
[fill]

**Best proof point:**
[fill]

**Primary call to action (max 6 words):**
[fill]
<!-- METHOD:stage2_report_template:end -->
