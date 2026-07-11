"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchComplianceOverview, generateReport, getReportDownloadUrl,
  type ComplianceOverview,
} from "@/lib/api";
import {
  ShieldCheck, Loader2, CheckCircle2, XCircle, Download, AlertTriangle,
  ShieldAlert, FileWarning, RefreshCw, FileText,
} from "lucide-react";
import ComplianceLoader from "@/components/loaders/ComplianceLoader";

const RISK_COLORS: Record<string, string> = {
  Low: "#16A34A", Medium: "#F59E0B", High: "#F97316", Critical: "#DC2626", Unknown: "#64748B",
};

export default function CompliancePage() {
  const [overview, setOverview] = useState<ComplianceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchComplianceOverview()
      .then(setOverview)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const downloadReport = async () => {
    setGenerating(true);
    try {
      const r = await generateReport("Compliance Audit", "COMPLIANCE");
      window.open(getReportDownloadUrl(r.id), "_blank");
    } catch (e) { console.error(e); }
    finally { setGenerating(false); }
  };

  const score = overview?.compliance_score ?? 0;
  const scoreColor = !overview?.has_data ? "#64748B" : score >= 90 ? "#16A34A" : score >= 70 ? "#F59E0B" : "#DC2626";
  const riskColor = RISK_COLORS[overview?.risk_level ?? "Unknown"];

  return (
    <div className="p-6 md:p-8 space-y-6 bg-[#FAFAF8]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-500">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Compliance Intelligence</h1>
          </div>
          <p className="text-xs text-[#64748B] font-semibold ml-11">
            Realtime compliance assessment evaluated against Factory Acts, OISD standards, PESO, and ISO directives.
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] hover:bg-[#F1F5F9] rounded-xl text-xs font-bold text-[#0F172A] bg-white transition-all cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Audit
        </button>
      </div>

      {loading ? (
        <ComplianceLoader />
      ) : !overview?.has_data ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center shadow-sm">
          <FileWarning className="w-8 h-8 mx-auto mb-3 text-[#94A3B8]" />
          <p className="text-xs font-bold text-[#64748B]">No Compliance Data Indexed</p>
          <p className="text-xs text-[#94A3B8] mt-1">{overview?.message}</p>
          {overview && overview.missing_documents.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {overview.missing_documents.map(m => (
                <span key={m} className="px-3 py-1 rounded-full text-xs text-[#64748B] font-semibold border bg-white border-[#E2E8F0]">{m}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left: main results */}
          <div className="xl:col-span-2 space-y-6">
            
            {/* Score + risk card */}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-6 flex-wrap">
                <div className="relative flex-shrink-0">
                  <svg width="90" height="90" viewBox="0 0 90 90">
                    <circle cx="45" cy="45" r="38" fill="none" stroke="#F1F5F9" strokeWidth="8" />
                    <circle cx="45" cy="45" r="38" fill="none" stroke={scoreColor} strokeWidth="8"
                      strokeDasharray={`${score * 2.389} 238.9`} strokeLinecap="round" transform="rotate(-90 45 45)" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-extrabold" style={{ color: scoreColor }}>{score}%</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-extrabold text-[#0F172A]">Compliance Rating</h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1" style={{ background: `${riskColor}10`, color: riskColor, border: `1px solid ${riskColor}30` }}>
                      <ShieldAlert className="w-3.5 h-3.5" /> {overview.risk_level} Risk
                    </span>
                  </div>
                  <p className="text-xs text-[#64748B] font-semibold mb-3">{overview.summary}</p>
                  <div className="flex gap-4 flex-wrap">
                    <span className="flex items-center gap-1.5 text-xs text-[#16A34A] font-bold"><CheckCircle2 className="w-3.5 h-3.5" />{overview.passed_checks} Audits Passed</span>
                    <span className="flex items-center gap-1.5 text-xs text-[#DC2626] font-bold"><XCircle className="w-3.5 h-3.5" />{overview.failed_checks} Deviations Detected</span>
                  </div>
                </div>
                <button onClick={downloadReport} disabled={generating}
                  className="ml-auto flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] hover:bg-[#F1F5F9] text-[#0F172A] rounded-xl text-xs font-bold bg-white transition-all cursor-pointer">
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Export Audit PDF
                </button>
              </div>
            </div>

            {/* Checklist */}
            {overview.checklist.length > 0 && (
              <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-[#E2E8F0]">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">Audited Checklist</h2>
                </div>
                <div className="divide-y divide-[#E2E8F0]">
                  {overview.checklist.map((item, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-4 hover:bg-[#F8FAFC] transition-colors">
                      {item.status === "COMPLIANT" ? <CheckCircle2 className="w-4 h-4 text-[#16A34A] flex-shrink-0" /> : <XCircle className="w-4 h-4 text-[#DC2626] flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[#0F172A]">{item.parameter}</p>
                        {item.deviation && item.deviation !== "None" && <p className="text-[10px] text-[#DC2626] font-bold mt-0.5">{item.deviation}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] text-[#94A3B8] font-bold uppercase">Limit: <span className="text-[#64748B]">{item.sop_limit}</span></p>
                        <p className="text-xs font-bold" style={{ color: item.status === "COMPLIANT" ? "#16A34A" : "#DC2626" }}>Actual: {item.inspected_value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {overview.corrective_actions.length > 0 && (
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-2">
                  <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">AI Corrective Actions</h2>
                </div>
                <div className="space-y-2">
                  {overview.corrective_actions.map((action, i) => (
                    <div key={i} className="flex gap-2.5 p-3 rounded-lg border border-amber-100" style={{ background: "rgba(245,158,11,0.03)" }}>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-amber-700 bg-amber-100 flex-shrink-0" style={{ minWidth: "20px" }}>{i + 1}</span>
                      <p className="text-xs text-slate-700 leading-relaxed font-semibold">{action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detected compliance files */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-blue-600" /> Evidence Audit Base</p>
              <div className="space-y-2">
                {overview.detected_documents.map(d => (
                  <div key={d.id} className="p-2.5 rounded-lg border border-blue-100" style={{ background: "rgba(37,99,235,0.04)" }}>
                    <p className="text-xs font-bold text-blue-700 truncate hover:underline cursor-pointer">{d.filename}</p>
                    <p className="text-[9px] text-[#64748B] font-semibold mt-0.5">{d.category}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Missing document warnings */}
            {overview.missing_documents.length > 0 && (
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5"><FileWarning className="w-3.5 h-3.5 text-amber-600" /> Missing Audit Items</p>
                <div className="flex flex-wrap gap-1.5">
                  {overview.missing_documents.map(m => (
                    <span key={m} className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200 text-amber-700 bg-amber-50">{m}</span>
                  ))}
                </div>
                <p className="text-[10px] text-[#94A3B8] font-semibold mt-1">Uploading these certificates would stabilize compliance ratings.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
