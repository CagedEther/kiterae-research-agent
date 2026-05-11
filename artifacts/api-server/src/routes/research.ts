import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { GenerateResearchBody } from "@workspace/api-zod";
import { runStage2 } from "../lib/stage2.js";

interface GeminiErrorBody {
  error?: { code?: number; message?: string; status?: string };
}

function parseGeminiError(raw: string): { message: string; retryable: boolean } {
  // Try to extract JSON from the error message
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const body = JSON.parse(jsonMatch[0]) as GeminiErrorBody;
      const code = body?.error?.code;
      const status = body?.error?.status ?? "";
      if (code === 503 || status === "UNAVAILABLE") {
        return {
          message: "Gemini is experiencing high demand right now. Please wait a moment and try again.",
          retryable: true,
        };
      }
      if (code === 429 || status === "RESOURCE_EXHAUSTED") {
        return {
          message: "You've hit the Gemini API rate limit. Please wait a minute before trying again.",
          retryable: true,
        };
      }
      if (code === 400 || status === "INVALID_ARGUMENT") {
        return { message: "The request was rejected by Gemini. Try rephrasing your topic.", retryable: false };
      }
      if (body?.error?.message) {
        return { message: body.error.message, retryable: false };
      }
    } catch {
      // fall through
    }
  }
  // Generic fallback — strip any JSON blobs from the message
  const cleaned = raw.replace(/\{[\s\S]*\}/, "").trim() || "An unexpected error occurred. Please try again.";
  return { message: cleaned, retryable: false };
}

const router = Router();

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

router.post("/research/generate", async (req, res) => {
  const parsed = GenerateResearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request: topic is required" });
    return;
  }

  const { topic } = parsed.data;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = DEEP_RESEARCH_PROMPT.replace("[TOPIC]", topic);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 8192 },
    });

    const raw = response.text ?? "";

    const markdown = raw
      .split("\n")
      .filter((line) => !/^\*{0,2}date\*{0,2}:\s*.+$/i.test(line.trim()))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    res.json({ markdown, topic });
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to generate research");
    const raw = err instanceof Error ? err.message : String(err);
    const friendly = parseGeminiError(raw);
    const status = friendly.retryable ? 503 : 500;
    res.status(status).json({ error: friendly.message, retryable: friendly.retryable });
  }
});

router.post("/research/stage2", async (req, res) => {
  const { topic, researchMarkdown } = req.body as {
    topic?: string;
    researchMarkdown?: string;
  };

  if (!topic || typeof topic !== "string" || !topic.trim()) {
    res.status(400).json({ error: "Invalid request: topic is required" });
    return;
  }
  if (!researchMarkdown || typeof researchMarkdown !== "string") {
    res.status(400).json({ error: "Invalid request: researchMarkdown is required" });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
    return;
  }
  if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
    res.status(500).json({ error: "DataforSEO credentials are not configured" });
    return;
  }

  try {
    const markdown = await runStage2(topic.trim(), researchMarkdown);
    res.json({ markdown, topic });
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to run stage 2");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Stage 2 error: ${message}` });
  }
});

export default router;
