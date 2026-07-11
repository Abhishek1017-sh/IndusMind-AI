"use client";

import { CheckCircle2 } from "lucide-react";

/* ============================================================
   SKELETON PRIMITIVES
   ============================================================ */
export function SkeletonBox({ w, h, className = "" }: { w?: number | string; h?: number | string; className?: string }) {
  return (
    <div
      className={`im-skeleton ${className}`}
      style={{ width: w ?? "100%", height: h ?? 16, borderRadius: 8 }}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  const widths = [100, 80, 60, 90, 70, 55];
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="im-skeleton"
          style={{
            width: `${widths[i % widths.length]}%`,
            height: 12,
            borderRadius: 6,
            animationDelay: `${i * 0.07}s`,
          }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="im-skeleton w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="im-skeleton h-3 w-3/4 rounded" />
          <div className="im-skeleton h-2.5 w-1/2 rounded" />
        </div>
      </div>
      <div className="im-skeleton h-8 w-full rounded-lg" />
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[#E2E8F0] flex items-center gap-4">
        <div className="im-skeleton h-3 w-24 rounded" />
        <div className="im-skeleton h-3 w-16 rounded ml-auto" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-3.5 border-b border-[#F1F5F9] flex items-center gap-4">
          <div className="im-skeleton w-8 h-8 rounded-lg flex-shrink-0" style={{ animationDelay: `${i * 0.05}s` }} />
          <div className="flex-1 space-y-1.5">
            <div className="im-skeleton h-3 rounded" style={{ width: `${50 + (i * 17) % 40}%`, animationDelay: `${i * 0.07}s` }} />
            <div className="im-skeleton h-2 rounded" style={{ width: `${30 + (i * 11) % 35}%`, animationDelay: `${i * 0.09}s` }} />
          </div>
          <div className="im-skeleton h-5 w-16 rounded-full flex-shrink-0" style={{ animationDelay: `${i * 0.06}s` }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStatBar({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2">
          <div className="im-skeleton h-7 w-12 rounded" style={{ animationDelay: `${i * 0.1}s` }} />
          <div className="im-skeleton h-2.5 w-3/4 rounded" style={{ animationDelay: `${i * 0.12}s` }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-white border border-[#E2E8F0] rounded-2xl p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="im-skeleton h-3 w-28 rounded" />
        <div className="im-skeleton h-5 w-20 rounded-lg" />
      </div>
      <div className="flex items-end gap-2 h-28">
        {[40, 65, 50, 80, 55, 70, 45, 75, 60, 85, 50, 72].map((h, i) => (
          <div
            key={i}
            className="im-skeleton flex-1 rounded-t"
            style={{ height: `${h}%`, animationDelay: `${i * 0.04}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   DOCUMENT UPLOAD PIPELINE LOADER
   ============================================================ */
const PIPELINE_STAGES = [
  "Uploading File",
  "OCR Processing",
  "Entity Extraction",
  "Relationship Detection",
  "Knowledge Graph Generation",
  "Vector Embedding",
  "Indexing Documents",
  "AI Ready",
];

interface PipelineLoaderProps {
  /** Index of the currently active stage (0-based). -1 = not started. */
  activeStage: number;
  filename?: string;
}

export function DocumentPipelineLoader({ activeStage, filename }: PipelineLoaderProps) {
  const progress = Math.round(((activeStage + 1) / PIPELINE_STAGES.length) * 100);

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-5 shadow-sm im-scale-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg,#2563EB,#3B82F6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "im-pulse-glow 2s ease-in-out infinite",
          }}
        >
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1z" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-extrabold text-[#0F172A]">Processing Document</p>
          {filename && <p className="text-[10px] text-[#64748B] font-semibold truncate max-w-xs">{filename}</p>}
        </div>
        <span className="ml-auto text-xs font-bold text-[#2563EB]">{progress}%</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: "#E2E8F0", borderRadius: 99, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg,#2563EB,#60A5FA)",
            borderRadius: 99,
            transition: "width 0.5s ease",
          }}
        />
      </div>

      {/* Pipeline stages */}
      <div className="space-y-2">
        {PIPELINE_STAGES.map((stage, i) => {
          const done    = i < activeStage;
          const active  = i === activeStage;
          const pending = i > activeStage;
          return (
            <div
              key={stage}
              className="flex items-center gap-2.5"
              style={{
                opacity: pending ? 0.4 : 1,
                transition: "opacity 0.3s ease",
              }}
            >
              {done ? (
                <CheckCircle2 className="w-4 h-4 text-[#16A34A] flex-shrink-0" style={{ animation: "im-scale-in 0.2s ease both" }} />
              ) : active ? (
                <div
                  style={{
                    width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                    border: "2px solid #2563EB", borderTopColor: "transparent",
                    animation: "im-spin 0.7s linear infinite",
                  }}
                />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-[#E2E8F0] flex-shrink-0" />
              )}
              <span
                className="text-[11px] font-semibold"
                style={{ color: active ? "#2563EB" : done ? "#16A34A" : "#94A3B8" }}
              >
                {stage}
              </span>
              {active && (
                <div className="flex gap-0.5 ml-auto items-center">
                  {[0, 1, 2].map(d => (
                    <span
                      key={d}
                      style={{
                        width: 3, height: 3, borderRadius: "50%",
                        background: "#2563EB", display: "inline-block",
                        animation: `im-dot-bounce 1s ease-in-out ${d * 0.15}s infinite`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   AUTH GUARD LOADER (premium replacement for basic spinner)
   ============================================================ */
export function AuthGuardLoader() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#F5F7FA]">
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.35 }}>
        <defs>
          <pattern id="ag-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(37,99,235,0.07)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ag-grid)" />
      </svg>
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div
          className="im-pulse-glow"
          style={{
            width: 52, height: 52, borderRadius: 16, flexShrink: 0,
            background: "linear-gradient(135deg,#2563EB,#3B82F6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-extrabold text-[#0F172A]">IndusMind AI</p>
          <p className="text-[11px] text-[#64748B] font-semibold mt-0.5">Initializing workspace…</p>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "#2563EB", display: "inline-block",
                animation: `im-dot-bounce 1.1s ease-in-out ${i * 0.18}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
