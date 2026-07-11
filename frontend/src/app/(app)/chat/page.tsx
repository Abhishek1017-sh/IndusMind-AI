"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { Citation, AgentLogStep } from "@/lib/api";
import { useChat, type Message } from "@/context/ChatContext";
import {
  Send, Bot, User, FileText, ChevronDown, ChevronUp, Loader2,
  Sparkles, Mic, Brain, CheckCircle2, Clock, ChevronRight,
  Shield, X, AlertCircle, BarChart3, Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

// ─── Citation Card ────────────────────────────────────────────────────────────
function CitationCard({ c }: { c: Citation }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg overflow-hidden transition-all" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-blue-500/10 transition-colors">
        <FileText className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
        <span className="text-xs font-medium text-blue-300 flex-1 truncate">{c.document_name}</span>
        {c.page_number && <span className="text-xs text-slate-600 flex-shrink-0">p.{c.page_number}</span>}
        {open ? <ChevronUp className="w-3 h-3 text-slate-500 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 text-slate-500 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1">
          <p className="text-xs text-slate-400 leading-relaxed italic">&ldquo;{c.text}&rdquo;</p>
        </div>
      )}
    </div>
  );
}

// ─── Agent Activity Log ───────────────────────────────────────────────────────
const AGENT_STATUS_COLORS: Record<string, { color: string; icon: React.ElementType }> = {
  COMPLETED:   { color: "#10b981", icon: CheckCircle2 },
  IN_PROGRESS: { color: "#3b82f6", icon: Loader2 },
  SKIPPED:     { color: "#64748b", icon: Clock },
};

