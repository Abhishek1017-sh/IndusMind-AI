"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { Citation, AgentLogStep } from "@/lib/api";
import { useChat, type Message } from "@/context/ChatContext";
import {
  Send, Bot, User, FileText, ChevronDown, ChevronUp,
  Sparkles, Mic, Brain, CheckCircle2, Clock, ChevronRight,
  Shield, X, AlertCircle, BarChart3, Trash2, Download, Loader2
} from "lucide-react";
import AIThinkingLoader from "@/components/loaders/AIThinkingLoader";
import ReactMarkdown from "react-markdown";

// ─── Citation Card ────────────────────────────────────────────────────────────
function CitationCard({ c }: { c: Citation }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden transition-all border border-[#E2E8F0] bg-white">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F8FAFC] transition-colors cursor-pointer">
        <FileText className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
        <span className="text-xs font-semibold text-[#0F172A] flex-1 truncate">{c.document_name}</span>
        {c.page_number && <span className="text-xs text-[#64748B] font-semibold flex-shrink-0">p. {c.page_number}</span>}
        {open ? <ChevronUp className="w-3.5 h-3.5 text-[#64748B] flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-[#64748B] flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-[#E2E8F0] bg-[#F8FAFC]">
          <p className="text-xs text-[#64748B] leading-relaxed italic font-medium">&ldquo;{c.text}&rdquo;</p>
        </div>
      )}
    </div>
  );
}

// ─── Agent Activity Log ───────────────────────────────────────────────────────
const AGENT_STATUS_COLORS: Record<string, { color: string; bg: string; icon: React.ElementType }> = {
  COMPLETED:   { color: "#16A34A", bg: "#DCFCE7", icon: CheckCircle2 },
  IN_PROGRESS: { color: "#2563EB", bg: "#DBEAFE", icon: Loader2 },
  SKIPPED:     { color: "#64748B", bg: "#F1F5F9", icon: Clock },
};

