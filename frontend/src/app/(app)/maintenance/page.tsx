"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchMaintenanceOverview, fetchAssetDetail, generateReport, getReportDownloadUrl,
  type MaintenanceOverview, type MaintenanceAsset, type AssetDetail, type Citation, type TimelineEvent,
} from "@/lib/api";
import {
  Wrench, Loader2, CheckCircle2, ChevronDown, ChevronUp, Download, FileText, Clock,
  AlertTriangle, Zap, RotateCcw, CheckCheck, Cpu, Package, MapPin, Server, Truck,
  Sparkles, Boxes, RefreshCw, Search, Network, Building2, ShieldAlert, Gauge, X,
} from "lucide-react";

// ─── Category presentation (matches backend asset_classifier categories) ─────
const CATEGORY_META: Record<string, { Icon: React.ElementType; color: string }> = {
  Machines:     { Icon: Cpu,        color: "#3b82f6" },
  Equipment:    { Icon: Gauge,      color: "#06b6d4" },
  Servers:      { Icon: Server,     color: "#8b5cf6" },
  Vehicles:     { Icon: Truck,      color: "#eab308" },
  Facilities:   { Icon: Building2,  color: "#14b8a6" },
  "Spare Parts":{ Icon: Package,    color: "#f97316" },
  Failures:     { Icon: Zap,        color: "#ef4444" },
  Incidents:    { Icon: ShieldAlert,color: "#f43f5e" },
  Vendors:      { Icon: MapPin,     color: "#a855f7" },
};
const catMeta = (c: string) => CATEGORY_META[c] ?? { Icon: Boxes, color: "#64748b" };

const CRITICALITY_COLOR: Record<string, string> = {
  Critical: "#ef4444", High: "#f97316", Medium: "#f59e0b", Low: "#10b981",
};

const TIMELINE_STATUS: Record<string, { color: string; bg: string; Icon: React.ElementType; label: string }> = {
  normal:  { color: "#10b981", bg: "rgba(16,185,129,0.12)",  Icon: CheckCheck,    label: "Normal"   },
  warning: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  Icon: AlertTriangle, label: "Warning"  },
  ignored: { color: "#64748b", bg: "rgba(100,116,139,0.12)", Icon: Clock,         label: "Ignored"  },
  failure: { color: "#ef4444", bg: "rgba(239,68,68,0.12)",   Icon: Zap,           label: "Critical" },
  repair:  { color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  Icon: RotateCcw,     label: "Repair"   },
};

