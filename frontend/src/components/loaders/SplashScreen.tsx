"use client";

import { useEffect, useState, useRef } from "react";
import { Brain } from "lucide-react";

const MESSAGES = [
  "Initializing AI Engine...",
  "Loading Industrial Knowledge...",
  "Building Knowledge Graph...",
  "Connecting Enterprise Assets...",
  "Preparing AI Workspace...",
  "Calibrating Neural Pathways...",
  "System Ready.",
];

interface Props {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: Props) {
  const [progress, setProgress] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [fading, setFading] = useState(false);
  const doneRef = useRef(false);

  /* progress bar: reaches 100% in ~2200ms */
  useEffect(() => {
    const start = performance.now();
    const DURATION = 2200;
    let raf: number;
    const tick = (now: number) => {
      const pct = Math.min(((now - start) / DURATION) * 100, 100);
      setProgress(pct);
      if (pct < 100) {
        raf = requestAnimationFrame(tick);
      } else if (!doneRef.current) {
        doneRef.current = true;
        setFading(true);
        setTimeout(onComplete, 500);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  /* rotate loading messages every 350ms */
  useEffect(() => {
    const iv = setInterval(() => {
      setMsgIdx(i => (i + 1) % MESSAGES.length);
    }, 350);
    return () => clearInterval(iv);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{
        background: "#F5F7FA",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.5s ease",
        pointerEvents: fading ? "none" : "all",
      }}
    >
      {/* ── Animated blueprint background ── */}
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.55 }}>
        <defs>
          <pattern id="sp-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(37,99,235,0.07)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sp-grid)" />

        {/* Animated network nodes */}
        {[
          { cx: "15%",  cy: "20%",  r: 3.5, color: "#2563EB", delay: "0s"    },
          { cx: "85%",  cy: "15%",  r: 4,   color: "#60A5FA", delay: "0.4s"  },
          { cx: "70%",  cy: "75%",  r: 3,   color: "#2563EB", delay: "0.8s"  },
          { cx: "25%",  cy: "80%",  r: 4.5, color: "#60A5FA", delay: "0.2s"  },
          { cx: "50%",  cy: "30%",  r: 3,   color: "#2563EB", delay: "0.6s"  },
          { cx: "10%",  cy: "55%",  r: 3.5, color: "#60A5FA", delay: "1s"    },
          { cx: "90%",  cy: "50%",  r: 4,   color: "#2563EB", delay: "0.3s"  },
          { cx: "40%",  cy: "90%",  r: 3,   color: "#60A5FA", delay: "0.7s"  },
        ].map((n, i) => (
          <circle
            key={i}
            cx={n.cx} cy={n.cy} r={n.r}
            fill={n.color}
            style={{ animation: `im-pulse-glow 2.5s ease-in-out ${n.delay} infinite`, opacity: 0.6 }}
          />
        ))}

        {/* Connection lines */}
        {[
          { x1: "15%", y1: "20%", x2: "50%", y2: "30%" },
          { x1: "50%", y1: "30%", x2: "85%", y2: "15%" },
          { x1: "85%", y1: "15%", x2: "90%", y2: "50%" },
          { x1: "90%", y1: "50%", x2: "70%", y2: "75%" },
          { x1: "70%", y1: "75%", x2: "40%", y2: "90%" },
          { x1: "40%", y1: "90%", x2: "25%", y2: "80%" },
          { x1: "25%", y1: "80%", x2: "10%", y2: "55%" },
          { x1: "10%", y1: "55%", x2: "15%", y2: "20%" },
          { x1: "50%", y1: "30%", x2: "70%", y2: "75%" },
        ].map((l, i) => (
          <line
            key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="rgba(37,99,235,0.12)"
            strokeWidth="1"
            strokeDasharray="4 6"
            style={{ animation: `im-dash 3s linear ${i * 0.3}s infinite` }}
          />
        ))}

        {/* Floating small particles */}
        {[
          { cx: "32%", cy: "45%", delay: "0s"    },
          { cx: "62%", cy: "55%", delay: "0.5s"  },
          { cx: "78%", cy: "38%", delay: "1s"    },
          { cx: "20%", cy: "65%", delay: "1.5s"  },
          { cx: "55%", cy: "70%", delay: "0.8s"  },
        ].map((p, i) => (
          <circle
            key={`p-${i}`}
            cx={p.cx} cy={p.cy} r="2"
            fill="#2563EB"
            style={{ animation: `im-float 4s ease-in-out ${p.delay} infinite`, opacity: 0.3 }}
          />
        ))}
      </svg>

      {/* ── Center content ── */}
      <div className="relative z-10 flex flex-col items-center gap-6">

        {/* Logo */}
        <div
          className="im-scale-in im-pulse-glow"
          style={{
            width: 72, height: 72, borderRadius: 20,
            background: "linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 32px rgba(37,99,235,0.25)",
          }}
        >
          <Brain className="w-9 h-9 text-white" style={{ animation: "im-float 3s ease-in-out infinite" }} />
        </div>

        {/* Brand text */}
        <div className="im-fade-in im-delay-200 text-center">
          <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">IndusMind AI</h1>
          <p className="text-xs font-bold text-[#2563EB] uppercase tracking-widest mt-0.5">
            Industrial Knowledge Intelligence
          </p>
        </div>

        {/* Rotating status message */}
        <div
          className="im-fade-in im-delay-300"
          style={{ minHeight: 20, display: "flex", alignItems: "center" }}
        >
          <p
            key={msgIdx}
            className="text-[11px] font-semibold text-[#64748B]"
            style={{ animation: "im-fade-in 0.3s ease both" }}
          >
            {MESSAGES[msgIdx]}
          </p>
        </div>

        {/* Progress bar */}
        <div
          className="im-fade-in im-delay-400"
          style={{ width: 260, height: 4, background: "#E2E8F0", borderRadius: 99, overflow: "hidden" }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #2563EB, #60A5FA)",
              borderRadius: 99,
              transition: "width 0.08s linear",
            }}
          />
        </div>

        {/* Percentage */}
        <p className="im-fade-in im-delay-500 text-[10px] font-bold text-[#94A3B8]">
          {Math.round(progress)}%
        </p>
      </div>
    </div>
  );
}
