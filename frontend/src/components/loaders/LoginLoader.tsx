"use client";

import { useEffect, useState } from "react";
import { Brain, CheckCircle2 } from "lucide-react";

const STEPS = [
  "Verifying Credentials",
  "Loading User Workspace",
  "Connecting Knowledge Graph",
  "Loading Plant Context",
  "Preparing Dashboard",
];

export default function LoginLoader() {
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [ringPct, setRingPct] = useState(0);

  useEffect(() => {
    STEPS.forEach((_, i) => {
      setTimeout(() => {
        setCompletedSteps(prev => [...prev, i]);
        setRingPct(Math.round(((i + 1) / STEPS.length) * 100));
      }, 180 + i * 220);
    });
  }, []);

  const RADIUS = 34;
  const CIRC = 2 * Math.PI * RADIUS;
  const dashOffset = CIRC - (ringPct / 100) * CIRC;

  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-center"
      style={{ background: "#F5F7FA" }}
    >
      {/* Background grid */}
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.4 }}>
        <defs>
          <pattern id="ll-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(37,99,235,0.07)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ll-grid)" />
      </svg>

      <div className="relative z-10 flex flex-col items-center gap-7">

        {/* Circular progress ring + logo */}
        <div className="relative" style={{ width: 96, height: 96 }}>
          <svg width="96" height="96" viewBox="0 0 96 96" style={{ position: "absolute", inset: 0 }}>
            {/* Track */}
            <circle cx="48" cy="48" r={RADIUS} fill="none" stroke="#E2E8F0" strokeWidth="4" />
            {/* Progress */}
            <circle
              cx="48" cy="48" r={RADIUS} fill="none"
              stroke="url(#ll-grad)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 48 48)"
              style={{ transition: "stroke-dashoffset 0.4s cubic-bezier(0.4,0,0.2,1)" }}
            />
            <defs>
              <linearGradient id="ll-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#60A5FA" />
              </linearGradient>
            </defs>
          </svg>
          <div
            style={{
              position: "absolute", inset: 10,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#2563EB,#3B82F6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 20px rgba(37,99,235,0.3)",
            }}
          >
            <Brain className="w-8 h-8 text-white" style={{ animation: "im-float 2.5s ease-in-out infinite" }} />
          </div>
        </div>

        {/* Heading */}
        <div className="text-center">
          <h2 className="text-base font-extrabold text-[#0F172A]">Authenticating User</h2>
          <p className="text-xs text-[#64748B] font-semibold mt-0.5">Establishing secure enterprise session…</p>
        </div>

        {/* Animated steps */}
        <div className="space-y-2 w-64">
          {STEPS.map((step, i) => {
            const done = completedSteps.includes(i);
            return (
              <div
                key={step}
                className="flex items-center gap-2.5"
                style={{
                  opacity: done ? 1 : 0.35,
                  transition: "opacity 0.3s ease",
                }}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A] flex-shrink-0" style={{ animation: "im-scale-in 0.25s ease both" }} />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-[#E2E8F0] flex-shrink-0" />
                )}
                <span className="text-[11px] font-semibold text-[#0F172A]">{step}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
