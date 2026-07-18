"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  AlertCircle, BarChart3, Bot, ChevronDown, FileText, Layers, Mic,
  Send, Shield, Sparkles, Trash2, User, X,
} from "lucide-react";

import { fetchChatSuggestions, type Citation, type AgentLogStep } from "@/lib/api";
import { useChat, type Message } from "@/context/ChatContext";
import { Badge, Button, StatusDot, type Tone } from "@/components/ui";
import { EASE, expandCollapse } from "@/components/motion/variants";
import { cn } from "@/lib/utils";

/* Grounding note: every answer, citation and agent step shown here comes from
   the backend RAG pipeline over the user's own documents. This file only
   restyles that data — it invents nothing. */

// ── Confidence → semantic tone (meaning, not decoration) ────────────────────
function confidenceTone(score: number): Tone {
  const pct = score * 100;
  if (pct >= 90) return "success";
  if (pct >= 75) return "brand";
  if (pct >= 60) return "warning";
  return "danger";
}
const TONE_HEX: Record<Tone, string> = {
  neutral: "#8794a7", success: "#047857", warning: "#b45309",
  danger: "#b42318", info: "#175cd3", brand: "#4f46e5",
};

// ── Markdown wrapper (typography plugin isn't installed — style inline) ──────
function AnswerBody({ content }: { content: string }) {
  return (
    <div
      className={cn(
        "text-[13px] leading-relaxed text-ink",
        "[&>*+*]:mt-2.5 [&_strong]:font-semibold [&_strong]:text-ink",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1",
        "[&_h1]:text-sm [&_h1]:font-bold [&_h2]:text-[13px] [&_h2]:font-bold [&_h3]:font-semibold",
        "[&_code]:rounded [&_code]:bg-subtle [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]",
        "[&_a]:text-brand [&_a]:underline"
      )}
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

// ── Thinking state — Copilot-style animated indicator ───────────────────────
function ThinkingState() {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-brand"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-ink-tertiary">Analyzing your documents…</span>
    </div>
  );
}

// ── Source citation with expandable preview ─────────────────────────────────
function CitationCard({ c, index }: { c: Citation; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-ui-md border border-line bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-subtle"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-brand-subtle text-[9px] font-bold text-brand">
          {index}
        </span>
        <FileText className="h-3 w-3 shrink-0 text-ink-tertiary" />
        <span className="flex-1 truncate text-xs font-semibold text-ink">{c.document_name}</span>
        {c.page_number != null && (
          <span className="shrink-0 text-[10px] font-semibold text-ink-tertiary">p.{c.page_number}</span>
        )}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="h-3 w-3 text-ink-tertiary" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            variants={expandCollapse}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            className="overflow-hidden border-t border-line bg-subtle"
          >
            <p className="px-3 py-2 text-xs italic leading-relaxed text-ink-secondary">
              &ldquo;{c.text}&rdquo;
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Agent execution timeline ────────────────────────────────────────────────
const AGENT_TONE: Record<string, Tone> = {
  COMPLETED: "success", IN_PROGRESS: "brand", SKIPPED: "neutral",
};
function AgentTimeline({ logs }: { logs: AgentLogStep[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-ui-md border border-line bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 transition-colors hover:bg-subtle"
      >
        <Layers className="h-3 w-3 text-brand" />
        <span className="flex-1 text-left text-xs font-semibold text-ink">
          Agent execution · {logs.length} steps
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="h-3 w-3 text-ink-tertiary" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            variants={expandCollapse}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            className="overflow-hidden border-t border-line bg-subtle"
          >
            <ol className="space-y-2.5 px-3 py-2.5">
              {logs.map((log, i) => {
                const tone = AGENT_TONE[log.status] ?? "neutral";
                return (
                  <li key={i} className="flex gap-2.5">
                    <div className="flex flex-col items-center">
                      <span
                        className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: TONE_HEX[tone] }}
                      />
                      {i < logs.length - 1 && <span className="mt-0.5 w-px flex-1 bg-line-strong" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-0.5">
                      <p className="text-[11px] font-bold text-ink">{log.agent_name}</p>
                      <p className="text-[11px] leading-snug text-ink-secondary">{log.log_message}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Confidence donut (semantic colour by score) ─────────────────────────────
function ConfidenceMeter({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const r = 40;
  const circ = 2 * Math.PI * r;
  const color = TONE_HEX[confidenceTone(score)];
  return (
    <div className="relative h-24 w-24">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-subtle)" strokeWidth="8" />
        <motion.circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct / 100) }}
          transition={{ duration: 0.9, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums" style={{ color }}>{pct}%</span>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-tertiary">Confidence</span>
      </div>
    </div>
  );
}

// ── Explainability drawer ───────────────────────────────────────────────────
function ExplainabilityDrawer({
  msg, onClose,
}: { msg: Message | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {msg && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-ink/25"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 z-50 flex h-full w-[360px] max-w-full flex-col border-l border-line bg-surface shadow-e4"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-brand" />
                <span className="text-sm font-bold text-ink">AI Explainability</span>
              </div>
              <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-ui-md hover:bg-subtle">
                <X className="h-4 w-4 text-ink-tertiary" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="flex flex-col items-center rounded-ui-lg border border-line bg-subtle p-5">
                <ConfidenceMeter score={msg.confidenceScore ?? 0} />
                <p className="mt-3 text-center text-xs leading-relaxed text-ink-secondary">
                  Aggregates source-verification credibility and retrieval-context coverage for this answer.
                </p>
              </div>

              <DrawerSection icon={BarChart3} title="Reasoning steps" count={msg.reasoningSteps?.length ?? 0}>
                {(msg.reasoningSteps ?? []).map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                    <span className="text-xs leading-relaxed text-ink-secondary">{s}</span>
                  </li>
                ))}
              </DrawerSection>

              <DrawerSection icon={AlertCircle} title="Evidence base" count={msg.evidenceBase?.length ?? 0}>
                {(msg.evidenceBase ?? []).map((e, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-ui-md border border-success/20 bg-success-subtle px-2.5 py-1.5">
                    <FileText className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                    <span className="text-xs leading-relaxed text-success">{e}</span>
                  </li>
                ))}
              </DrawerSection>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerSection({
  icon: Icon, title, count, children,
}: { icon: React.ElementType; title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-ui-lg border border-line">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Icon className="h-3.5 w-3.5 text-ink-tertiary" />
        <span className="flex-1 text-[11px] font-bold uppercase tracking-wide text-ink-secondary">{title}</span>
        <span className="text-[11px] font-bold text-ink-tertiary">{count}</span>
      </div>
      {count > 0 ? (
        <ul className="space-y-1.5 p-3">{children}</ul>
      ) : (
        <p className="px-3 py-2 text-[11px] text-ink-tertiary">Not provided for this answer.</p>
      )}
    </div>
  );
}

// ── Voice input (simulation) — now types a REAL grounded suggestion ─────────
function VoiceMicButton({
  onQuery, disabled, pool,
}: { onQuery: (q: string) => void; disabled: boolean; pool: string[] }) {
  const [recording, setRecording] = useState(false);
  // Deterministic bar heights — Math.random() during render is impure and can
  // cause a hydration mismatch; the waveform is decorative so a fixed pattern
  // reads identically.
  const bars = [0.5, 0.85, 0.4, 0.95, 0.6, 0.75];

  const handleMic = () => {
    if (recording || disabled || pool.length === 0) return;
    setRecording(true);
    const query = pool[Math.floor(Math.random() * pool.length)];
    let i = 0;
    const timer = setInterval(() => {
      if (++i >= query.length) {
        clearInterval(timer);
        setRecording(false);
        onQuery(query);
      }
    }, 900 / Math.max(query.length, 1));
  };

  return (
    <button
      onClick={handleMic}
      disabled={disabled || recording || pool.length === 0}
      title={pool.length === 0 ? "Upload a document to enable voice prompts" : "Voice input (simulation)"}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-md border transition-colors disabled:opacity-40",
        recording ? "border-danger/40 bg-danger-subtle" : "border-line bg-surface hover:bg-subtle"
      )}
    >
      {recording ? (
        <div className="flex h-4 items-center gap-[2px]">
          {bars.map((h, i) => (
            <span
              key={i}
              className="w-0.5 rounded-full bg-danger"
              style={{ height: `${h * 100}%`, animation: `soundwave ${0.6 + i * 0.1}s ease-in-out infinite alternate` }}
            />
          ))}
        </div>
      ) : (
        <Mic className="h-4 w-4 text-ink-tertiary" />
      )}
    </button>
  );
}

// ── Main chat ───────────────────────────────────────────────────────────────
function ChatInner() {
  const searchParams = useSearchParams();
  const { messages, isLoading, sendMessage, clearChat } = useChat();

  // Prefill from a `?q=` deep link (e.g. Dashboard quick actions) once, at
  // mount — derived initial state, so no state-syncing effect is needed.
  const [input, setInput] = useState(() => searchParams.get("q") ?? "");
  const [explainMsg, setExplainMsg] = useState<Message | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetchChatSuggestions().then((s) => { if (active) setSuggestions(s); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // Block body so the effect returns undefined, not scrollIntoView()'s value.
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (text: string) => {
    if (!text.trim() || isLoading) return;
    sendMessage(text);
    setInput("");
  };
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); }
  };
  const handleClear = () => {
    if (window.confirm("Clear this conversation?")) { clearChat(); setExplainMsg(null); }
  };

  const isEmpty = messages.length === 1;

  return (
    <>
      <style>{`@keyframes soundwave{from{transform:scaleY(.3)}to{transform:scaleY(1)}}`}</style>

      <div className="flex min-h-0 flex-1 flex-col bg-canvas">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-5 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-ui-md bg-brand">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-[13px] font-bold leading-tight text-ink">AI Chat</h1>
              <p className="flex items-center gap-1.5 text-[11px] text-ink-tertiary">
                <StatusDot tone="success" pulse /> Multi-agent RAG · grounded in your documents
              </p>
            </div>
          </div>
          {!isEmpty && (
            <Button variant="danger" size="sm" onClick={handleClear}>
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </header>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn("mx-auto w-full max-w-3xl px-5 py-6", isEmpty && "flex min-h-full flex-col justify-center")}>
            {isEmpty ? (
              <WelcomeCard suggestions={suggestions} onPick={handleSend} />
            ) : (
              <div className="space-y-6">
                {messages.map((msg) => (
                  <MessageRow key={msg.id} msg={msg} onExplain={() => setExplainMsg(msg)} />
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-line bg-surface px-5 py-3">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <div className="flex flex-1 items-end gap-2 rounded-ui-lg border border-line bg-canvas px-3 py-2 transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask anything about your uploaded documents…"
                className="max-h-36 flex-1 resize-none bg-transparent py-1 text-[13px] text-ink outline-none placeholder:text-ink-tertiary"
              />
            </div>
            <VoiceMicButton onQuery={setInput} disabled={isLoading} pool={suggestions} />
            <button
              onClick={() => handleSend(input)}
              disabled={isLoading || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-md bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mx-auto mt-1.5 max-w-3xl text-center text-[10px] text-ink-tertiary">
            Answers are grounded in your documents with citations. Verify critical actions with a specialist.
          </p>
        </div>
      </div>

      <ExplainabilityDrawer msg={explainMsg} onClose={() => setExplainMsg(null)} />
    </>
  );
}

// ── Welcome / empty state ───────────────────────────────────────────────────
function WelcomeCard({ suggestions, onPick }: { suggestions: string[]; onPick: (q: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="rounded-ui-xl border border-line bg-surface p-6 shadow-e1"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-ui-lg bg-brand">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-ink">Welcome</h2>
          <p className="text-xs text-ink-tertiary">Your AI Knowledge Assistant</p>
        </div>
      </div>

      <p className="mb-5 text-[13px] leading-relaxed text-ink-secondary">
        I answer questions using <span className="font-semibold text-ink">only the documents you&apos;ve uploaded</span> —
        with full source citations. If you haven&apos;t uploaded anything yet, head to the{" "}
        <Link href="/documents" className="font-semibold text-brand hover:underline">Documents</Link>{" "}
        page first, then come back and ask me anything about it.
      </p>

      {suggestions.length > 0 ? (
        <>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
            Suggested questions from your documents
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onPick(s)}
                className="rounded-ui-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-secondary transition-colors hover:border-brand-line hover:bg-brand-subtle hover:text-brand"
              >
                {s}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-ui-md border border-dashed border-line-strong bg-subtle px-3 py-2.5 text-xs text-ink-tertiary">
          No documents yet — upload one on the Documents page and tailored questions will appear here.
        </div>
      )}
    </motion.div>
  );
}

// ── One message ─────────────────────────────────────────────────────────────
function MessageRow({ msg, onExplain }: { msg: Message; onExplain: () => void }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}
        className="flex justify-end gap-2.5"
      >
        <div className="max-w-[85%] rounded-ui-lg rounded-tr-sm border border-brand-line bg-brand-subtle px-3.5 py-2.5">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{msg.content}</p>
        </div>
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-ui-md bg-ink">
          <User className="h-3.5 w-3.5 text-white" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE }}
      className="flex gap-2.5"
    >
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-ui-md bg-brand">
        <Sparkles className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="rounded-ui-lg rounded-tl-sm border border-line bg-surface px-3.5 py-3 shadow-e1">
          {msg.loading ? <ThinkingState /> : <AnswerBody content={msg.content} />}
        </div>

        {!!msg.agentLogs?.length && <AgentTimeline logs={msg.agentLogs} />}

        {!!msg.citations?.length && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
              Sources · {msg.citations.length}
            </p>
            {msg.citations.map((c, i) => (
              <CitationCard key={i} c={c} index={i + 1} />
            ))}
          </div>
        )}

        {msg.role === "assistant" && msg.confidenceScore != null && !msg.loading && (
          <button
            onClick={onExplain}
            className="inline-flex items-center gap-1.5 rounded-ui-md border border-line bg-surface px-2 py-1 transition-colors hover:bg-subtle"
          >
            <Shield className="h-3 w-3 text-ink-tertiary" />
            <span className="text-[11px] font-semibold text-ink-secondary">Explainability</span>
            <Badge tone={confidenceTone(msg.confidenceScore)}>
              {Math.round(msg.confidenceScore * 100)}%
            </Badge>
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── Page wrapper (Suspense required for useSearchParams) ────────────────────
export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 items-center justify-center bg-canvas">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      }
    >
      <ChatInner />
    </Suspense>
  );
}