function AgentActivityLog({ logs }: { logs: AgentLogStep[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-xl overflow-hidden" style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.02] transition-colors"
      >
        <Brain className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs text-violet-400 font-medium flex-1 text-left">Agent Activity ({logs.length} steps)</span>
        {open ? <ChevronUp className="w-3 h-3 text-slate-600" /> : <ChevronDown className="w-3 h-3 text-slate-600" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {logs.map((log, i) => {
            const cfg = AGENT_STATUS_COLORS[log.status] ?? AGENT_STATUS_COLORS.COMPLETED;
            const Icon = cfg.icon;
            return (
              <div key={i} className="flex items-start gap-2.5">
                {/* Step connector line */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${log.status === "IN_PROGRESS" ? "animate-spin" : ""}`}
                    style={{ color: cfg.color }}
                  />
                  {i < logs.length - 1 && (
                    <div className="w-px h-4 mt-0.5" style={{ background: `${cfg.color}40` }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: cfg.color }}>{log.agent_name}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{log.log_message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Confidence Meter (SVG Arc) ───────────────────────────────────────────────
function ConfidenceMeter({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  const color = pct >= 90 ? "#10b981" : pct >= 75 ? "#3b82f6" : pct >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Track */}
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          {/* Progress arc */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 1.2s ease, stroke 0.4s ease", filter: `drop-shadow(0 0 6px ${color}80)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold" style={{ color }}>{pct}%</span>
          <span className="text-[9px] text-slate-500 font-medium">Confidence</span>
        </div>
      </div>
    </div>
  );
}

// ─── Explainability Drawer ────────────────────────────────────────────────────
function ExplainabilityDrawer({
  open,
  onClose,
  confidenceScore,
  reasoningSteps,
  evidenceBase,
}: {
  open: boolean;
  onClose: () => void;
  confidenceScore: number;
  reasoningSteps: string[];
  evidenceBase: string[];
}) {
  const [stepsOpen, setStepsOpen] = useState(true);
  const [evidenceOpen, setEvidenceOpen] = useState(true);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width: "360px",
          background: "rgba(5,7,15,0.97)",
          borderLeft: "1px solid rgba(255,255,255,0.07)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
          backdropFilter: "blur(20px)",
          boxShadow: open ? "-20px 0 60px rgba(0,0,0,0.5)" : "none",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-bold text-slate-100">AI Explainability</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.05] transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Confidence meter */}
          <div className="rounded-xl p-5 text-center" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
            <ConfidenceMeter score={confidenceScore} />
            <p className="text-xs text-slate-500 mt-3 leading-relaxed">
              Composite score based on source credibility, keyword coverage, and factual completeness.
            </p>
          </div>

          {/* Reasoning Steps */}
          <div className="rounded-xl overflow-hidden" style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={() => setStepsOpen(o => !o)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-white/[0.02] transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-semibold text-slate-300 flex-1 text-left">Reasoning Steps</span>
              <span className="text-xs text-slate-600">{reasoningSteps.length}</span>
              {stepsOpen ? <ChevronUp className="w-3 h-3 text-slate-600" /> : <ChevronDown className="w-3 h-3 text-slate-600" />}
            </button>
            {stepsOpen && (
              <div className="px-4 pb-3 space-y-2">
                {reasoningSteps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="flex flex-col items-center flex-shrink-0 mt-1">
                      <ChevronRight className="w-3 h-3 text-blue-400" />
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Evidence Base */}
          <div className="rounded-xl overflow-hidden" style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={() => setEvidenceOpen(o => !o)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-white/[0.02] transition-colors"
            >
              <AlertCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-300 flex-1 text-left">Evidence Base</span>
              <span className="text-xs text-slate-600">{evidenceBase.length}</span>
              {evidenceOpen ? <ChevronUp className="w-3 h-3 text-slate-600" /> : <ChevronDown className="w-3 h-3 text-slate-600" />}
            </button>
            {evidenceOpen && (
              <div className="px-4 pb-3 space-y-1.5">
                {evidenceBase.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.12)" }}>
                    <FileText className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-slate-400 leading-relaxed">{ev}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Voice Mic Button ─────────────────────────────────────────────────────────
const VOICE_QUERIES = [
  "What documents have I uploaded?",
  "Summarize my most recent document",
  "What are the key skills mentioned in my documents?",
  "What projects are described in my documents?",
  "When are the important dates mentioned in my documents?",
];

function VoiceMicButton({ onQuery, disabled }: { onQuery: (q: string) => void; disabled: boolean }) {
  const [recording, setRecording] = useState(false);
  const [bars] = useState(() => Array.from({ length: 7 }, () => Math.random() * 0.6 + 0.2));

  const handleMic = () => {
    if (recording || disabled) return;
    setRecording(true);

    // Pick a random demo query
    const query = VOICE_QUERIES[Math.floor(Math.random() * VOICE_QUERIES.length)];

    // Simulate typing the query character by character
    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i >= query.length) {
        clearInterval(interval);
        setRecording(false);
        onQuery(query);
      }
    }, 1200 / query.length);
  };

  return (
    <button
      onClick={handleMic}
      disabled={disabled || recording}
      title="Voice input (simulation)"
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 disabled:opacity-40 relative overflow-hidden"
      style={recording
        ? { background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", boxShadow: "0 0 12px rgba(239,68,68,0.25)" }
        : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }
      }
    >
      {recording ? (
        /* Soundwave animation */
        <div className="flex items-center gap-[2px] h-5">
          {bars.map((h, i) => (
            <div
              key={i}
              className="w-0.5 rounded-full"
              style={{
                background: "#ef4444",
                height: `${h * 100}%`,
                animation: `soundwave ${0.6 + i * 0.1}s ease-in-out infinite alternate`,
              }}
            />
          ))}
        </div>
      ) : (
        <Mic className="w-4 h-4 text-slate-400" />
      )}
    </button>
  );
}

// ─── Suggestions ──────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "What documents have I uploaded?",
  "Summarize my most recent document",
  "What skills or technologies are mentioned?",
  "What projects are described in my documents?",
  "What organizations or companies are mentioned?",
];

// ─── Inner Chat (needs Suspense for useSearchParams) ────────────────────────
function ChatInner() {
  const searchParams = useSearchParams();
  const { messages, isLoading, sendMessage, clearChat } = useChat();
  const [input, setInput] = useState("");
  const [explainMsg, setExplainMsg] = useState<Message | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Block body (returns undefined) — a concise arrow here would implicitly
    // return the scrollIntoView() result, which React flags as an invalid
    // effect return value.
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Pre-fill from dashboard quick-query link
  useEffect(() => {
    const q = searchParams.get("q");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time prefill from URL query param
    if (q) setInput(q);
  }, [searchParams]);

  const handleSend = (text: string) => {
    if (!text.trim() || isLoading) return;
    sendMessage(text);
    setInput("");
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); }
  };

  const handleClearChat = () => {
    if (window.confirm("Clear the current conversation? This cannot be undone.")) {
      clearChat();
      setExplainMsg(null);
    }
  };

  return (
    <>
      {/* Soundwave keyframes */}
      <style>{`
        @keyframes soundwave {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1); }
        }
      `}</style>

      <div className="flex flex-col h-screen">
        {/* Header */}
        <div className="px-4 md:px-8 py-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}>
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-100">AI Knowledge Chat</h1>
                <p className="text-xs text-slate-500 truncate">Powered by Gemini 2.5 Flash · Multi-Agent RAG + Knowledge Graph</p>
              </div>
            </div>
            {messages.length > 1 && (
              <button
                onClick={handleClearChat}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-red-400 transition-all duration-200 flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear Chat</span>
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={msg.role === "user"
                  ? { background: "linear-gradient(135deg, #6366f1, #4f46e5)" }
                  : { background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }}
              >
                {msg.role === "user" ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
              </div>

              <div className={`max-w-2xl ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-2`}>
                {/* Message bubble */}
                <div
                  className="rounded-2xl px-4 py-3"
                  style={msg.role === "user"
                    ? { background: "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.15))", border: "1px solid rgba(99,102,241,0.2)" }
                    : { background: "rgba(15,23,42,0.65)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {msg.loading ? (
                    <div className="flex items-center gap-2 py-1">
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                      <span className="text-xs text-slate-500">Agents reasoning…</span>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-200 leading-relaxed prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>

                {/* Agent Activity Log */}
                {msg.agentLogs && msg.agentLogs.length > 0 && (
                  <div className="w-full">
                    <AgentActivityLog logs={msg.agentLogs} />
                  </div>
                )}

                {/* Explainability button */}
                {msg.role === "assistant" && !msg.loading && msg.confidenceScore != null && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExplainMsg(msg)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 hover:scale-105"
                      style={{
                        background: "rgba(139,92,246,0.1)",
                        border: "1px solid rgba(139,92,246,0.25)",
                        color: "#a78bfa",
                      }}
                    >
                      <Shield className="w-3 h-3" />
                      Explainability · {Math.round(msg.confidenceScore * 100)}%
                    </button>
                  </div>
                )}

                {/* Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="space-y-1.5 w-full">
                    <p className="text-xs text-slate-600 px-1">Sources cited:</p>
                    {msg.citations.map((c, i) => <CitationCard key={i} c={c} />)}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions (only on first message) */}
        {messages.length === 1 && (
          <div className="px-4 md:px-8 pb-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => handleSend(s)}
                className="px-3 py-1.5 rounded-full text-xs text-slate-400 hover:text-slate-200 transition-all duration-200"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="px-4 md:px-8 pb-6 flex-shrink-0">
          <div className="flex items-end gap-3 p-3 rounded-2xl" style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about assets, failures, SOPs, maintenance history…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 resize-none outline-none leading-relaxed max-h-32"
              style={{ scrollbarWidth: "none" }}
            />
            {/* Voice mic */}
            <VoiceMicButton onQuery={(q) => { setInput(q); }} disabled={isLoading} />
            {/* Send */}
            <button
              onClick={() => handleSend(input)}
              disabled={!input.trim() || isLoading}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", boxShadow: "0 4px 12px rgba(59,130,246,0.3)" }}
            >
              {isLoading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
          <p className="text-center text-xs text-slate-700 mt-2">AI answers are grounded in uploaded plant documents. Verify critical decisions with qualified engineers.</p>
        </div>
      </div>

      {/* Explainability Drawer */}
      <ExplainabilityDrawer
        open={explainMsg !== null}
        onClose={() => setExplainMsg(null)}
        confidenceScore={explainMsg?.confidenceScore ?? 0.9}
        reasoningSteps={explainMsg?.reasoningSteps ?? []}
        evidenceBase={explainMsg?.evidenceBase ?? []}
      />
    </>
  );
}

// ─── Page (Suspense wrapper for useSearchParams) ──────────────────────────────
export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    }>
      <ChatInner />
    </Suspense>
  );
}
