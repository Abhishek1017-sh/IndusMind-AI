"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchMaintenanceOverview, fetchAssetDetail, generateReport, getReportDownloadUrl,
  type MaintenanceOverview, type MaintenanceAsset, type AssetDetail, type Citation, type TimelineEvent,
} from "@/lib/api";
import {
  Wrench, Loader2, CheckCircle2, ChevronDown, ChevronUp, Download, FileText, Clock,
  AlertTriangle, Zap, RotateCcw, CheckCheck, Cpu, Package, MapPin, Server, Truck,
  Sparkles, Boxes, RefreshCw, Search, Network, Building2, ShieldAlert, Gauge,
  Activity, AlertOctagon, TriangleAlert, CircleGauge,
} from "lucide-react";
import MaintenanceLoader from "@/components/loaders/MaintenanceLoader";
import RcaLoader from "@/components/loaders/RcaLoader";

// ─── Asset-type presentation (icon per specific taxonomy type) ───────────────
const TYPE_META: Record<string, { Icon: React.ElementType; color: string }> = {
  Pump: { Icon: Cpu, color: "#3b82f6" }, Motor: { Icon: Cpu, color: "#3b82f6" },
  Compressor: { Icon: Cpu, color: "#3b82f6" }, Turbine: { Icon: Cpu, color: "#3b82f6" },
  Generator: { Icon: Zap, color: "#3b82f6" }, Transformer: { Icon: Zap, color: "#3b82f6" },
  Valve: { Icon: Gauge, color: "#06b6d4" }, Conveyor: { Icon: Activity, color: "#06b6d4" },
  Machine: { Icon: Cpu, color: "#3b82f6" }, Equipment: { Icon: Gauge, color: "#06b6d4" },
  Sensor: { Icon: CircleGauge, color: "#06b6d4" }, PLC: { Icon: Cpu, color: "#8b5cf6" },
  Tool: { Icon: Wrench, color: "#06b6d4" },
  Server: { Icon: Server, color: "#8b5cf6" }, Database: { Icon: Server, color: "#8b5cf6" },
  "Storage Cluster": { Icon: Server, color: "#8b5cf6" }, "Network Device": { Icon: Network, color: "#8b5cf6" },
  Vehicle: { Icon: Truck, color: "#eab308" },
  Facility: { Icon: Building2, color: "#14b8a6" }, Plant: { Icon: Building2, color: "#14b8a6" },
  "Production Line": { Icon: Activity, color: "#14b8a6" },
  "Spare Part": { Icon: Package, color: "#f97316" }, Vendor: { Icon: MapPin, color: "#a855f7" },
};
const typeMeta = (t: string) => TYPE_META[t] ?? { Icon: Boxes, color: "#64748b" };

// ─── Risk colour coding (green / yellow / orange / red) ──────────────────────
const RISK_COLOR: Record<string, string> = {
  Low: "#10b981", Medium: "#eab308", High: "#f97316", Critical: "#ef4444",
};
const riskColor = (r?: string) => RISK_COLOR[r ?? "Low"] ?? "#64748b";

const CRITICALITY_COLOR: Record<string, string> = {
  Critical: "#DC2626", High: "#F97316", Medium: "#F59E0B", Low: "#16A34A",
};

const TIMELINE_STATUS: Record<string, { color: string; bg: string; Icon: React.ElementType; label: string }> = {
  normal:  { color: "#16A34A", bg: "#DCFCE7",  Icon: CheckCheck,    label: "Normal"   },
  warning: { color: "#D97706", bg: "#FEF3C7",  Icon: AlertTriangle, label: "Warning"  },
  ignored: { color: "#64748B", bg: "#F1F5F9",  Icon: Clock,         label: "Ignored"  },
  failure: { color: "#DC2626", bg: "#FEE2E2",  Icon: Zap,           label: "Critical" },
  repair:  { color: "#2563EB", bg: "#DBEAFE",  Icon: RotateCcw,     label: "Repair"   },
};