function AgentActivityLog({ logs }: { logs: AgentLogStep[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-[#E2E8F0] bg-white">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#F8FAFC] transition-colors cursor-pointer"
      >
        <Brain className="w-3.5 h-3.5 text-purple-600" />
        <span className="text-xs text-purple-700 font-bold flex-1 text-left">Agent Activity ({logs.length} steps)</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-[#64748B]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />}
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2 border-t border-[#E2E8F0] pt-3 bg-[#F8FAFC]">
          {logs.map((log, i) => {
            const cfg = AGENT_STATUS_COLORS[log.status] ?? AGENT_STATUS_COLORS.COMPLETED;
            const Icon = cfg.icon;
            return (
              <div key={i} className="flex items-start gap-2.5">
                <div className="flex flex-col items-center flex-shrink-0">
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${log.status === "IN_PROGRESS" ? "animate-spin" : ""}`}
                    style={{ color: cfg.color }}
                  />
                  {i < logs.length - 1 && (
                    <div className="w-px h-4 mt-0.5" style={{ background: `${cfg.color}30` }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold" style={{ color: cfg.color }}>{log.agent_name}</p>
                  <p className="text-xs text-[#64748B] leading-relaxed font-semibold">{log.log_message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Confidence Meter ────────────────────────────────────────────────────────
function ConfidenceMeter({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  const color = pct >= 90 ? "#16A34A" : pct >= 75 ? "#2563EB" : pct >= 60 ? "#F59E0B" : "#DC2626";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 1.2s ease, stroke 0.4s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold" style={{ color }}>{pct}%</span>
          <span className="text-[9px] text-[#64748B] font-bold">Confidence</span>
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
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <div
        className="fixed top-0 right-0 h-full z-50 flex flex-col overflow-hidden bg-white border-l border-[#E2E8F0]"
        style={{
          width: "360px",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: open ? "-10px 0 30px rgba(15,23,42,0.06)" : "none",
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-bold text-[#0F172A]">AI Explainability</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 cursor-pointer">
            <X className="w-4 h-4 text-[#64748B]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="rounded-xl p-5 text-center border border-purple-100" style={{ background: "rgba(124,58,237,0.04)" }}>
            <ConfidenceMeter score={confidenceScore} />
            <p className="text-xs text-[#64748B] mt-3 leading-relaxed font-semibold">
              This score aggregates source data verification credibility and retrieval context matching coverage.
            </p>
          </div>

          {/* Reasoning Steps */}
          <div className="rounded-xl overflow-hidden border border-[#E2E8F0] bg-white">
            <button
              onClick={() => setStepsOpen(o => !o)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-xs font-bold text-[#0F172A] flex-1 text-left">Reasoning Steps</span>
              <span className="text-xs text-[#64748B] font-bold">{reasoningSteps.length}</span>
              {stepsOpen ? <ChevronUp className="w-3.5 h-3.5 text-[#64748B]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />}
            </button>
            {stepsOpen && (
              <div className="px-4 pb-3 space-y-2 border-t border-[#E2E8F0] pt-3 bg-[#F8FAFC]">
                {reasoningSteps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <ChevronRight className="w-3 h-3 text-blue-600 mt-1 flex-shrink-0" />
                    <p className="text-xs text-[#64748B] leading-relaxed font-semibold">{step}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Evidence Base */}
          <div className="rounded-xl overflow-hidden border border-[#E2E8F0] bg-white">
            <button
              onClick={() => setEvidenceOpen(o => !o)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <AlertCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs font-bold text-[#0F172A] flex-1 text-left">Evidence Base</span>
              <span className="text-xs text-[#64748B] font-bold">{evidenceBase.length}</span>
              {evidenceOpen ? <ChevronUp className="w-3.5 h-3.5 text-[#64748B]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />}
            </button>
            {evidenceOpen && (
              <div className="px-4 pb-3 space-y-1.5 border-t border-[#E2E8F0] pt-3 bg-[#F8FAFC]">
                {evidenceBase.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg border" style={{ background: "#DCFCE7", borderColor: "#BBF7D0" }}>
                    <FileText className="w-3.5 h-3.5 text-emerald-700 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-emerald-800 leading-relaxed font-semibold">{ev}</p>
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
  "Why did Pump P-101 fail?",
  "Show SOP for Boiler-02",
  "Find all inspections of Compressor C-12",
  "What caused last shutdown?",
];

function VoiceMicButton({ onQuery, disabled }: { onQuery: (q: string) => void; disabled: boolean }) {
  const [recording, setRecording] = useState(false);
  const [bars] = useState(() => Array.from({ length: 7 }, () => Math.random() * 0.6 + 0.2));

  const handleMic = () => {
    if (recording || disabled) return;
    setRecording(true);

    const query = VOICE_QUERIES[Math.floor(Math.random() * VOICE_QUERIES.length)];

    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i >= query.length) {
        clearInterval(interval);
        setRecording(false);
        onQuery(query);
      }
    }, 1000 / query.length);
  };

  return (
    <button
      onClick={handleMic}
      disabled={disabled || recording}
      title="Voice input (simulation)"
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-205 disabled:opacity-40 relative overflow-hidden cursor-pointer"
      style={recording
        ? { background: "#FEE2E2", border: "1.5px solid #FCA5A5" }
        : { background: "#F1F5F9", border: "1.5px solid #E2E8F0" }
      }
    >
      {recording ? (
        <div className="flex items-center gap-[2px] h-5">
          {bars.map((h, i) => (
            <div
              key={i}
              className="w-0.5 rounded-full"
              style={{
                background: "#DC2626",
                height: `${h * 100}%`,
                animation: `soundwave ${0.6 + i * 0.1}s ease-in-out infinite alternate`,
              }}
            />
          ))}
        </div>
      ) : (
        <Mic className="w-4 h-4 text-[#64748B]" />
      )}
    </button>
  );
}

// ─── Suggestions ──────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "Why did Pump P-101 fail?",
  "Show SOP for Boiler-02",
  "Compare E-201 and E-202 records",
  "Summarize Jamnagar refinery compliance",
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

  useEffect(() => {
    const q = searchParams.get("q");
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
    if (window.confirm("Clear current conversation?")) {
      clearChat();
      setExplainMsg(null);
    }
  };

  return (
    <>
      <style>{`
        @keyframes soundwave {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1); }
        }
      `}</style>

      <div className="flex flex-col h-[calc(100vh-60px)] bg-[#FAFAF8]">
        {/* Header */}
        <div className="px-6 py-4 flex-shrink-0 bg-white border-b border-[#E2E8F0]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-blue-600 to-blue-500">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-extrabold text-[#0F172A] leading-tight">AI Copilot Chat</h1>
                <p className="text-[10px] text-[#64748B] font-semibold">Gemini Multi-Agent RAG Engine • Fact Grounded</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 1 && (
                <button
                  onClick={handleClearChat}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Chat</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={msg.role === "user"
                  ? { background: "linear-gradient(135deg, #2563EB, #3B82F6)" }
                  : { background: "linear-gradient(135deg, #0F172A, #1E293B)" }}
              >
                {msg.role === "user" ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
              </div>

              <div className={`max-w-2xl ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-2`}>
                {/* Bubble */}
                <div
                  className="rounded-2xl px-4 py-3 border"
                  style={msg.role === "user"
                    ? { background: "#DBEAFE", borderColor: "#BFDBFE", color: "#1E3A8A" }
                    : { background: "#FFFFFF", borderColor: "#E2E8F0", color: "#0F172A" }}
                >
                  {msg.loading ? (
                    <AIThinkingLoader />
                  ) : (
                    <div className="text-xs font-semibold leading-relaxed max-w-none prose prose-sm text-[#0F172A]">
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

                {/* Grounding & Explainability */}
                {msg.role === "assistant" && !msg.loading && msg.confidenceScore != null && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setExplainMsg(msg)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 cursor-pointer"
                    >
                      <Shield className="w-3 h-3" />
                      Explainability • {Math.round(msg.confidenceScore * 100)}%
                    </button>
                    <button className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border border-[#E2E8F0] text-[#64748B] bg-white hover:bg-slate-50 cursor-pointer">
                      <Download className="w-3 h-3" /> Export Response
                    </button>
                  </div>
                )}

                {/* Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="space-y-1.5 w-full">
                    <p className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider px-1">Sources Cited:</p>
                    {msg.citations.map((c, i) => <CitationCard key={i} c={c} />)}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Suggested prompts list */}
        {messages.length === 1 && (
          <div className="px-6 pb-4 flex flex-wrap gap-2 flex-shrink-0">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => handleSend(s)}
                className="px-3 py-1.5 rounded-full text-xs text-[#64748B] hover:text-[#0F172A] border border-[#E2E8F0] bg-white hover:bg-[#F1F5F9] font-bold transition-all cursor-pointer">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input box */}
        <div className="px-6 pb-5 flex-shrink-0 bg-white border-t border-[#E2E8F0] pt-4">
          <div className="flex items-end gap-3 p-2 bg-[#FAFAF8] border border-[#E2E8F0] rounded-2xl focus-within:border-blue-600 transition-colors">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about SOP specs, bearing vibration, compliance reports, or RCAs..."
              rows={1}
              className="flex-1 bg-transparent text-xs text-[#0F172A] placeholder:text-[#94A3B8] resize-none outline-none leading-relaxed max-h-32 p-1"
              style={{ scrollbarWidth: "none" }}
            />
            <VoiceMicButton onQuery={(q) => { setInput(q); }} disabled={isLoading} />
            <button
              onClick={() => handleSend(input)}
              disabled={!input.trim() || isLoading}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-600 hover:bg-blue-750 text-white disabled:opacity-40 cursor-pointer"
            >
              {isLoading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
            </button>
          </div>
          <p className="text-center text-[10px] text-[#94A3B8] font-semibold mt-2">
            Copilot retrieves grounded documentation details. Review all recommendations with sector coordinators.
          </p>
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

// ─── Page Wrapper ────────────────────────────────────────────────────────────
export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-[#F8FAFC]">
        <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    }>
      <ChatInner />
    </Suspense>
  );
}
