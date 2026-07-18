"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity, AlertOctagon, AlertTriangle, Boxes, Clock, Cpu, Download, FileText,
  Gauge, MapPin, Package, RefreshCw, Search, Server, ShieldAlert,
  ShieldCheck, Truck, Wrench, Zap,
} from "lucide-react";

import {
  downloadReportFile, fetchAssetDetail, fetchMaintenanceOverview, generateReport,
  type AssetDetail, type MaintenanceAsset, type MaintenanceOverview,
} from "@/lib/api";
import PageTransition from "@/components/motion/PageTransition";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState,
  KpiTile, Skeleton, SkeletonKpi, StatusDot, type Tone,
} from "@/components/ui";
import { cn } from "@/lib/utils";

/* Grounded: assets, risk levels, incidents and RCA all come from the backend
   asset store + evidence-gated RCA. There is no fabricated "failure
   probability" — the platform reports the real risk_level and incident counts,
   and states plainly when an asset has no maintenance evidence. */

const TYPE_ICON: Record<string, React.ElementType> = {
  Pump: Cpu, Motor: Cpu, Compressor: Cpu, Turbine: Cpu, Machine: Cpu, Equipment: Gauge,
  Generator: Zap, Transformer: Zap, Valve: Gauge, Conveyor: Activity, Sensor: Gauge,
  PLC: Cpu, Tool: Wrench, Server: Server, Database: Server, Vehicle: Truck,
  "Spare Part": Package, Facility: MapPin,
};

// Health is a restatement of the real risk_level — never an invented score.
function riskTone(risk?: string): Tone {
  switch ((risk ?? "").toLowerCase()) {
    case "critical": return "danger";
    case "high": return "danger";
    case "medium": return "warning";
    case "low": return "success";
    default: return "neutral";
  }
}
function healthLabel(risk?: string): string {
  switch ((risk ?? "").toLowerCase()) {
    case "critical": return "Critical";
    case "high": return "At risk";
    case "medium": return "Watch";
    case "low": return "Healthy";
    default: return "No signal";
  }
}

const HISTORY_TONE: Record<string, Tone> = {
  normal: "success", warning: "warning", ignored: "neutral", failure: "danger", repair: "info",
};

