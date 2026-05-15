import { readFileSync } from 'node:fs';
import type { HandlerResult, StartTaskMessage, TaskContext } from '@blocks-network/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';
const METHODOLOGY = loadMethodology();

interface ResearchMethodology {
  stage1Prompt: string;
  seedKeywordSystemPrompt: string;
  seedKeywordUserPrompt: string;
  stage2SystemInstructions: string;
  stage2UserPrompt: string;
  stage2ReportTemplate: string;
}

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

function loadMethodology(): ResearchMethodology {
  const source = readFileSync(new URL('./research-methodology.md', import.meta.url), 'utf8');

  return {
    stage1Prompt: extractMethodologySection(source, 'stage1_prompt'),
    seedKeywordSystemPrompt: extractMethodologySection(source, 'seed_keyword_system_prompt'),
    seedKeywordUserPrompt: extractMethodologySection(source, 'seed_keyword_user_prompt'),
    stage2SystemInstructions: extractMethodologySection(source, 'stage2_system_instructions'),
    stage2UserPrompt: extractMethodologySection(source, 'stage2_user_prompt'),
    stage2ReportTemplate: extractMethodologySection(source, 'stage2_report_template'),
  };
}

function extractMethodologySection(source: string, id: string): string {
  const pattern = new RegExp(`<!--\\s*METHOD:${id}:start\\s*-->([\\s\\S]*?)<!--\\s*METHOD:${id}:end\\s*-->`, 'i');
  const match = source.match(pattern);

  if (!match?.[1]?.trim()) {
    throw new Error(`Missing methodology section: ${id}`);
  }

  return match[1].trim();
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (rendered, [key, value]) => rendered.replaceAll(`{{${key}}}`, value),
    template,
  );
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
  if (val === null || val === undefined) return '-';
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return String(val);
}

function formatDifficulty(val: number | null): string {
  if (val === null || val === undefined) return '-';
  return String(Math.round(val));
}

function classifyIntent(keyword: string, intentItems: IntentItem[]): string {
  const found = intentItems.find((item) => item.keyword.toLowerCase() === keyword.toLowerCase());
  if (!found?.intent) return 'Info';

  const intent = found.intent.toLowerCase();
  if (intent.includes('transactional')) return 'Trans';
  if (intent.includes('commercial')) return 'Comm';
  if (intent.includes('navigational')) return 'Nav';
  return 'Info';
}

