"use client";

import { useEffect, useState } from "react";
import { listReports, generateReport, getReportDownloadUrl, type ReportRecord } from "@/lib/api";
import { BarChart3, Plus, Download, Loader2, FileText, X } from "lucide-react";

const REPORT_TYPES = [
  { value: "RCA",         label: "Root Cause Analysis",    color: "#DC2626" },
  { value: "COMPLIANCE",  label: "Compliance Audit",       color: "#2563EB" },
  { value: "MAINTENANCE", label: "Maintenance Report",     color: "#16A34A" },
  { value: "INSPECTION",  label: "Inspection Summary",     color: "#F59E0B" },
  { value: "EXECUTIVE",   label: "Executive Summary",      color: "#7C3AED" },
];

const TYPE_COLORS: Record<string, string> = {
  RCA: "#DC2626", COMPLIANCE: "#2563EB", MAINTENANCE: "#16A34A", INSPECTION: "#F59E0B", EXECUTIVE: "#7C3AED",
};

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("RCA");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listReports()
      .then(setReports)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load reports"))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    if (!newTitle.trim()) return;
    setGenerating(true);
    setError("");
    try {
      const report = await generateReport(newTitle, newType);
      setReports(r => [report, ...r]);
      setShowModal(false);
      setNewTitle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const counts = REPORT_TYPES.map(t => ({
    ...t,
    count: reports.filter(r => r.report_type === t.value).length,
  }));

  return (
    <div className="p-6 md:p-8 space-y-6 bg-[#FAFAF8]">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-500">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Reports &amp; Analytics</h1>
          </div>
          <p className="text-xs text-[#64748B] font-semibold ml-11">
            Export and compile auto-generated compliance certificates, Root Cause Analysis, and maintenance checklists.
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-750 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer transition-colors">
          <Plus className="w-4 h-4" /> Generate Report
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {counts.map(c => (
          <div key={c.value} className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
            <p className="text-2xl font-extrabold mb-0.5" style={{ color: c.color }}>{c.count}</p>
            <p className="text-xs text-[#64748B] font-bold">{c.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="px-4 py-3 border border-red-200 bg-red-50 rounded-xl text-xs text-red-750 font-bold">
          {error}
        </div>
      )}

      {/* Report list */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">Generated System Reports</h2>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />)}
          </div>
        ) : reports.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-8 h-8 mx-auto mb-3 text-[#94A3B8]" />
            <p className="text-xs font-bold text-[#64748B]">No reports generated yet.</p>
            <p className="text-[10px] text-[#94A3B8] mt-1 font-semibold">Click &ldquo;Generate Report&rdquo; to build a new PDF document dossier.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0]">
            {reports.map(r => {
              const color = TYPE_COLORS[r.report_type] ?? "#64748B";
              return (
                <div key={r.id} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-[#F8FAFC] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}10`, border: `1.5px solid ${color}20` }}>
                      <FileText className="w-4 h-4" style={{ color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#0F172A] truncate">{r.title}</p>
                      <p className="text-[10px] text-[#64748B] font-semibold mt-0.5">
                        {r.report_type} · {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${color}10`, color }}>
                      {r.report_type}
                    </span>
                    {r.id && (
                      <a href={getReportDownloadUrl(r.id)} target="_blank" rel="noopener noreferrer"
                        className="text-[#64748B] hover:text-[#0F172A] p-1.5 border border-[#E2E8F0] hover:bg-[#F1F5F9] rounded-lg transition-colors cursor-pointer">
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Generate modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 w-full max-w-md shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#0F172A]">Generate New Document</h2>
              <button onClick={() => setShowModal(false)} className="text-[#64748B] hover:text-[#0F172A] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#64748B] mb-1.5">Report Title</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g. Failure Investigation – Compressor C-12"
                  className="w-full px-3.5 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none focus:border-blue-500 bg-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#64748B] mb-1.5">Select Report Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {REPORT_TYPES.map(t => (
                    <button key={t.value} onClick={() => setNewType(t.value)}
                      className="px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer text-left"
                      style={newType === t.value
                        ? { background: `${t.color}10`, borderColor: t.color, color: t.color }
                        : { background: "#F8FAFC", borderColor: "#E2E8F0", color: "#64748B" }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleGenerate} disabled={!newTitle.trim() || generating}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-750 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {generating ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Compiling PDF...</span> : "Generate PDF Report →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