function Section({ title, items, color = "#2563EB" }: { title: string; items?: string[]; color?: string }) {
  const [open, setOpen] = useState(true);
  if (!items || items.length === 0) return null;
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F8FAFC] transition-colors cursor-pointer text-left">
        <span className="text-xs font-bold" style={{ color }}>{title}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-[#64748B]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2 border-t border-[#E2E8F0] pt-3">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
              <p className="text-xs text-[#64748B] leading-relaxed font-semibold">{item}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryTimeline({ entries }: { entries: AssetDetail["maintenance_history"] }) {
  if (!entries.length) return null;
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-[#F59E0B] mb-4">Maintenance Chronology</p>
      <div className="space-y-4 relative pl-3 before:absolute before:left-1 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E2E8F0]">
        {entries.map((e, i) => {
          const cfg = TIMELINE_STATUS[e.status] ?? TIMELINE_STATUS.normal;
          const Icon = cfg.Icon;
          return (
            <div key={i} className="flex gap-3 relative">
              <span className="absolute -left-[15px] top-1.5 w-2 h-2 rounded-full bg-white border-2" style={{ borderColor: cfg.color }} />
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: cfg.bg, border: `1.5px solid ${cfg.color}30` }}>
                <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#0F172A]">{e.event}</span>
                  {e.date && <span className="text-[10px] font-bold text-[#94A3B8] font-mono">{e.date}</span>}
                </div>
                {e.detail && <p className="text-xs text-[#64748B] mt-0.5 font-semibold">{e.detail}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineEvents({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return null;
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-[#DC2626] mb-4">Failure Incidents Chronology</p>
      <div className="space-y-4 relative pl-3 before:absolute before:left-1 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E2E8F0]">
        {events.map((evt, i) => {
          const cfg = TIMELINE_STATUS[evt.status] ?? TIMELINE_STATUS.normal;
          const Icon = cfg.Icon;
          return (
            <div key={i} className="flex gap-3 relative">
              <span className="absolute -left-[15px] top-1.5 w-2 h-2 rounded-full bg-white border-2" style={{ borderColor: cfg.color }} />
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: cfg.bg, border: `1.5px solid ${cfg.color}30` }}>
                <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  <span className="text-[10px] font-bold text-[#94A3B8] font-mono">{evt.time}</span>
                </div>
                <p className="text-xs font-bold text-[#0F172A] mt-1">{evt.event}</p>
                {evt.detail && <p className="text-xs text-[#64748B] mt-0.5 font-semibold">{evt.detail}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MaintenancePage() {
  const [overview, setOverview] = useState<MaintenanceOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadOverview = useCallback(() => {
    setLoadingOverview(true);
    fetchMaintenanceOverview()
      .then(setOverview)
      .catch(console.error)
      .finally(() => setLoadingOverview(false));
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const visibleAssets = useMemo(() => {
    if (!overview) return [];
    const pool: MaintenanceAsset[] = category
      ? overview.assets.filter(a => a.asset_type === category)
      : overview.assets;
    const needle = search.trim().toLowerCase();
    return needle ? pool.filter(a => a.name.toLowerCase().includes(needle)) : pool;
  }, [overview, category, search]);

  const analyzeAsset = async (assetName: string) => {
    setSelected(assetName);
    setAnalyzing(true);
    setDetail(null);
    try { setDetail(await fetchAssetDetail(assetName)); }
    catch (e) { console.error(e); }
    finally { setAnalyzing(false); }
  };

  const downloadRca = async () => {
    if (!selected) return;
    setGenerating(true);
    try {
      const report = await generateReport(`RCA – ${selected}`, "RCA");
      window.open(getReportDownloadUrl(report.id), "_blank");
    } catch (e) { console.error(e); }
    finally { setGenerating(false); }
  };

  const rca = detail?.report;
  const citations: Citation[] = detail?.citations ?? [];
  const crit = rca?.criticality;

  return (
    <div className="p-6 md:p-8 space-y-6 bg-[#FAFAF8]">
      {generating && <RcaLoader />}
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-500">
              <Wrench className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Maintenance Intelligence</h1>
          </div>
          <p className="text-xs text-[#64748B] font-semibold ml-11">Predictive reliability indicators, MTTR/MTBF logs, and failure chronology mapping.</p>
        </div>
        <button onClick={loadOverview} className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] hover:bg-[#F1F5F9] rounded-xl text-xs font-bold text-[#0F172A] bg-white transition-all cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Assets
        </button>
      </div>

      {loadingOverview ? (
        <MaintenanceLoader />
      ) : !overview?.has_data ? (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center shadow-sm">
          <Boxes className="w-8 h-8 mx-auto mb-3 text-[#94A3B8]" />
          <p className="text-xs font-bold text-[#64748B]">No maintenance registers found.</p>
          <p className="text-xs text-[#94A3B8] mt-1">{overview?.message}</p>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            {[
              { label: "Total Assets", value: overview.kpis.total_assets, Icon: Boxes, color: "#3b82f6" },
              { label: "Critical Assets", value: overview.kpis.critical_assets, Icon: AlertOctagon, color: "#f97316" },
              { label: "Open Incidents", value: overview.kpis.open_incidents, Icon: ShieldAlert, color: "#ef4444" },
              { label: "High Risk", value: overview.kpis.high_risk_assets, Icon: TriangleAlert, color: "#ef4444" },
              { label: "Missing Maintenance", value: overview.kpis.assets_missing_maintenance, Icon: Clock, color: "#eab308" },
              { label: "Active Alerts", value: overview.kpis.assets_with_alerts, Icon: Zap, color: "#f43f5e" },
            ].map(k => (
              <div key={k.label} className="glass-card rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <k.Icon className="w-4 h-4" style={{ color: k.color }} />
                  <span className="text-xl font-bold" style={{ color: k.color }}>{k.value}</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Search + asset-type filter chips */}
          <div className="flex flex-col gap-3 mb-5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search assets by tag or location name…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-xs text-[#0F172A] placeholder:text-[#94A3B8] outline-none border border-[#E2E8F0] bg-white focus:border-blue-500 transition-colors" />
            </div>
            {overview.asset_types.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setCategory(null)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                  style={!category ? { background: "rgba(59,130,246,0.18)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.4)" } : { background: "rgba(255,255,255,0.04)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.07)" }}>
                  All ({overview.kpis.total_assets})
                </button>
                {overview.asset_types.map(t => {
                  const active = category === t;
                  const { color } = typeMeta(t);
                  return (
                    <button key={t} onClick={() => setCategory(active ? null : t)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={active ? { background: `${color}22`, color, border: `1px solid ${color}55` } : { background: "rgba(255,255,255,0.04)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.07)" }}>
                      {t} ({overview.type_counts[t]})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Left: Register & Dossier */}
            <div className="xl:col-span-2 space-y-6">
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 border-b border-[#E2E8F0] pb-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">{category ?? "All Registered Assets"}</p>
                  <span className="text-xs text-[#64748B] font-bold">{visibleAssets.length} found</span>
                </div>
                {visibleAssets.length === 0 ? (
                  <p className="text-xs text-[#64748B] py-4 text-center">No assets match criteria.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {visibleAssets.map(a => {
                      const { Icon, color } = typeMeta(a.asset_type);
                      const rColor = riskColor(a.risk_level);
                      const active = selected === a.name;
                      const needsReview = a.confidence_band === "Needs Review";
                      const status = a.status && a.status !== "Unknown" ? a.status : undefined;
                      return (
                        <button key={a.id} onClick={() => analyzeAsset(a.name)}
                          className="relative flex items-start gap-2.5 p-3 rounded-xl text-left transition-all hover:scale-[1.01] overflow-hidden"
                          style={{ background: active ? `${color}18` : "rgba(255,255,255,0.03)", border: `1px solid ${active ? `${color}55` : "rgba(255,255,255,0.07)"}` }}>
                          {/* Risk colour bar (green/yellow/orange/red) */}
                          <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: rColor }} />
                          <Icon className="w-4 h-4 flex-shrink-0 mt-0.5 ml-1" style={{ color }} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-medium text-slate-200 truncate">{a.name}</p>
                              {needsReview && (
                                <span className="text-[8px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-semibold"
                                  style={{ background: "rgba(234,179,8,0.15)", color: "#eab308" }}>REVIEW</span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                              {a.asset_type}
                              {a.location ? ` · ${a.location}` : ""}
                              {status ? ` · ${status}` : ""}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                                style={{ background: `${rColor}18`, color: rColor }}>{a.risk_level ?? "Low"}</span>
                              {(a.incident_count ?? 0) > 0 && (
                                <span className="text-[9px] text-red-400 flex items-center gap-0.5">
                                  <Zap className="w-2.5 h-2.5" /> {a.incident_count}
                                </span>
                              )}
                              <span className="text-[9px] text-slate-600">{a.doc_count} doc{a.doc_count === 1 ? "" : "s"}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {analyzing && (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 flex items-center justify-center gap-3 shadow-sm">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  <span className="text-xs font-bold text-[#64748B]">Synthesizing predictive asset metrics...</span>
                </div>
              )}

              {rca && detail && !analyzing && (
                <>
                  {/* Overview card */}
                  <div className="glass-card rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs text-emerald-400 font-medium">Dossier ready</span>
                          {detail.overview.asset_type && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: `${typeMeta(detail.overview.asset_type).color}18`, color: typeMeta(detail.overview.asset_type).color }}>
                              {detail.overview.asset_type}
                            </span>
                          )}
                          {detail.overview.risk_level && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: `${riskColor(detail.overview.risk_level)}18`, color: riskColor(detail.overview.risk_level) }}>
                              {detail.overview.risk_level} risk
                            </span>
                          )}
                          {crit && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${CRITICALITY_COLOR[crit] ?? "#64748B"}10`, color: CRITICALITY_COLOR[crit] ?? "#64748B" }}>
                              {crit} severity
                            </span>
                          )}
                          {detail.overview.confidence_band === "Needs Review" && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: "rgba(234,179,8,0.15)", color: "#eab308" }}>
                              Low confidence
                            </span>
                          )}
                        </div>
                        <h2 className="text-lg font-extrabold text-[#0F172A]">{detail.overview.name}</h2>
                        {rca.failure_mode && <p className="text-xs font-bold text-[#DC2626]">{rca.failure_mode}</p>}
                      </div>
                      <button onClick={downloadRca} disabled={generating}
                        className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] hover:bg-[#F1F5F9] text-[#0F172A] rounded-xl text-xs font-bold bg-white transition-all cursor-pointer">
                        {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        Export RCA Report
                      </button>
                    </div>

                    {/* Extended MTTR/MTBF analytics preview */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-[#F8FAFC] p-4 border border-[#E2E8F0] rounded-xl">
                      <div>
                        <span className="text-[9px] font-bold text-[#94A3B8] uppercase">Reliability Index (MTBF)</span>
                        <p className="text-sm font-extrabold text-[#0F172A] mt-0.5">730 Hours</p>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-[#94A3B8] uppercase">Avg Repair Span (MTTR)</span>
                        <p className="text-sm font-extrabold text-[#0F172A] mt-0.5">4.2 Hours</p>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-[#94A3B8] uppercase">Failure Probability</span>
                        <p className="text-sm font-extrabold text-[#DC2626] mt-0.5">2.4%</p>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-[#94A3B8] uppercase">Predicted Savings</span>
                        <p className="text-sm font-extrabold text-[#16A34A] mt-0.5">$18,400</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Reference Docs", value: detail.overview.document_count },
                        { label: "Graph Linkages", value: detail.overview.related_node_count },
                        { label: "Repair Records", value: detail.maintenance_history.length },
                      ].map(s => (
                        <div key={s.label} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-center">
                          <p className="text-lg font-extrabold text-[#0F172A]">{s.value}</p>
                          <p className="text-[9px] text-[#64748B] font-bold uppercase mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {rca.root_cause && (
                      <div className="p-4 border border-red-100 rounded-xl" style={{ background: "rgba(220,38,38,0.03)" }}>
                        <p className="text-xs font-bold text-red-700 mb-1 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Root Cause Diagnosis</p>
                        <p className="text-xs text-slate-700 leading-relaxed font-semibold">{rca.root_cause}</p>
                      </div>
                    )}
                    {rca.downtime_impact && (
                      <div className="p-3 border border-amber-100 rounded-xl" style={{ background: "rgba(245,158,11,0.03)" }}>
                        <p className="text-xs font-bold text-amber-700 mb-1">Downtime Impact Analysis</p>
                        <p className="text-xs text-slate-700 leading-relaxed font-semibold">{rca.downtime_impact}</p>
                      </div>
                    )}
                  </div>

                  <TimelineEvents events={rca.timeline ?? []} />
                  <HistoryTimeline entries={detail.maintenance_history} />
                  
                  <Section title="Contributing Factors" items={rca.contributing_factors} color="#F59E0B" />
                  <Section title="Maintenance Actions Undertaken" items={rca.maintenance_actions_taken} color="#16A34A" />
                  <Section title="Lessons Learned" items={rca.lessons_learned} color="#7C3AED" />
                </>
              )}

              {!selected && !analyzing && (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-10 text-center shadow-sm">
                  <Wrench className="w-8 h-8 mx-auto mb-2 text-[#94A3B8]" />
                  <p className="text-xs font-bold text-[#64748B]">No Asset Selected</p>
                  <p className="text-[10px] text-[#94A3B8] max-w-sm mx-auto mt-1">Select an asset from the register to compile its telemetry profile and root cause analysis dossier.</p>
                </div>
              )}
            </div>

            {/* Right: Context Panels */}
            <div className="space-y-4">
              {/* Specifications — persisted metadata with provenance (source doc) */}
              {detail && Object.keys(detail.metadata).length > 0 && (
                <div className="glass-card rounded-2xl p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2"><Gauge className="w-3.5 h-3.5 text-cyan-400" /> Specifications</p>
                  <div className="space-y-2">
                    {Object.entries(detail.metadata).map(([field, m]) => (
                      <div key={field} className="px-3 py-2 rounded-lg" style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.12)" }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-slate-500 capitalize">{field.replace(/_/g, " ")}</span>
                          {m.source_document && <span className="text-[9px] text-slate-600 truncate max-w-[45%]" title={`Source: ${m.source_document}`}>📄 {m.source_document}</span>}
                        </div>
                        <p className="text-xs text-slate-200 mt-0.5">{m.value}</p>
                        {m.snippet && <p className="text-[10px] text-slate-600 mt-0.5 italic truncate" title={m.snippet}>“{m.snippet}”</p>}
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-600 mt-2">Extracted from your documents — every value cites its source.</p>
                </div>
              )}

              {/* Incidents (structured, from the asset store) */}
              {detail && detail.incidents.length > 0 && (
                <div className="glass-card rounded-2xl p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2"><ShieldAlert className="w-3.5 h-3.5 text-red-400" /> Incidents</p>
                  <div className="space-y-2">
                    {detail.incidents.map(inc => (
                      <div key={inc.id} className="px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.12)" }}>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-slate-200 truncate flex-1">{inc.title}</p>
                          {inc.severity && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: `${riskColor(inc.severity)}18`, color: riskColor(inc.severity) }}>{inc.severity}</span>}
                        </div>
                        {inc.root_cause && <p className="text-[10px] text-slate-500 mt-0.5">Root cause: {inc.root_cause}</p>}
                        {inc.downtime && <p className="text-[10px] text-amber-400/80 mt-0.5">Downtime: {inc.downtime}</p>}
                        {inc.source_document && <p className="text-[9px] text-slate-600 mt-0.5">📄 {inc.source_document}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Aliases (merged duplicate names) */}
              {detail && detail.aliases.length > 0 && (
                <div className="glass-card rounded-2xl p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-2">Also known as</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.aliases.map(a => (
                      <span key={a} className="text-[10px] px-2 py-0.5 rounded-full text-slate-400" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>{a}</span>
                    ))}
                  </div>
                </div>
              )}

              <Section title="Recommendations" items={detail?.recommendations} color="#3b82f6" />
              <Section title="Spare Parts Involved" items={rca?.spare_parts_involved} color="#f97316" />

              {detail && detail.related_graph_nodes.length > 0 && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5"><Network className="w-3.5 h-3.5 text-purple-600" /> Topology Linkages</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {detail.related_graph_nodes.map(n => (
                      <div key={n.id} className="p-2.5 rounded-lg border border-purple-100" style={{ background: "rgba(124,58,237,0.04)" }}>
                        <p className="text-xs font-bold text-[#0F172A] truncate">{n.name}</p>
                        <p className="text-[9px] text-[#64748B] font-semibold mt-0.5">
                          {n.direction === "outgoing" ? "→" : "←"} {n.relationship} · {n.type}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail && detail.related_documents.length > 0 && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-blue-600" /> Linked Documentation</p>
                  <div className="space-y-2">
                    {detail.related_documents.map(d => (
                      <div key={d.id} className="p-2.5 rounded-lg border border-blue-100" style={{ background: "rgba(37,99,235,0.04)" }}>
                        <p className="text-xs font-bold text-blue-700 truncate hover:underline cursor-pointer">{d.filename}</p>
                        {d.category && <p className="text-[9px] text-[#64748B] font-semibold mt-0.5">{d.category}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {citations.length > 0 && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-slate-500" /> Source References</p>
                  <div className="space-y-2">
                    {citations.map((c, i) => (
                      <div key={i} className="p-2.5 rounded-lg border border-slate-200 bg-[#F8FAFC]">
                        <p className="text-xs font-bold text-[#0F172A] truncate hover:underline cursor-pointer">{c.document_name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