async function runStage1(topic: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const prompt = renderTemplate(METHODOLOGY.stage1Prompt, { TOPIC: topic });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { maxOutputTokens: 8192 },
  });
  const raw = response.text ?? '';
  return raw
    .split('\n')
    .filter((line) => !/^\*{0,2}date\*{0,2}:\s*.+$/i.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function runStage2(topic: string, researchMarkdown: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const seedResp = await openai.chat.completions.create({
    model: process.env.OPENAI_SEED_MODEL || 'gpt-4o-mini',
    max_tokens: 256,
    messages: [
      {
        role: 'system',
        content: METHODOLOGY.seedKeywordSystemPrompt,
      },
      {
        role: 'user',
        content: renderTemplate(METHODOLOGY.seedKeywordUserPrompt, {
          TOPIC: topic,
          RESEARCH_MARKDOWN_EXCERPT: researchMarkdown.slice(0, 1500),
        }),
      },
    ],
    response_format: { type: 'json_object' },
  });

  const seeds = parseSeedKeywords(seedResp.choices[0]?.message?.content ?? '{}');

  const ideasRaw = seeds.length
    ? (await dfsPost('/dataforseo_labs/google/keyword_ideas/live', [
        { keywords: seeds, language_name: 'English', location_name: 'United States', limit: 15 },
      ]).catch(() => null)) as { tasks?: Array<{ result?: Array<{ items?: KeywordItem[] }> }> } | null
    : null;
  const ideas: KeywordItem[] = ideasRaw?.tasks?.[0]?.result?.[0]?.items ?? [];

  const intentKeywords = [...seeds, ...ideas.slice(0, 5).map((item) => item.keyword)];
  const intentRaw = intentKeywords.length
    ? (await dfsPost('/dataforseo_labs/google/search_intent/live', [
        { keywords: intentKeywords.slice(0, 10), language_name: 'English', location_name: 'United States' },
      ]).catch(() => null)) as { tasks?: Array<{ result?: Array<{ items?: IntentItem[] }> }> } | null
    : null;
  const intentItems: IntentItem[] = intentRaw?.tasks?.[0]?.result?.[0]?.items ?? [];

  const seen = new Set<string>();
  const allKeywords: KeywordItem[] = [
    ...seeds.map((kw) => ideas.find((item) => item.keyword.toLowerCase() === kw.toLowerCase()) ?? {
      keyword: kw,
      search_volume: null,
      keyword_difficulty: null,
      cpc: null,
      competition: null,
    }),
    ...ideas.slice(0, 10),
  ].filter((keywordItem) => {
    const key = keywordItem.keyword.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const primaryKeywords = [...allKeywords]
    .sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0))
    .slice(0, 5);
  const longTailKeywords = allKeywords.filter((keyword) => keyword.keyword.split(' ').length >= 4).slice(0, 8);

  const seoDataBlock = `Primary keyword candidates (from DataforSEO):
${primaryKeywords.map((keyword) => `- "${keyword.keyword}" | vol: ${formatVolume(keyword.search_volume)} | difficulty: ${formatDifficulty(keyword.keyword_difficulty)} | intent: ${classifyIntent(keyword.keyword, intentItems)}`).join('\n')}

Long-tail keyword candidates:
${longTailKeywords.length ? longTailKeywords.map((keyword) => `- "${keyword.keyword}" (vol: ${formatVolume(keyword.search_volume)})`).join('\n') : seeds.map((seed) => `- "${seed} for small business"`).join('\n')}`.trim();

  const keywordTableRows = primaryKeywords
    .map((keyword) => `| ${keyword.keyword} | ${formatVolume(keyword.search_volume)} | ${formatDifficulty(keyword.keyword_difficulty)} | ${classifyIntent(keyword.keyword, intentItems)} | DataforSEO |`)
    .join('\n');
  const longTailList = longTailKeywords.length
    ? longTailKeywords.map((keyword) => `- ${keyword.keyword}`).join('\n')
    : seeds.map((seed) => `- ${seed} for small business`).join('\n');
  const reportTemplate = renderTemplate(METHODOLOGY.stage2ReportTemplate, {
    KEYWORD_TABLE_ROWS: keywordTableRows,
    LONG_TAIL_LIST: longTailList,
  });

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_REPORT_MODEL || 'gpt-4o-mini',
    max_tokens: 8192,
    messages: [
      {
        role: 'system',
        content: METHODOLOGY.stage2SystemInstructions,
      },
      {
        role: 'user',
        content: renderTemplate(METHODOLOGY.stage2UserPrompt, {
          TOPIC: topic,
          RESEARCH_MARKDOWN_EXCERPT: researchMarkdown.slice(0, 4000),
          SEO_DATA_BLOCK: seoDataBlock,
          REPORT_TEMPLATE: reportTemplate,
        }),
      },
    ],
  });

  return completion.choices[0]?.message?.content ?? '';
}

function parseSeedKeywords(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const keywordValue = parsed.keywords ?? Object.values(parsed).find(Array.isArray);
    if (!Array.isArray(keywordValue)) return [];

    return keywordValue
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export default async function handler(
  task: StartTaskMessage,
  ctx?: TaskContext,
): Promise<HandlerResult> {
  const topic = readTopic(task);

  if (!topic) {
    return {
      artifacts: [
        {
          data: 'Error: topic is required.',
          mimeType: 'text/plain',
          fileName: 'missing-topic.txt',
          outputId: 'full_report',
        },
      ],
    };
  }

  ctx?.reportStatus('Stage 1: Running deep market research with Gemini 2.5 Pro...');
  let stage1Markdown: string;
  try {
    stage1Markdown = await runStage1(topic);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      artifacts: [
        {
          data: `Stage 1 failed: ${msg}`,
          mimeType: 'text/plain',
          fileName: 'stage1-error.txt',
          outputId: 'full_report',
        },
      ],
    };
  }

  ctx?.reportStatus('Stage 2: Building SEO strategy and messaging framework...');
  let stage2Markdown: string;
  try {
    stage2Markdown = await runStage2(topic, stage1Markdown);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      artifacts: [
        { data: stage1Markdown, mimeType: 'text/markdown', fileName: 'stage1-market-research.md', outputId: 'stage1' },
        { data: `Stage 2 failed: ${msg}`, mimeType: 'text/plain', fileName: 'stage2-error.txt', outputId: 'stage2_error' },
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

function readTopic(task: StartTaskMessage): string {
  const part = task.requestParts?.[0] as unknown;
  const parsed = parsePart(part);

  if (typeof parsed === 'string') return parsed.trim();
  if (!isRecord(parsed)) return '';

  const topic = pickString(parsed, 'topic');
  if (topic) return topic;

  const text = pickString(parsed, 'text');
  if (!text) return '';

  const textValue = parseMaybeJson(text);
  if (typeof textValue === 'string') return textValue.trim();
  if (isRecord(textValue)) return pickString(textValue, 'topic', 'text');

  return '';
}

function parsePart(part: unknown): unknown {
  if (isRecord(part)) {
    if (typeof part.text === 'string') return parseMaybeJson(part.text);
    if ('data' in part) return parseMaybeJson(part.data);
  }

  return parseMaybeJson(part);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function pickString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }

  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
