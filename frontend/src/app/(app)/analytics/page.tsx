"use client";

import { useState } from "react";
import { BarChart3, LineChart, TrendingUp, DollarSign, Clock, ShieldCheck, Cpu, ArrowUpRight, Calendar } from "lucide-react";

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState("30d");

  const highlightMetrics = [
    { label: "Operational Downtime Saved", value: "142.5 hrs", desc: "Equivalent to $310k in overheads", icon: Clock, color: "#2563EB" },
    { label: "Estimated Maintenance Savings", value: "$241,800", desc: "Through early fail prediction", icon: DollarSign, color: "#16A34A" },
    { label: "Average Reliability Index", value: "98.9%", desc: "+1.2% year-on-year shift", icon: Cpu, color: "#06B6D4" },
    { label: "Checklist Deviations Caught", value: "89", desc: "PESO / OISD audits passed", icon: ShieldCheck, color: "#F59E0B" }
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 bg-[#F8FAFC]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-500">
              <LineChart className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">System Analytics</h1>
          </div>
          <p className="text-xs text-[#64748B] font-semibold mt-1 ml-11">
            Plant reliability statistics, MTBF optimization trends, and knowledge asset growth.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={timeRange} onChange={e => setTimeRange(e.target.value)}
            className="px-3.5 py-1.5 border border-[#E2E8F0] rounded-xl text-xs font-bold text-[#0F172A] bg-white outline-none cursor-pointer">
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
        </div>
      </div>

      {/* Highlights grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {highlightMetrics.map(m => (
          <div key={m.label} className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#64748B] uppercase">{m.label}</span>
              <m.icon className="w-4 h-4" style={{ color: m.color }} />
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-extrabold text-[#0F172A]">{m.value}</p>
              <span className="text-[10px] text-emerald-600 font-bold flex items-center"><TrendingUp className="w-3 h-3 mr-0.5" />+4.8%</span>
            </div>
            <p className="text-[10px] text-[#94A3B8] font-bold">{m.desc}</p>
          </div>
        ))}
      </div>

      {/* Main charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Knowledge Growth & Document Indexes */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">Knowledge Asset Integration Growth</h3>
            <span className="text-[10px] font-bold text-[#64748B]">Cumulative</span>
          </div>
          {/* Custom SVG Line Chart */}
          <div className="h-56 w-full relative flex items-end">
            <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Grid Lines */}
              <line x1="0" y1="50" x2="500" y2="50" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="0" y1="100" x2="500" y2="100" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="0" y1="150" x2="500" y2="150" stroke="#F1F5F9" strokeWidth="1" />
              {/* Chart Area */}
              <path d="M 0 180 L 100 150 L 200 130 L 300 90 L 400 60 L 500 40 L 500 200 L 0 200 Z" fill="url(#chartGrad)" />
              {/* Chart Line */}
              <path d="M 0 180 L 100 150 L 200 130 L 300 90 L 400 60 L 500 40" fill="none" stroke="#2563EB" strokeWidth="3" />
              {/* Nodes */}
              <circle cx="100" cy="150" r="4" fill="#2563EB" />
              <circle cx="200" cy="130" r="4" fill="#2563EB" />
              <circle cx="300" cy="90" r="4" fill="#2563EB" />
              <circle cx="400" cy="60" r="4" fill="#2563EB" />
              <circle cx="500" cy="40" r="4" fill="#2563EB" />
            </svg>
            <div className="absolute left-2 top-2 text-[9px] font-bold text-[#64748B] space-y-1">
              <p>500 entities</p>
              <p>400 entities</p>
              <p>300 entities</p>
            </div>
          </div>
          <div className="flex justify-between text-[9px] font-bold text-[#94A3B8] uppercase">
            <span>Jan</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Apr</span>
            <span>May</span>
            <span>Jun</span>
          </div>
        </div>

        {/* Reliability Trend Heatmap/Bar chart */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">Downtime Hours Reduction Trend</h3>
            <span className="text-[10px] font-bold text-emerald-600 flex items-center"><TrendingUp className="w-3.5 h-3.5 mr-0.5" /> -12% Downtime</span>
          </div>
          {/* Custom SVG Bar Chart */}
          <div className="h-56 w-full relative flex items-end justify-between gap-4 px-2">
            <div className="flex flex-col items-center gap-2 w-full">
              <div className="bg-blue-200 border-t border-blue-500 rounded-md w-full" style={{ height: "140px" }} />
              <span className="text-[9px] font-bold text-[#64748B]">Wk 1</span>
            </div>
            <div className="flex flex-col items-center gap-2 w-full">
              <div className="bg-blue-300 border-t border-blue-600 rounded-md w-full" style={{ height: "110px" }} />
              <span className="text-[9px] font-bold text-[#64748B]">Wk 2</span>
            </div>
            <div className="flex flex-col items-center gap-2 w-full">
              <div className="bg-blue-400 border-t border-blue-600 rounded-md w-full" style={{ height: "85px" }} />
              <span className="text-[9px] font-bold text-[#64748B]">Wk 3</span>
            </div>
            <div className="flex flex-col items-center gap-2 w-full">
              <div className="bg-[#2563EB] border-t border-blue-700 rounded-md w-full" style={{ height: "50px" }} />
              <span className="text-[9px] font-bold text-[#64748B]">Wk 4</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
