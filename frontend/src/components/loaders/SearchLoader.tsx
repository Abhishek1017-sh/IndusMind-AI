"use client";

import { useEffect, useState } from "react";
import { Search, CheckCircle2 } from "lucide-react";

const STEPS = [
  "Searching Enterprise Knowledge...",
  "Scanning Documents...",
  "Matching Assets...",
  "Finding Relationships...",
  "Generating Results...",
];

export default function SearchLoader({ onComplete }: { onComplete?: () => void }) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const run = (idx: number) => {
      if (idx >= STEPS.length) {
        if (onComplete) onComplete();
        return;
      }
      setActiveStep(idx);
      timeoutId = setTimeout(() => {
        run(idx + 1);
      }, 100); // 100ms per step = 500ms total
    };

    run(0);
    return () => clearTimeout(timeoutId);
  }, [onComplete]);

  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-4">
      <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center animate-pulse">
        <Search className="w-5 h-5 text-blue-600 animate-spin" style={{ animationDuration: "1.5s" }} />
      </div>
      <div className="space-y-1.5 w-60 text-center">
        {STEPS.map((step, i) => {
          const done = i < activeStep;
          const active = i === activeStep;
          if (i > activeStep) return null;

          return (
            <div
              key={step}
              className="flex items-center justify-center gap-2"
              style={{
                opacity: done ? 0.5 : 1,
                animation: "im-fade-in 0.25s ease both",
              }}
            >
              {done ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] flex-shrink-0" />
              ) : active ? (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping flex-shrink-0" />
              ) : null}
              <span
                className="text-[10px] font-bold"
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
