"use client";

import { useEffect, useState } from "react";
import { Brain } from "lucide-react";

const HIERARCHY = [
  { label: "Facility",    color: "#2563EB", icon: "🏭" },
  { label: "Unit",        color: "#3B82F6", icon: "⚙️" },
  { label: "System",      color: "#60A5FA", icon: "🔧" },
  { label: "Equipment",   color: "#0EA5E9", icon: "🛠️" },
  { label: "Documents",   color: "#06B6D4", icon: "📄" },
  { label: "Maintenance", color: "#10B981", icon: "🔩" },
  { label: "Failures",    color: "#F59E0B", icon: "⚠️" },
  { label: "Inspection",  color: "#8B5CF6", icon: "🔍" },
  { label: "Engineers",   color: "#EC4899", icon: "👷" },
];

export default function GraphLoader() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const STEP_MS = 110;
    HIERARCHY.forEach((_, i) => {
      setTimeout(() => {
        setVisibleCount(i + 1);
        if (i === HIERARCHY.length - 1) {
          setTimeout(() => setReady(true), 200);
        }
      }, i * STEP_MS);
    });
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ minHeight: 420, gap: 0, userSelect: "none" }}
    >
      {/* Brain logo */}
      <div
        className="im-pulse-glow mb-6"
        style={{
          width: 52, height: 52, borderRadius: 16,
          background: "linear-gradient(135deg,#2563EB,#3B82F6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 20px rgba(37,99,235,0.25)",
        }}
      >
        <Brain className="w-7 h-7 text-white" style={{ animation: "im-float 2.5s ease-in-out infinite" }} />
      </div>

      {/* Node hierarchy */}
      <div className="flex flex-col items-center gap-0">
        {HIERARCHY.map((node, i) => (
          <div key={node.label} className="flex flex-col items-center">
            {/* Connector line from previous node */}
            {i > 0 && visibleCount > i && (
              <div
                style={{
                  width: 2, height: 20,
                  background: `linear-gradient(to bottom, ${HIERARCHY[i-1].color}60, ${node.color}60)`,
                  animation: "im-fade-in 0.2s ease both",
                }}
              />
            )}
            {/* Node pill */}
            {visibleCount > i && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 16px", borderRadius: 99,
                  border: `1.5px solid ${node.color}30`,
                  background: `${node.color}08`,
                  animation: "im-node-appear 0.25s cubic-bezier(0.34,1.56,0.64,1) both",
                }}
              >
                <span style={{ fontSize: 13 }}>{node.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: node.color }}>{node.label}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ready badge */}
      {ready && (
        <div
          className="mt-5 px-5 py-2 rounded-full text-[11px] font-bold text-white"
          style={{
            background: "linear-gradient(90deg,#2563EB,#3B82F6)",
            animation: "im-scale-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both",
            boxShadow: "0 4px 16px rgba(37,99,235,0.3)",
          }}
        >
          ✦ Knowledge Graph Ready
        </div>
      )}

      <p className="mt-4 text-[10px] font-semibold text-[#94A3B8]">
        Building industrial asset hierarchy…
      </p>
    </div>
  );
}
