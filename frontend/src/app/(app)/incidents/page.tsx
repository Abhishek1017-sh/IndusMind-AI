"use client";

import { useState } from "react";
import { AlertTriangle, Clock, ShieldAlert, Sparkles, Network, ArrowRight, HelpCircle, CheckCircle2, ChevronRight } from "lucide-react";

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState([
    { id: "INC-2026-089", title: "Bearing Vibration Exceeded Critical Limit", asset: "Pump P-101", date: "July 10, 2026", status: "Mitigated", priority: "High", risk: "Medium" },
    { id: "INC-2026-085", title: "Pressure Spike in Main Gas Exchanger Line", asset: "Exchanger E-201", date: "July 08, 2026", status: "Under Review", priority: "Critical", risk: "High" },
    { id: "INC-2026-079", title: "Minor Coolant Leak Detected", asset: "Boiler B-02", date: "July 02, 2026", status: "Resolved", priority: "Low", risk: "Low" },
    { id: "INC-2026-071", title: "Feedwater Pump Flow Instability", asset: "Pump P-102", date: "June 25, 2026", status: "Resolved", priority: "Medium", risk: "Medium" }
  ]);

  const [activeTab, setActiveTab] = useState<"active" | "history">("active");

  const incidentPatterns = [
    { title: "Pump Failure Pattern #4", desc: "Co-occurrence of bearing seal wear with raw material inlet impurity surges", confidence: "94%" },
    { title: "Boiler Safety Override", desc: "Coolant valve minor leak frequently preceded by thermal loop variations", confidence: "87%" },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 bg-[#F8FAFC]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-red-600 to-red-500">
              <ShieldAlert className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Incident Intelligence</h1>
          </div>
          <p className="text-xs text-[#64748B] font-semibold mt-1 ml-11">
            Realtime near misses, historical safety audits, pattern logs, and proactive recommendations.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[#F1F5F9] p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("active")}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
            style={activeTab === "active" ? { background: "#FFFFFF", color: "#0F172A", boxShadow: "0 2px 4px rgba(15,23,42,0.05)" } : { color: "#64748B" }}
          >
            Live Logs
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
            style={activeTab === "history" ? { background: "#FFFFFF", color: "#0F172A", boxShadow: "0 2px 4px rgba(15,23,42,0.05)" } : { color: "#64748B" }}
          >
            Resolution Archive
          </button>
        </div>
      </div>

      {/* Grid panels */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Columns - Incident registry table */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">Reported Near Misses &amp; Safety Events</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[10px] font-bold text-[#94A3B8] uppercase">
                    <th className="pb-3 pr-2">Event ID</th>
                    <th className="pb-3 pr-2">Description</th>
                    <th className="pb-3 pr-2">Asset Tag</th>
                    <th className="pb-3 pr-2">Reported Date</th>
                    <th className="pb-3 pr-2">Risk</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {incidents.map(inc => (
                    <tr key={inc.id} className="text-xs text-[#0F172A] hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3.5 font-bold text-blue-600">{inc.id}</td>
                      <td className="py-3.5 pr-2 font-bold">{inc.title}</td>
                      <td className="py-3.5 font-mono text-slate-500 font-semibold">{inc.asset}</td>
                      <td className="py-3.5 font-medium text-[#64748B]">{inc.date}</td>
                      <td className="py-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          inc.risk === "High" ? "bg-red-100 text-red-700" :
                          inc.risk === "Medium" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {inc.risk}
                        </span>
                      </td>
                      <td className="py-3.5 font-bold">{inc.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Incident root cause graph visual */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] flex items-center gap-1.5">
              <Network className="w-4 h-4 text-purple-600" /> Root Cause Network Preview
            </h3>
            <div className="relative h-48 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 opacity-20">
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="20%" cy="50%" r="5" fill="#2563EB" />
                  <circle cx="45%" cy="30%" r="6" fill="#F59E0B" />
                  <circle cx="45%" cy="70%" r="6" fill="#DC2626" />
                  <circle cx="75%" cy="50%" r="5" fill="#16A34A" />
                  <line x1="20%" y1="50%" x2="45%" y2="30%" stroke="#64748B" strokeWidth="1.5" strokeDasharray="3 3" />
                  <line x1="20%" y1="50%" x2="45%" y2="70%" stroke="#64748B" strokeWidth="1.5" strokeDasharray="3 3" />
                  <line x1="45%" y1="30%" x2="75%" y2="50%" stroke="#64748B" strokeWidth="1.5" />
                  <line x1="45%" y1="70%" x2="75%" y2="50%" stroke="#64748B" strokeWidth="1.5" />
                </svg>
              </div>
              <div className="text-center space-y-1 relative z-10 p-4">
                <p className="text-xs font-bold text-[#0F172A]">Failure Loop: Jamnagar Refinery - Sector 4</p>
                <p className="text-[10px] text-[#64748B] font-semibold leading-relaxed">
                  Nodes: Impurity Surge (Trigger) → Lubrication Wear (Vibration Shift) → Pump P-101 (Bearing Defect)
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Recommendations & Failure Patterns */}
        <div className="space-y-6">
          {/* AI recommendations */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-600" /> Proactive Mitigation SOPs
            </h3>
            <div className="space-y-3">
              <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-xl space-y-1">
                <p className="text-xs font-bold text-blue-800">1. Inlet Filtration Auditing</p>
                <p className="text-[11px] text-slate-700 leading-relaxed font-semibold">Install dual safety strainer units prior to Pump P-101. Estimated reliability extension: 420 hrs.</p>
              </div>
              <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl space-y-1">
                <p className="text-xs font-bold text-emerald-800">2. Vibration Telemetry Thresholds</p>
                <p className="text-[11px] text-slate-700 leading-relaxed font-semibold">Re-calibrate automatic shutdown controls in Jamnagar refinery PLC loops to trigger alerts at 5.5 mm/s.</p>
              </div>
            </div>
          </div>

          {/* Failure pattern alerts */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#F59E0B]" /> Machine Failure Patterns
            </h3>
            <div className="space-y-3">
              {incidentPatterns.map((pat, i) => (
                <div key={pat.title} className="p-3 border border-[#E2E8F0] rounded-xl space-y-2 hover:bg-[#F8FAFC] transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#0F172A]">{pat.title}</span>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{pat.confidence} Match</span>
                  </div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed font-semibold">{pat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
