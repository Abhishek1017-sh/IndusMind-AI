"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Network,
  RefreshCw,
  Upload,
} from "lucide-react";

import {
  fetchModuleReadiness,
  listDocuments,
  type DocumentRecord,
  type ModuleReadiness,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageTransition from "@/components/motion/PageTransition";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  KpiTile,
  Skeleton,
  SkeletonKpi,
  SkeletonRow,
  StatusDot,
  type Tone,
} from "@/components/ui";

/* ─────────────────────────────────────────────────────────────
   Everything on this page is derived from real API data:
   document status/timestamps and per-module readiness. Nothing is
   simulated — when a figure isn't derivable we show "—" or an
   EmptyState that explains why, never a placeholder number.
   ───────────────────────────────────────────────────────────── */

const STATUS: Record<DocumentRecord["status"], { tone: Tone; label: string }> = {
  COMPLETED: { tone: "success", label: "Indexed" },
  PROCESSING: { tone: "info", label: "Processing" },
  PENDING: { tone: "neutral", label: "Queued" },
  FAILED: { tone: "danger", label: "Failed" },
};

const BAND_TONE: Record<string, Tone> = {
  Strong: "success",
  Partial: "warning",
  Weak: "warning",
  Insufficient: "neutral",
};

const QUICK_ACTIONS = [
  { href: "/documents", icon: Upload, label: "Upload documents", desc: "Add PDFs, SOPs, logs" },
  { href: "/chat", icon: MessageSquare, label: "Ask the AI", desc: "Cited answers from your docs" },
  { href: "/graph", icon: Network, label: "Explore graph", desc: "Entities & relationships" },
  { href: "/reports", icon: BarChart3, label: "Generate report", desc: "Export a grounded PDF" },
];

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [modules, setModules] = useState<Record<string, ModuleReadiness>>({});
  const [loading, setLoading] = useState(true);
  /**
   * Distinguishes "loaded, and there genuinely are no documents" from "we could
   * not reach the API". Without this the KPIs would render a confident `0` and
   * the empty state would claim nothing was uploaded — both untrue when the
   * service is merely unreachable.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // setState belongs in the event handler, not the effect body — calling it
  // synchronously inside an effect triggers cascading renders.
  const refresh = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Readiness is best-effort: a failure there must not blank the KPIs.
      const [docsRes, readyRes] = await Promise.allSettled([
        listDocuments(),
        fetchModuleReadiness(),
      ]);
      if (!alive) return;
      if (docsRes.status === "fulfilled") {
        setDocs(docsRes.value);
        setLoadError(null);
      } else {
        setDocs([]);
        setLoadError("Couldn't reach the API. Figures are unavailable — not zero.");
      }
      if (readyRes.status === "fulfilled") setModules(readyRes.value.modules ?? {});
      else setModules({});
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const stats = useMemo(() => {
    // If the fetch failed we know nothing — every figure is null ("—"), never 0.
    if (loadError) {
      return { total: null, completed: null, processing: null, failed: null, indexedPct: null };
    }
    const completed = docs.filter((d) => d.status === "COMPLETED").length;
    const processing = docs.filter(
      (d) => d.status === "PROCESSING" || d.status === "PENDING"
    ).length;
    const failed = docs.filter((d) => d.status === "FAILED").length;
    return {
      total: docs.length,
      completed,
      processing,
      failed,
      // Null (not 0) when there's nothing to compute a rate from.
      indexedPct: docs.length ? Math.round((completed / docs.length) * 100) : null,
    };
  }, [docs, loadError]);

  /** Real ingestion activity: uploads bucketed per day from created_at. */
  const series = useMemo(() => {
    const DAYS = 14;
    const buckets = new Map<string, number>();
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const doc of docs) {
      const key = (doc.created_at ?? "").slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return [...buckets].map(([date, count]) => ({
      date,
      count,
      label: date.slice(5).replace("-", "/"),
    }));
  }, [docs]);

  const recent = docs.slice(0, 6);
  const moduleList = Object.entries(modules);
  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <PageTransition className="space-y-4 p-5 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            Welcome back, {firstName}
          </h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-secondary">
            <StatusDot tone="success" pulse />
            Operations overview · every figure derived from your uploaded documents
          </p>
        </div>
        <Button size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          Refresh
        </Button>
      </div>

      {/* KPI row */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonKpi key={i} />
          ))}
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <motion.div variants={staggerItem}>
            <KpiTile label="Documents" value={stats.total} sub="uploaded" icon={FileText} tone="brand" />
          </motion.div>
          <motion.div variants={staggerItem}>
            <KpiTile
              label="Indexed"
              value={stats.completed}
              sub={stats.indexedPct === null ? "no uploads yet" : `${stats.indexedPct}% searchable`}
              icon={CheckCircle2}
              tone="success"
            />
          </motion.div>
          <motion.div variants={staggerItem}>
            <KpiTile label="Processing" value={stats.processing} sub="in pipeline" icon={Clock} tone="info" />
          </motion.div>
          <motion.div variants={staggerItem}>
            <KpiTile
              label="Failed"
              value={stats.failed}
              sub="need attention"
              icon={AlertTriangle}
              tone={(stats.failed ?? 0) > 0 ? "danger" : "neutral"}
            />
          </motion.div>
        </motion.div>
      )}

      {/* Service unreachable — state it plainly rather than implying "0". */}
      {!loading && loadError && (
        <Card className="border-warning/30 bg-warning-subtle">
          <CardContent className="flex items-center gap-2.5 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs font-medium text-warning">{loadError}</p>
            <Button size="sm" variant="secondary" className="ml-auto" onClick={refresh}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ── Left column ─────────────────────────────────── */}
        <div className="space-y-4 xl:col-span-2">
          {/* Ingestion activity */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Ingestion activity</CardTitle>
                <p className="mt-0.5 text-[11px] text-ink-tertiary">
                  Documents uploaded per day · last 14 days
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : loadError ? (
                <EmptyState
                  icon={AlertTriangle}
                  title="Activity unavailable"
                  reason="The service couldn't be reached, so ingestion activity can't be shown. This does not mean there is no activity."
                  action={
                    <Button size="sm" onClick={refresh}>
                      Retry
                    </Button>
                  }
                />
              ) : stats.total === 0 ? (
                <EmptyState
                  icon={Upload}
                  title="No ingestion activity"
                  reason="You haven't uploaded any documents yet, so there is no activity to chart."
                  hint="Upload a document and this timeline populates automatically."
                  action={
                    <Button variant="primary" size="sm" asChild>
                      <Link href="/documents">
                        <Upload className="h-3.5 w-3.5" />
                        Upload a document
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ingestFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "var(--color-ink-tertiary)" }}
                        axisLine={{ stroke: "var(--color-line)" }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: "var(--color-ink-tertiary)" }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                      />
                      <Tooltip
                        cursor={{ stroke: "var(--color-line-strong)" }}
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid var(--color-line)",
                          fontSize: 11,
                          boxShadow: "var(--shadow-e3)",
                        }}
                        labelFormatter={(l) => `Day ${l}`}
                        formatter={(value) => [`${value}`, "documents"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="var(--color-brand)"
                        strokeWidth={2}
                        fill="url(#ingestFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <Link
                href="/documents"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="divide-y divide-line px-5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </div>
              ) : loadError ? (
                <EmptyState
                  icon={AlertTriangle}
                  title="Activity unavailable"
                  reason="The service couldn't be reached, so recent activity can't be listed."
                />
              ) : recent.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="Nothing ingested yet"
                  reason="Recent activity lists documents as they move through the processing pipeline."
                />
              ) : (
                <motion.ul
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                  className="divide-y divide-line"
                >
                  {recent.map((doc) => {
                    const s = STATUS[doc.status] ?? STATUS.PENDING;
                    return (
                      <motion.li
                        key={doc.id}
                        variants={staggerItem}
                        className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-subtle"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ui-md border border-line bg-subtle">
                          <FileText className="h-3.5 w-3.5 text-ink-tertiary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-ink">{doc.filename}</p>
                          <p className="mt-0.5 text-[11px] text-ink-tertiary">
                            {(doc.file_size / 1024).toFixed(0)} KB · {doc.file_type?.toUpperCase()}
                            {doc.category ? ` · ${doc.category}` : ""}
                          </p>
                        </div>
                        <span className="hidden text-[11px] text-ink-tertiary sm:block">
                          {relativeTime(doc.created_at)}
                        </span>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </motion.li>
                    );
                  })}
                </motion.ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right column ────────────────────────────────── */}
        <div className="space-y-4">
          {/* Module readiness — grounded "AI insights" */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Module readiness</CardTitle>
                <p className="mt-0.5 text-[11px] text-ink-tertiary">
                  What your documents actually enable
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)
              ) : moduleList.length === 0 ? (
                <EmptyState
                  icon={Network}
                  title="No modules active"
                  reason="Module readiness is computed from the content of your uploaded documents — with none uploaded, nothing can be assessed."
                />
              ) : (
                moduleList.map(([key, m]) => (
                  <div key={key}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-ink">{m.label}</span>
                      <Badge tone={BAND_TONE[m.band] ?? "neutral"}>{m.band}</Badge>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-subtle">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round((m.score ?? 0) * 100)}%` }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className={m.active ? "h-full bg-brand" : "h-full bg-line-strong"}
                      />
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-ink-tertiary">{m.reason}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-line">
                {QUICK_ACTIONS.map((a) => (
                  <li key={a.href}>
                    <Link
                      href={a.href}
                      className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-subtle"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ui-md border border-line bg-subtle group-hover:border-brand-line group-hover:bg-brand-subtle">
                        <a.icon className="h-3.5 w-3.5 text-ink-tertiary group-hover:text-brand" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-ink">{a.label}</p>
                        <p className="text-[11px] text-ink-tertiary">{a.desc}</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-ink-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
