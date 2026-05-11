import { useState, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="text-2xl font-bold text-foreground mb-4 mt-8 first:mt-0">
          {renderInline(line.slice(2))}
        </h1>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-xl font-semibold text-foreground mb-3 mt-8 pb-2 border-b border-border">
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-base font-semibold text-foreground mb-2 mt-5">
          {renderInline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground my-3 text-sm">
          {renderInline(line.slice(2))}
        </blockquote>
      );
    } else if (line === "---" || line === "***") {
      elements.push(<hr key={i} className="border-border my-6" />);
    } else if (/^\|/.test(line)) {
      // collect table rows
      const tableRows: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableRows.push(lines[i]);
        i++;
      }
      elements.push(<TableRenderer key={`table-${i}`} rows={tableRows} />);
      continue;
    } else if (/^[-*] /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(
          <li key={i} className="text-sm leading-relaxed text-foreground/90">
            {renderInline(lines[i].slice(2))}
          </li>
        );
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-outside ml-5 mb-3 space-y-1">
          {items}
        </ul>
      );
      continue;
    } else if (/^\d+\. /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(
          <li key={i} className="text-sm leading-relaxed text-foreground/90">
            {renderInline(lines[i].replace(/^\d+\. /, ""))}
          </li>
        );
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-outside ml-5 mb-3 space-y-1">
          {items}
        </ol>
      );
      continue;
    } else if (line.trim() === "") {
      // skip blank
    } else {
      elements.push(
        <p key={i} className="text-sm leading-relaxed text-foreground/90 mb-3">
          {renderInline(line)}
        </p>
      );
    }
    i++;
  }

  return <div>{elements}</div>;
}

function TableRenderer({ rows }: { rows: string[] }) {
  const parseRow = (row: string) =>
    row
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

  const isSeparator = (row: string) => /^\|[-:| ]+\|$/.test(row);

  const headerRow = rows[0] ? parseRow(rows[0]) : [];
  const bodyRows = rows
    .slice(1)
    .filter((r) => !isSeparator(r))
    .map(parseRow);

  return (
    <div className="overflow-x-auto mb-4 -mx-1">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {headerRow.map((cell, i) => (
              <th
                key={i}
                className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
              >
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-foreground/85 align-top">
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{part.slice(1, -1)}</code>;
    return part;
  });
}

const STAGE1_STEPS = [
  "Scoping market landscape and dynamics...",
  "Mapping competitive intelligence...",
  "Defining ideal customer profiles...",
  "Identifying value gaps and white space...",
  "Assessing barriers to entry...",
  "Crafting initial GTM hooks...",
];

const STAGE2_STEPS = [
  "Extracting primary search keywords...",
  "Pulling live SEO data from DataforSEO...",
  "Scoring keyword difficulty and search intent...",
  "Writing messaging framework & headlines...",
  "Building content opportunity map...",
  "Compiling quick reference card...",
];

function LoadingPanel({ topic, stage }: { topic: string; stage: 1 | 2 }) {
  const steps = stage === 1 ? STAGE1_STEPS : STAGE2_STEPS;
  const stageLabel = stage === 1 ? "Stage 1 — Deep Research" : "Stage 2 — Messaging & SEO";
  const modelLabel = stage === 1 ? "Gemini 2.5 Pro" : "GPT-4o-mini + DataforSEO";

  return (
    <div className="py-16">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-center mb-8">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              {stage === 1 ? (
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* Stage indicator */}
        <div className="flex items-center gap-2 justify-center mb-5">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${stage >= 1 ? "bg-primary" : "bg-muted"}`} />
            <span className={`text-xs font-medium ${stage === 1 ? "text-primary" : "text-muted-foreground"}`}>Deep Research</span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${stage >= 2 ? "bg-primary" : "bg-muted"}`} />
            <span className={`text-xs font-medium ${stage === 2 ? "text-primary" : "text-muted-foreground"}`}>Messaging & SEO</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">{stageLabel}</p>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{modelLabel}</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Analyzing <span className="font-medium text-foreground">"{topic}"</span>
          </p>
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }}>
              <div className="w-2 h-2 rounded-full bg-primary/40 shrink-0" />
              <span className="text-sm text-muted-foreground">{step}</span>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4">
          {stage === 1
            ? "Stage 1 typically takes 30–90 seconds"
            : "Stage 2 typically takes 15–30 seconds"}
        </p>
      </div>
    </div>
  );
}

interface AppError {
  message: string;
  retryable: boolean;
}

