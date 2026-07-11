"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, CheckCircle2 } from "lucide-react";

const STEPS = [
  "Checking Factory Act...",
  "Checking ISO Standards...",
  "Checking OISD...",
  "Checking PESO...",
  "Reviewing Inspection Reports...",
  "Compliance Analysis Complete",
];

export default function ComplianceLoader() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const intervals = [400, 350, 450, 400, 500, 300];
    let timeoutId: any;
    
    const run = (idx: number) => {
      if (idx >= STEPS.length) return;
      setActiveStep(idx);
      timeoutId = setTimeout(() => {
        run(idx + 1);
      }, intervals[idx] || 400);
    };

    run(0);
    return () => clearTimeout(timeoutId);
  }, []);

  const isComplete = activeStep === STEPS.length - 1;

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 flex flex-col items-center justify-center shadow-sm space-y-6 min-h-[300px] im-scale-in">
      <div
        className="im-pulse-glow"
        style={{
          width: 52, height: 52, borderRadius: 16,
          background: isComplete ? "linear-gradient(135deg,#16A34A,#4ADE80)" : "linear-gradient(135deg,#2563EB,#3B82F6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: isComplete ? "0 6px 20px rgba(22,163,74,0.25)" : "0 6px 20px rgba(37,99,235,0.25)",
          transition: "background 0.5s ease, box-shadow 0.5s ease",
        }}
      >
        <ShieldCheck className="w-7 h-7 text-white" />
      </div>

      <div className="space-y-2.5 w-64 text-center">
        {STEPS.map((step, i) => {
          const done = i < activeStep || isComplete;
          const active = i === activeStep && !isComplete;
          if (i > activeStep && !isComplete) return null;

          return (
            <div
              key={step}
              className="flex items-center justify-center gap-2.5"
              style={{
                opacity: done ? 1 : 0.45,
                animation: "im-fade-in 0.3s ease both",
              }}
            >
              {done ? (
                <CheckCircle2 className="w-4 h-4 text-[#16A34A] flex-shrink-0" />
              ) : active ? (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-[#E2E8F0] flex-shrink-0" />
              )}
              <span
                className="text-xs font-bold"
                style={{ color: active ? "#2563EB" : done ? "#16A34A" : "#64748B" }}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