function Section({ title, items, color = "#3b82f6" }: { title: string; items?: string[]; color?: string }) {
  const [open, setOpen] = useState(true);
  if (!items || items.length === 0) return null;
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors">
        <span className="text-xs font-semibold" style={{ color }}>{title}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
              <p className="text-xs text-slate-400 leading-relaxed">{item}</p>
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
    <div className="glass-card rounded-xl p-5">
      <p className="text-xs font-semibold mb-4" style={{ color: "#f59e0b" }}>Maintenance History</p>
      <div className="space-y-3">
        {entries.map((e, i) => {
          const cfg = TIMELINE_STATUS[e.status] ?? TIMELINE_STATUS.normal;
          const Icon = cfg.Icon;
          return (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: cfg.bg, border: `1.5px solid ${cfg.color}` }}>
                <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-200">{e.event}</span>
                  {e.date && <span className="text-xs font-mono text-slate-500">{e.date}</span>}
                </div>
                {e.detail && <p className="text-xs text-slate-500 mt-0.5">{e.detail}</p>}
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
    <div className="glass-card rounded-xl p-5">
      <p className="text-xs font-semibold mb-4" style={{ color: "#ef4444" }}>Failure Chronology</p>
      <div className="space-y-3">
        {events.map((evt, i) => {
          const cfg = TIMELINE_STATUS[evt.status] ?? TIMELINE_STATUS.normal;
          const Icon = cfg.Icon;
          return (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: cfg.bg, border: `1.5px solid ${cfg.color}` }}>
                <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  <span className="text-xs font-mono text-slate-500">{evt.time}</span>
                </div>
                <p className="text-sm font-medium text-slate-200 mt-0.5">{evt.event}</p>
                {evt.detail && <p className="text-xs text-slate-500 mt-0.5">{evt.detail}</p>}
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
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const loadOverview = useCallback(() => {
    setLoadingOverview(true);
    fetchMaintenanceOverview()
      .then(setOverview)
      .catch(console.error)
      .finally(() => setLoadingOverview(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, not derived render state
    loadOverview();
  }, [loadOverview]);

  // Client-side search/filter over the already-fetched register keeps the UI snappy;
  // the same filters exist server-side (?q=&category=) for large registers.
  const visibleAssets = useMemo(() => {
    if (!overview) return [];
    const pool: MaintenanceAsset[] =
      category === "Failures" ? overview.failures
      : category === "Incidents" ? overview.incidents
      : category === "Vendors" ? overview.vendors
      : category ? overview.assets.filter(a => a.category === category)
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
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
              <Wrench className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-100">Asset Register</h1>
          </div>
          <p className="text-sm text-slate-500 ml-11">Maintainable assets discovered from your documents. Select one for a full dossier.</p>
        </div>
        <button onClick={loadOverview} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-300 flex-shrink-0 transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loadingOverview ? (
        <div className="glass-card rounded-2xl p-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
        </div>
      ) : !overview?.has_data ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <Boxes className="w-8 h-8 mx-auto mb-3 text-slate-700" />
          <p className="text-sm text-slate-400">No maintainable assets yet</p>
          <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">{overview?.message}</p>
        </div>
      ) : (
        <>
          {/* Category tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
            {overview.categories.filter(c => (overview.category_counts[c] ?? 0) > 0).map(c => {
              const { Icon, color } = catMeta(c);
              const active = category === c;
              return (
                <button key={c} onClick={() => setCategory(active ? null : c)}
                  className="glass-card rounded-xl p-4 text-left transition-all hover:scale-[1.02]"
                  style={active ? { border: `1.5px solid ${color}70`, background: `${color}12` } : undefined}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="w-4 h-4" style={{ color }} />
                    <span className="text-xl font-bold" style={{ color }}>{overview.category_counts[c]}</span>
                  </div>
                  <p className="text-xs text-slate-500">{c}</p>
                </button>
              );
            })}
          </div>

          {/* Search + active filter */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <div className="relative flex-1 min-w-56">
              <Search className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search assets by name…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-slate-200 placeholder:text-slate-600 outline-none"
                style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.08)" }} />
            </div>
            {category && (
              <button onClick={() => setCategory(null)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium"
                style={{ background: `${catMeta(category).color}18`, color: catMeta(category).color, border: `1px solid ${catMeta(category).color}40` }}>
                {category} <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* Left: register + dossier */}
            <div className="xl:col-span-2 space-y-4">
              <div className="glass-card rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-slate-300">{category ?? "All Assets"}</p>
                  <span className="text-xs text-slate-600">{visibleAssets.length} shown</span>
                </div>
                {visibleAssets.length === 0 ? (
                  <p className="text-xs text-slate-600">No assets match your search or filter.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {visibleAssets.map(a => {
                      const { Icon, color } = catMeta(a.category);
                      const active = selected === a.name;
                      const status = a.properties?.status as string | undefined;
                      return (
                        <button key={a.id} onClick={() => analyzeAsset(a.name)}
                          className="flex items-start gap-2.5 p-3 rounded-xl text-left transition-all hover:scale-[1.01]"
                          style={{ background: active ? `${color}18` : "rgba(255,255,255,0.03)", border: `1px solid ${active ? `${color}55` : "rgba(255,255,255,0.07)"}` }}>
                          <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-200 truncate">{a.name}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {a.category} · {a.doc_count} doc{a.doc_count === 1 ? "" : "s"}
                              {status ? ` · ${status}` : ""}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {analyzing && (
                <div className="glass-card rounded-2xl p-8 flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                  <span className="text-sm text-slate-400">Building dossier for {selected}…</span>
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
                          {detail.overview.category && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: `${catMeta(detail.overview.category).color}18`, color: catMeta(detail.overview.category).color }}>
                              {detail.overview.category}
                            </span>
                          )}
                          {crit && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: `${CRITICALITY_COLOR[crit] ?? "#64748b"}18`, color: CRITICALITY_COLOR[crit] ?? "#64748b" }}>
                              {crit} criticality
                            </span>
                          )}
                        </div>
                        <h2 className="text-lg font-bold text-slate-100">{detail.overview.name}</h2>
                        {rca.failure_mode && <p className="text-sm text-red-400 mt-1">{rca.failure_mode}</p>}
                      </div>
                      <button onClick={downloadRca} disabled={generating}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-300 transition-all flex-shrink-0"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        Export PDF
                      </button>
                    </div>

                    {/* Key stats */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {[
                        { label: "Documents", value: detail.overview.document_count },
                        { label: "Graph links", value: detail.overview.related_node_count },
                        { label: "History", value: detail.maintenance_history.length },
                      ].map(s => (
                        <div key={s.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
                          <p className="text-lg font-bold text-slate-200">{s.value}</p>
                          <p className="text-[10px] text-slate-600">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {rca.root_cause && (
                      <div className="p-4 rounded-xl" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                        <p className="text-xs font-semibold text-red-400 mb-2">Root Cause</p>
                        <p className="text-sm text-slate-300 leading-relaxed">{rca.root_cause}</p>
                      </div>
                    )}
                    {rca.downtime_impact && (
                      <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
                        <p className="text-xs font-semibold text-amber-400 mb-1">Downtime Impact</p>
                        <p className="text-xs text-slate-400 leading-relaxed">{rca.downtime_impact}</p>
                      </div>
                    )}
                  </div>

                  <TimelineEvents events={rca.timeline ?? []} />
                  <HistoryTimeline entries={detail.maintenance_history} />
                  <Section title="Contributing Factors" items={rca.contributing_factors} color="#f59e0b" />
                  <Section title="Maintenance Actions Taken" items={rca.maintenance_actions_taken} color="#10b981" />
                  <Section title="Lessons Learned" items={rca.lessons_learned} color="#6366f1" />
                </>
              )}

              {!selected && !analyzing && (
                <div className="glass-card rounded-2xl p-8 text-center">
                  <Wrench className="w-7 h-7 mx-auto mb-2 text-slate-700" />
                  <p className="text-sm text-slate-500">Select an asset above to open its dossier and Root Cause Analysis.</p>
                </div>
              )}
            </div>

            {/* Right: context */}
            <div className="space-y-4">
              <Section title="Recommendations" items={detail?.recommendations} color="#3b82f6" />
              <Section title="Spare Parts Involved" items={rca?.spare_parts_involved} color="#f97316" />

              {detail && detail.related_graph_nodes.length > 0 && (
                <div className="glass-card rounded-2xl p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2"><Network className="w-3.5 h-3.5 text-violet-400" /> Related Graph Nodes</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {detail.related_graph_nodes.map(n => (
                      <div key={n.id} className="px-3 py-2 rounded-lg" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.12)" }}>
                        <p className="text-xs font-medium text-slate-300 truncate">{n.name}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          {n.direction === "outgoing" ? "→" : "←"} {n.relationship} · {n.type}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail && detail.related_documents.length > 0 && (
                <div className="glass-card rounded-2xl p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Related Documents</p>
                  <div className="space-y-2">
                    {detail.related_documents.map(d => (
                      <div key={d.id} className="px-3 py-2 rounded-lg" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.12)" }}>
                        <p className="text-xs font-medium text-blue-300 truncate">{d.filename}</p>
                        {d.category && <p className="text-[10px] text-slate-600 mt-0.5">{d.category}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {citations.length > 0 && (
                <div className="glass-card rounded-2xl p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> RCA Sources</p>
                  <div className="space-y-2">
                    {citations.map((c, i) => (
                      <div key={i} className="px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <p className="text-xs text-slate-400 truncate">{c.document_name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {overview.recent_incidents.length > 0 && (
                <div className="glass-card rounded-2xl p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Recent Incident Reports</p>
                  <div className="space-y-2">
                    {overview.recent_incidents.map(d => (
                      <div key={d.id} className="px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.12)" }}>
                        <p className="text-xs font-medium text-slate-300 truncate">{d.filename}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">{d.category}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {overview.recurring_patterns.length > 0 && (
                <div className="glass-card rounded-2xl p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-amber-400" /> Recurring Assets</p>
                  <div className="space-y-2">
                    {overview.recurring_patterns.map((p, i) => (
                      <div key={i} className="px-3 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.12)" }}>
                        <p className="text-xs font-medium text-slate-300 truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">{p.type} · in {p.doc_count} documents</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rca?.confidence_score != null && rca.confidence_score > 0 && (
                <div className="glass-card rounded-2xl p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-3">RCA Confidence</p>
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-bold" style={{ color: "#10b981" }}>{Math.round(rca.confidence_score * 100)}%</p>
                    <p className="text-xs text-slate-600 mb-1">grounding</p>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.round(rca.confidence_score * 100)}%`, background: "linear-gradient(90deg, #10b981, #3b82f6)" }} />
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