function ResearchApp() {
  const [topic, setTopic] = useState("");
  const [loadingStage, setLoadingStage] = useState<0 | 1 | 2>(0);
  const [result, setResult] = useState<{ markdown: string; topic: string } | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLoading = loadingStage > 0;

  const runResearch = async (topicText: string) => {
    setLoadingStage(1);
    setResult(null);
    setError(null);

    try {
      // Stage 1 — Gemini deep research
      const stage1Resp = await fetch("/api/research/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicText }),
      });

      if (!stage1Resp.ok) {
        const data = await stage1Resp.json() as { error?: string; retryable?: boolean };
        setError({
          message: data.error || `Research failed (${stage1Resp.status})`,
          retryable: data.retryable ?? stage1Resp.status === 503,
        });
        return;
      }

      const stage1Data = await stage1Resp.json() as { markdown: string; topic: string };

      // Stage 2 — GPT-4o-mini + DataforSEO
      setLoadingStage(2);

      const stage2Resp = await fetch("/api/research/stage2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicText, researchMarkdown: stage1Data.markdown }),
      });

      if (!stage2Resp.ok) {
        const data = await stage2Resp.json() as { error?: string; retryable?: boolean };
        setError({
          message: data.error || `Stage 2 failed (${stage2Resp.status})`,
          retryable: data.retryable ?? false,
        });
        return;
      }

      const stage2Data = await stage2Resp.json() as { markdown: string };

      setResult({
        topic: stage1Data.topic,
        markdown: stage1Data.markdown + "\n\n---\n\n" + stage2Data.markdown,
      });
    } catch (err) {
      setError({
        message: "Could not reach the server. Please check your connection and try again.",
        retryable: true,
      });
      console.error(err);
    } finally {
      setLoadingStage(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || isLoading) return;
    await runResearch(topic.trim());
  };

  const handleRetry = () => {
    if (topic.trim()) runResearch(topic.trim());
  };

  const handleDownload = () => {
    if (!result) return;
    const slug = result.topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const filename = `gtm-research-${slug}.md`;
    const blob = new Blob([result.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setTopic("");
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">Kiterae Research Agent</h1>
              <p className="text-xs text-muted-foreground">Gemini · GPT-4o-mini · DataforSEO</p>
            </div>
          </div>
          {result && (
            <button
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New research
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Input section */}
        {!result && !isLoading && (
          <div className="mb-10">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-foreground mb-3">Deep GTM Research</h2>
              <p className="text-base text-muted-foreground max-w-xl mx-auto">
                Enter a business idea or market topic. The agent runs two stages: a deep market
                analysis, then a full messaging framework with live SEO data.
              </p>
              {/* Pipeline badge */}
              <div className="mt-5 inline-flex items-center gap-1.5 bg-muted border border-border rounded-full px-3 py-1.5 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" />
                Gemini 2.5 Pro
                <span className="text-border mx-1">→</span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                GPT-4o-mini
                <span className="text-border mx-1">+</span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                DataforSEO
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(e);
                  }}
                  placeholder={
                    "e.g. AI-powered legal contract review for SMBs\ne.g. B2B marketplace for sustainable packaging\ne.g. Real-time translation for remote teams"
                  }
                  rows={4}
                  className="w-full px-4 py-3.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/60 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  autoFocus
                />
                <div className="absolute bottom-3 right-3 text-xs text-muted-foreground/50">⌘↵ to run</div>
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 overflow-hidden">
                  <div className="flex items-start gap-3 px-4 pt-4 pb-3">
                    <svg className="w-4 h-4 text-destructive mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-destructive mb-0.5">
                        {error.retryable ? "Temporarily unavailable" : "Something went wrong"}
                      </p>
                      <p className="text-sm text-destructive/80">{error.message}</p>
                    </div>
                  </div>
                  {error.retryable && (
                    <div className="px-4 pb-3">
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="flex items-center gap-1.5 text-xs font-medium text-destructive hover:opacity-70 transition-opacity"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={!topic.trim()}
                className="w-full py-3 px-6 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Run Deep Research
              </button>
            </form>

            <div className="mt-8">
              <p className="text-xs text-muted-foreground mb-3 text-center">Try an example</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  "AI legal contract review for SMBs",
                  "B2B sustainable packaging marketplace",
                  "No-code data pipeline tools",
                  "Corporate mental health platforms",
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setTopic(example)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && <LoadingPanel topic={topic} stage={loadingStage as 1 | 2} />}

        {/* Result */}
        {result && (
          <div>
            <div className="flex items-start justify-between mb-6 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium">
                  Research Report
                </p>
                <h2 className="text-xl font-bold text-foreground">{result.topic}</h2>
              </div>
              <button
                onClick={handleDownload}
                className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download .md
              </button>
            </div>

            <div className="bg-card border border-border rounded-xl p-8">
              <MarkdownRenderer content={result.markdown} />
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={handleReset}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Research another topic
              </button>
              <button
                onClick={handleDownload}
                className="text-sm text-primary hover:opacity-80 transition-opacity flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download markdown file
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ResearchApp />
    </QueryClientProvider>
  );
}
