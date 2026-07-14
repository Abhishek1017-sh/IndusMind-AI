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
  const [generationStep, setGenerationStep] = useState(0);
  const [stepText, setStepText] = useState("");
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
    setGenerationStep(1);
    setStepText("Reading knowledge graph...");
    setError("");

    // Simulate 3-step compilation flow
    const stepTimer = new Promise<void>((resolve) => {
      setTimeout(() => {
        setGenerationStep(2);
        setStepText("Structuring executive summary...");
        setTimeout(() => {
          setGenerationStep(3);
          setStepText("Formatting PDF download...");
          setTimeout(() => {
            resolve();
          }, 1200);
        }, 1200);
      }, 1200);
    });

    try {
      const [report] = await Promise.all([
        generateReport(newTitle, newType),
        stepTimer
      ]);
      setReports(r => [report, ...r]);
      setShowModal(false);
      setNewTitle("");
      setGenerationStep(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
      setGenerationStep(0);
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
          <div key={c.value} className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm transition-all actionable-card">
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
          <div className="relative p-12 text-center overflow-hidden min-h-[280px] flex flex-col items-center justify-center bg-white">
            {/* Background mockup outline of a multi-page document */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.06] select-none scale-110">
              <div className="relative w-44 h-56 border-2 border-dashed border-[#64748B] rounded-lg rotate-[-6deg] translate-x-[-15px] bg-slate-100 flex flex-col p-4 gap-2">
                <div className="w-1/2 h-3 bg-[#64748B] rounded" />
                <div className="w-full h-2 bg-[#64748B]/60 rounded" />
                <div className="w-5/6 h-2 bg-[#64748B]/60 rounded" />
                <div className="w-full h-2 bg-[#64748B]/60 rounded" />
              </div>
              <div className="absolute w-44 h-56 border-2 border-dashed border-[#64748B] rounded-lg rotate-[4deg] translate-x-[15px] translate-y-[6px] bg-white flex flex-col p-4 gap-2 shadow-sm">
                <div className="w-2/3 h-3 bg-[#64748B] rounded" />
                <div className="w-full h-2 bg-[#64748B]/60 rounded" />
                <div className="w-full h-2 bg-[#64748B]/60 rounded" />
                <div className="w-4/5 h-2 bg-[#64748B]/60 rounded" />
              </div>
            </div>

            {/* Main Illustration */}
            <div className="relative z-10 space-y-3">
              <div className="w-12 h-12 mx-auto bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center shadow-sm">
                <FileText className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-xs font-bold text-[#64748B]">No reports generated yet.</p>
                <p className="text-[10px] text-[#94A3B8] mt-1 font-semibold max-w-[280px] mx-auto leading-relaxed">
                  Click &ldquo;Generate Report&rdquo; to build a new PDF document dossier.
                </p>
              </div>
            </div>
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
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 w-full max-w-md shadow-lg space-y-4 im-scale-in">
            {generationStep > 0 ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-4 animate-fade-in">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 border-r-blue-600/30 border-b-blue-600/10 border-l-blue-600/30 animate-spin" />
                  <FileText className="w-6 h-6 text-blue-600 animate-pulse" />
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-sm font-extrabold text-[#0F172A] tracking-tight">{stepText}</p>
                  <p className="text-[10px] text-[#64748B] font-semibold">Step {generationStep} of 3</p>
                </div>
                <div className="flex gap-1.5 justify-center">
                  <div className={`w-2 h-2 rounded-full transition-all duration-300 ${generationStep >= 1 ? "bg-blue-600 scale-110" : "bg-slate-200"}`} />
                  <div className={`w-2 h-2 rounded-full transition-all duration-300 ${generationStep >= 2 ? "bg-blue-600 scale-110" : "bg-slate-200"}`} />
                  <div className={`w-2 h-2 rounded-full transition-all duration-300 ${generationStep >= 3 ? "bg-blue-600 scale-110" : "bg-slate-200"}`} />
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-[#0F172A]">Generate New Document</h2>
                  <button onClick={() => setShowModal(false)} className="text-[#64748B] hover:text-[#0F172A] cursor-pointer bg-transparent border-0">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#64748B] mb-1.5">Report Title</label>
                    <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                      placeholder="e.g. Failure Investigation – Compressor C-12"
                      className="w-full px-3.5 py-2 text-xs text-[#0F172A] border border-[#E2E8F0] rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-white transition-all custom-input" />
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
                    Generate PDF Report →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
