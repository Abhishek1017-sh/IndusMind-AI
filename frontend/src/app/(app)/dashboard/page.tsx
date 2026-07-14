"use client";

import { useEffect, useState, useCallback } from "react";
import { listDocuments, type DocumentRecord } from "@/lib/api";
import {
  FileText, AlertTriangle, CheckCircle2, Clock, Upload, QrCode, RefreshCw
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { SkeletonStatBar, SkeletonTable } from "@/components/loaders/SkeletonLoader";

interface StatCard {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  sub?: string;
}

function StatTile({ label, value, icon: Icon, color, sub }: StatCard) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 transition-all relative overflow-hidden flex-1 actionable-card">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-extrabold text-[#0F172A] tracking-tight">{value}</p>
      <p className="text-xs text-[#64748B] font-bold mt-1">{label}</p>
      {sub && <p className="text-[10px] text-[#94A3B8] font-bold mt-1">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: DocumentRecord["status"] }) {
  const cfg = {
    COMPLETED:  { icon: CheckCircle2, color: "#16A34A", bg: "#DCFCE7",  label: "Indexed"    },
    PROCESSING: { icon: Clock,        color: "#D97706", bg: "#FEF3C7",  label: "Processing" },
    PENDING:    { icon: Clock,        color: "#2563EB", bg: "#DBEAFE",  label: "Pending"    },
    FAILED:     { icon: AlertTriangle,color: "#DC2626", bg: "#FEE2E2",   label: "Failed"     },
  };
  const { icon: Icon, color, bg, label } = cfg[status] ?? cfg.PENDING;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: bg, color }}>
      <Icon className="w-3 h-3" />{label}
    </span>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQrSim, setShowQrSim] = useState(false);
  const [qrScanning, setQrScanning] = useState(false);

  const fetchDocs = useCallback(async () => {
    try {
      const data = await listDocuments();
      setDocs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const completed = docs.filter(d => d.status === "COMPLETED").length;
  const processing = docs.filter(d => d.status === "PROCESSING" || d.status === "PENDING").length;
  const failed = docs.filter(d => d.status === "FAILED").length;
  const indexedPct = docs.length ? Math.round((completed / docs.length) * 100) : 0;

  const stats: StatCard[] = [
    { label: "Documents Uploaded", value: docs.length, icon: FileText, color: "#2563EB" },
    { label: "Indexed & Searchable", value: completed, icon: CheckCircle2, color: "#16A34A", sub: docs.length ? `${indexedPct}% of uploads` : undefined },
    { label: "Processing", value: processing, icon: Clock, color: "#F59E0B" },
    { label: "Failed", value: failed, icon: AlertTriangle, color: "#DC2626" },
  ];

  const recentDocs: DocumentRecord[] = docs.slice(0, 5);

  const suggestedQueries = [
    "What documents have I uploaded?",
    "Summarize my most recent upload",
    "What are the key details in my documents?",
  ];

  const handleSimulateQr = () => {
    setQrScanning(true);
    setTimeout(() => {
      setQrScanning(false);
      setShowQrSim(false);
      router.push(`/chat?q=${encodeURIComponent("What documents do I have for this asset?")}`);
    }, 2200);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 bg-[#FAFAF8]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
            <span className="text-[10px] text-[#16A34A] font-extrabold uppercase tracking-wider">Document Intelligence Platform — Active</span>
          </div>
          <h1 className="text-3xl font-extrabold text-[#0F172A] tracking-tight">
            Welcome back,{" "}
            <span className="text-blue-600">
              {user?.name?.split(" ")[0] ?? "System"}
            </span>
          </h1>
          <p className="text-[#64748B] text-xs font-semibold mt-1">Unified operations intelligence console and multi-agent hub.</p>
        </div>
        
        {/* QR Simulation Button */}
        <button onClick={() => setShowQrSim(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all bg-gradient-to-br from-blue-600 to-blue-500 hover:opacity-90 shadow-sm cursor-pointer border-0">
          <QrCode className="w-4 h-4" /> Asset QR Scan
        </button>
      </div>

      {/* Stats grid (4 cards) */}
      {loading ? (
        <SkeletonStatBar count={4} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => <StatTile key={s.label} {...s} />)}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Recent uploads */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">Operations Feed</h2>
            <Link href="/documents" className="text-xs text-blue-600 hover:underline font-bold">View all documents →</Link>
          </div>
          {loading ? (
            <SkeletonTable rows={4} />
          ) : recentDocs.length === 0 ? (
            <p className="text-xs text-[#64748B] py-4 text-center">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {recentDocs.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-3 border border-[#E2E8F0] rounded-xl bg-[#F8FAFC] transition-all actionable-card">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#0F172A] truncate">{doc.filename}</p>
                      <p className="text-[10px] text-[#64748B] font-semibold mt-0.5">
                        {(doc.file_size / 1024).toFixed(0)} KB • {doc.file_type.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={doc.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick queries */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">Quick AI Query Shortcuts</h2>
            <Link href="/chat" className="text-xs text-blue-600 hover:underline font-bold">Open Chat →</Link>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {suggestedQueries.map(q => (
              <Link key={q} href={`/chat?q=${encodeURIComponent(q)}`}
                className="flex items-center gap-3 px-3 py-3 border border-[#E2E8F0] rounded-xl text-xs text-[#64748B] hover:text-[#0F172A] bg-[#F8FAFC] transition-all font-bold group cursor-pointer actionable-card">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50 flex-shrink-0 group-hover:bg-blue-600 transition-colors" />
                {q}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Upload CTA */}
      <Link href="/documents"
        className="flex items-center gap-4 p-5 rounded-2xl border border-[#E2E8F0] transition-all group bg-white cursor-pointer shadow-sm actionable-card">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50 border border-blue-100">
          <Upload className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold text-[#0F172A]">Upload New Documents</p>
          <p className="text-[10px] text-[#64748B] font-semibold mt-0.5">Add PDFs, SOPs, maintenance records, inspection reports or Excel logs</p>
        </div>
        <span className="text-blue-600 group-hover:translate-x-1 transition-transform font-bold">→</span>
      </Link>

      {/* QR Code Scan Simulator Modal */}
      {showQrSim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 w-full max-w-sm text-center shadow-lg im-scale-in">
            <h2 className="text-lg font-bold text-[#0F172A] mb-1">Asset QR Scan Simulator</h2>
            <p className="text-xs text-[#64748B] mb-5">Align plant scanner tag or simulate quick database check.</p>

            <div className="w-48 h-48 mx-auto mb-5 relative rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-center overflow-hidden">
              {qrScanning ? (
                <>
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-blue-600 shadow-[0_0_15px_#2563EB] animate-bounce" style={{ animationDuration: "1.6s" }} />
                  <QrCode className="w-20 h-20 text-blue-600 opacity-60 animate-pulse" />
                </>
              ) : (
                <div className="text-center">
                  <QrCode className="w-12 h-12 text-[#94A3B8] mx-auto mb-2" />
                  <p className="text-[10px] text-[#64748B] font-semibold">Simulated tag reader standby</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-center">
              <button onClick={() => setShowQrSim(false)} className="px-4 py-2 border border-[#E2E8F0] rounded-xl text-xs font-bold hover:bg-[#F1F5F9] cursor-pointer">
                Cancel
              </button>
              <button onClick={handleSimulateQr} disabled={qrScanning} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer">
                {qrScanning ? "Reading tag..." : "Simulate Scanner Check"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