export default function MaintenancePage() {
  const [overview, setOverview] = useState<MaintenanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => { setLoading(true); setReloadKey((k) => k + 1); }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchMaintenanceOverview();
        if (!alive) return;
        setOverview(data); setError(null);
      } catch {
        if (!alive) return;
        setError("Couldn't reach the maintenance service.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  const visibleAssets = useMemo(() => {
    if (!overview) return [];
    const pool = category ? overview.assets.filter((a) => a.asset_type === category) : overview.assets;
    const needle = search.trim().toLowerCase();
    return needle ? pool.filter((a) => a.name.toLowerCase().includes(needle)) : pool;
  }, [overview, category, search]);

  const analyzeAsset = async (name: string) => {
    setSelected(name); setAnalyzing(true); setDetail(null);
    try { setDetail(await fetchAssetDetail(name)); }
    catch { setDetail(null); }
    finally { setAnalyzing(false); }
  };

  const downloadRca = async () => {
    if (!selected) return;
    setGenerating(true);
    try {
      const report = await generateReport(`RCA – ${selected}`, "RCA");
      await downloadReportFile(report.id, `RCA-${selected}.pdf`);
    } catch (e) { console.error(e); }
    finally { setGenerating(false); }
  };

  const k = overview?.kpis;

  return (
    <PageTransition className="space-y-4 p-5 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Maintenance Intelligence</h1>
          <p className="mt-0.5 text-xs text-ink-secondary">
            Maintainable assets discovered from your documents — with evidence-based RCA. No fabricated metrics.
          </p>
        </div>
        <Button size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Refresh
        </Button>
      </div>

      {/* KPI row */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonKpi key={i} />)}
        </div>
      ) : error ? (
        <Card className="border-warning/30 bg-warning-subtle">
          <CardContent className="flex items-center gap-2.5 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs font-medium text-warning">{error} Figures are unavailable — not zero.</p>
            <Button size="sm" variant="secondary" className="ml-auto" onClick={refresh}>Retry</Button>
          </CardContent>
        </Card>
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="show"
          className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[
            { label: "Total assets", value: k?.total_assets ?? null, icon: Boxes, tone: "brand" as Tone },
            { label: "Critical", value: k?.critical_assets ?? null, icon: AlertOctagon, tone: (k?.critical_assets ? "danger" : "neutral") as Tone },
            { label: "Open incidents", value: k?.open_incidents ?? null, icon: ShieldAlert, tone: (k?.open_incidents ? "danger" : "neutral") as Tone },
            { label: "High risk", value: k?.high_risk_assets ?? null, icon: AlertTriangle, tone: (k?.high_risk_assets ? "warning" : "neutral") as Tone },
            { label: "No maint. record", value: k?.assets_missing_maintenance ?? null, icon: Clock, tone: "neutral" as Tone },
            { label: "With alerts", value: k?.assets_with_alerts ?? null, icon: Zap, tone: (k?.assets_with_alerts ? "warning" : "neutral") as Tone },
          ].map((kpi) => (
            <motion.div key={kpi.label} variants={staggerItem}>
              <KpiTile label={kpi.label} value={kpi.value} icon={kpi.icon} tone={kpi.tone} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Body: registry + dossier */}
      {!loading && !error && (
        overview && !overview.has_data ? (
          <Card>
            <EmptyState
              icon={Boxes}
              title="No maintainable assets found"
              reason={overview.message || "No equipment or maintenance records were detected in your uploaded documents."}
              hint="Upload maintenance logs, equipment manuals or inspection reports to populate the register."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            {/* Asset registry */}
            <div className="xl:col-span-2">
              <Card className="flex h-full flex-col">
                <CardHeader className="flex-col items-stretch gap-2.5">
                  <div className="flex items-center justify-between">
                    <CardTitle>Asset register</CardTitle>
                    <span className="text-[11px] text-ink-tertiary">{visibleAssets.length} shown</span>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search assets…"
                      className="w-full rounded-ui-md border border-line bg-canvas py-1.5 pl-8 pr-3 text-xs text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                    />
                  </div>
                  {(overview?.asset_types.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <FilterChip active={!category} onClick={() => setCategory(null)}>
                        All · {overview?.kpis.total_assets ?? 0}
                      </FilterChip>
                      {overview?.asset_types.map((t) => (
                        <FilterChip key={t} active={category === t} onClick={() => setCategory(t)}>
                          {t} · {overview.asset_counts[t] ?? 0}
                        </FilterChip>
                      ))}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="max-h-[560px] min-h-[200px] flex-1 overflow-y-auto p-0">
                  {visibleAssets.length === 0 ? (
                    <p className="p-5 text-center text-xs text-ink-tertiary">No assets match your filter.</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {visibleAssets.map((a) => (
                        <AssetRow
                          key={a.id}
                          asset={a}
                          active={selected === a.name}
                          onClick={() => analyzeAsset(a.name)}
                        />
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Dossier */}
            <div className="xl:col-span-3">
              {!selected ? (
                <Card>
                  <EmptyState
                    icon={Wrench}
                    title="Select an asset"
                    reason="Choose an asset from the register to see its evidence-based root-cause analysis, incident history and maintenance timeline."
                  />
                </Card>
              ) : analyzing ? (
                <DossierSkeleton />
              ) : detail ? (
                <Dossier detail={detail} onDownload={downloadRca} generating={generating} />
              ) : (
                <Card>
                  <EmptyState
                    icon={AlertTriangle}
                    title="Analysis unavailable"
                    reason={`Couldn't load the dossier for ${selected}. The service may be unreachable.`}
                    action={<Button size="sm" onClick={() => analyzeAsset(selected)}>Retry</Button>}
                  />
                </Card>
              )}
            </div>
          </div>
        )
      )}
    </PageTransition>
  );
}

// ── Filter chip ─────────────────────────────────────────────────────────────
function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-ui-md border px-2 py-0.5 text-[11px] font-semibold transition-colors",
        active
          ? "border-brand-line bg-brand-subtle text-brand"
          : "border-line bg-surface text-ink-secondary hover:bg-subtle"
      )}
    >
      {children}
    </button>
  );
}

// ── Asset row ───────────────────────────────────────────────────────────────
function AssetRow({ asset, active, onClick }: { asset: MaintenanceAsset; active: boolean; onClick: () => void }) {
  const Icon = TYPE_ICON[asset.asset_type] ?? Boxes;
  const tone = riskTone(asset.risk_level);
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors",
          active ? "bg-brand-subtle" : "hover:bg-subtle"
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-md border border-line bg-subtle">
          <Icon className="h-4 w-4 text-ink-secondary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-ink">{asset.name}</p>
          <p className="truncate text-[11px] text-ink-tertiary">
            {asset.asset_type}
            {asset.location ? ` · ${asset.location}` : ""}
            {asset.incident_count ? ` · ${asset.incident_count} incident${asset.incident_count > 1 ? "s" : ""}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusDot tone={tone} />
          <Badge tone={tone}>{healthLabel(asset.risk_level)}</Badge>
        </div>
      </button>
    </li>
  );
}

// ── Dossier skeleton ────────────────────────────────────────────────────────
function DossierSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Card>
  );
}

// ── Dossier ─────────────────────────────────────────────────────────────────
function Dossier({ detail, onDownload, generating }: { detail: AssetDetail; onDownload: () => void; generating: boolean }) {
  const { overview: ov, report: rca } = detail;
  const Icon = TYPE_ICON[ov.asset_type ?? ""] ?? Boxes;
  const tone = riskTone(ov.risk_level ?? undefined);
  const noEvidence = rca?.no_maintenance_evidence;

  const timeline = rca?.timeline?.length
    ? rca.timeline
    : (rca?.chronology ?? []).map((c) => ({ time: "", event: c, status: "normal", detail: "" }));

  return (
    <div className="space-y-4">
      {/* Dossier header */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-ui-lg border border-line bg-subtle">
              <Icon className="h-5 w-5 text-ink-secondary" />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink">{detail.asset}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {ov.asset_type && <Badge tone="neutral">{ov.asset_type}</Badge>}
                <Badge tone={tone}>Risk: {ov.risk_level ?? "—"}</Badge>
                {ov.confidence_band && <Badge tone="brand">{ov.confidence_band}</Badge>}
                {ov.location && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-tertiary">
                    <MapPin className="h-3 w-3" /> {ov.location}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={onDownload} loading={generating}>
            <Download className="h-3.5 w-3.5" /> RCA PDF
          </Button>
        </div>
      </Card>

      {/* No-evidence honest state */}
      {noEvidence ? (
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title="No maintenance evidence for this asset"
            reason={rca?.root_cause || "This asset is mentioned in your documents, but they contain no repair logs, work orders, inspection records or failure history — so no root-cause analysis can be produced."}
            hint="Upload maintenance logs or incident reports for this asset to enable RCA."
          />
        </Card>
      ) : (
        <>
          {/* Root cause */}
          {(rca?.failure_mode || rca?.root_cause) && (
            <Card>
              <CardHeader><CardTitle>Root cause analysis</CardTitle>
                {rca?.criticality && <Badge tone={riskTone(rca.criticality)}>{rca.criticality}</Badge>}
              </CardHeader>
              <CardContent className="space-y-3">
                {rca?.failure_mode && (
                  <Field label="Failure mode"><p className="text-[13px] text-ink">{rca.failure_mode}</p></Field>
                )}
                {rca?.root_cause && (
                  <Field label="Root cause"><p className="text-[13px] leading-relaxed text-ink-secondary">{rca.root_cause}</p></Field>
                )}
                {!!rca?.contributing_factors?.length && (
                  <Field label="Contributing factors">
                    <ul className="space-y-1">
                      {rca.contributing_factors.map((f, i) => (
                        <li key={i} className="flex gap-2 text-[13px] text-ink-secondary">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />{f}
                        </li>
                      ))}
                    </ul>
                  </Field>
                )}
                {rca?.downtime_impact && (
                  <Field label="Downtime impact"><p className="text-[13px] text-ink-secondary">{rca.downtime_impact}</p></Field>
                )}
              </CardContent>
            </Card>
          )}

          {/* Failure chronology timeline */}
          {timeline.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Failure chronology</CardTitle></CardHeader>
              <CardContent>
                <Timeline items={timeline} />
              </CardContent>
            </Card>
          )}

          {/* Preventive recommendations */}
          {!!rca?.preventive_recommendations?.length && (
            <Card>
              <CardHeader><CardTitle>Preventive recommendations</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {rca.preventive_recommendations.map((r, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] text-ink-secondary">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />{r}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Maintenance history (always real, independent of RCA) */}
      {detail.maintenance_history.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Maintenance history</CardTitle></CardHeader>
          <CardContent>
            <Timeline
              items={detail.maintenance_history.map((h) => ({
                time: h.date, event: h.event, status: h.status, detail: h.detail, source: h.source_document,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {/* Extracted attributes with provenance */}
      {Object.keys(detail.metadata).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Extracted attributes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(detail.metadata).map(([field, m]) => (
              <div key={field} className="flex items-start justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-xs font-semibold capitalize text-ink">{field.replace(/_/g, " ")}</p>
                  {m.source_document && (
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-tertiary">
                      <FileText className="h-2.5 w-2.5" /> {m.source_document}
                      {m.page_number != null ? ` · p.${m.page_number}` : ""}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-right text-xs font-semibold text-ink-secondary">{m.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">{label}</p>
      {children}
    </div>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────
type TLItem = { time?: string; event: string; status?: string; detail?: string; source?: string | null };
function Timeline({ items }: { items: TLItem[] }) {
  return (
    <ol className="space-y-3">
      {items.map((it, i) => {
        const tone = HISTORY_TONE[it.status ?? "normal"] ?? "neutral";
        const dotColor: Record<Tone, string> = {
          neutral: "bg-ink-tertiary", success: "bg-success", warning: "bg-warning",
          danger: "bg-danger", info: "bg-info", brand: "bg-brand",
        };
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", dotColor[tone])} />
              {i < items.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] font-semibold text-ink">{it.event}</p>
                {it.status && <Badge tone={tone}>{it.status}</Badge>}
                {it.time && <span className="text-[11px] text-ink-tertiary">{it.time}</span>}
              </div>
              {it.detail && <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{it.detail}</p>}
              {it.source && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-tertiary">
                  <FileText className="h-2.5 w-2.5" /> {it.source}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
