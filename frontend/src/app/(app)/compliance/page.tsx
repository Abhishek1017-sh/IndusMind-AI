"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, CheckCircle2, Download, FileText, FileWarning, Info,
  RefreshCw, ShieldAlert, ShieldCheck, XCircle,
} from "lucide-react";

import {
  downloadReportFile, fetchComplianceOverview, generateComplianceAudit,
  type ComplianceFinding, type ComplianceOverview, type ComplianceTimelineEvent,
  type DetectedRegulation, type ModuleReadiness,
} from "@/lib/api";
import PageTransition from "@/components/motion/PageTransition";
import { EASE, staggerContainer, staggerItem } from "@/components/motion/variants";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState,
  Skeleton, type Tone,
} from "@/components/ui";
import { cn } from "@/lib/utils";

/* Compliance is assessed ONLY against standards the uploaded documents actually
   reference. When nothing qualifies, this page explains exactly why and what to
   upload — it never invents a score, a finding, or a passed check. */

const SEVERITY_TONE: Record<string, Tone> = {
  Critical: "danger", High: "danger", Medium: "warning", Low: "info",
};
const FINDING_TONE: Record<ComplianceFinding["type"], Tone> = {
  overdue: "danger", missing_evidence: "warning", compliant: "success",
};
const BAND_TONE: Record<string, Tone> = {
  Strong: "success", Partial: "warning", Weak: "warning", Insufficient: "neutral",
};
function scoreTone(score: number, hasData: boolean): Tone {
  if (!hasData) return "neutral";
  if (score >= 90) return "success";
  if (score >= 70) return "warning";
  return "danger";
}
const TONE_HEX: Record<Tone, string> = {
  neutral: "#8794a7", success: "#047857", warning: "#b45309",
  danger: "#b42318", info: "#175cd3", brand: "#4f46e5",
};

export default function CompliancePage() {
  const [overview, setOverview] = useState<ComplianceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => { setLoading(true); setReloadKey((k) => k + 1); }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchComplianceOverview();
        if (!alive) return;
        setOverview(data); setError(null);
      } catch {
        if (alive) setError("Couldn't reach the compliance service.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  const downloadReport = async () => {
    setGenerating(true);
    try {
      const r = await generateComplianceAudit();
      await downloadReportFile(r.id, "compliance-audit-report.pdf");
    } catch (e) { console.error(e); }
    finally { setGenerating(false); }
  };

  const hasData = !!overview?.has_data;

  return (
    <PageTransition className="space-y-4 p-5 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Compliance Intelligence</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-ink-secondary">
            Assessed only against standards your uploaded documents actually reference — every finding cites its source.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={downloadReport} loading={generating}>
            <Download className="h-3.5 w-3.5" /> Audit report
          </Button>
          <Button size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <Card className="border-warning/30 bg-warning-subtle">
          <CardContent className="flex items-center gap-2.5 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs font-medium text-warning">
              {error} Compliance status is unknown — this is not a passing or failing result.
            </p>
            <Button size="sm" variant="secondary" className="ml-auto" onClick={refresh}>Retry</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Main column */}
          <div className="space-y-4 xl:col-span-2">
            <ReadinessPanel readiness={overview?.readiness} hasData={hasData} score={overview?.compliance_score ?? 0} />

            {hasData && (
              <ScoreCard
                score={overview!.compliance_score}
                risk={overview!.risk_level}
                summary={overview!.summary}
                passed={overview!.passed_checks}
                failed={overview!.failed_checks}
              />
            )}

            <FindingsPanel findings={(hasData ? overview?.findings : overview?.violations) ?? []} />

            {hasData && !!overview?.checklist.length && (
              <Card>
                <CardHeader><CardTitle>Audited checklist</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y divide-line">
                    {overview.checklist.map((item, i) => {
                      const ok = item.status === "COMPLIANT";
                      return (
                        <li key={i} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle">
                          {ok
                            ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                            : <XCircle className="h-4 w-4 shrink-0 text-danger" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-ink">{item.parameter}</p>
                            {item.deviation && item.deviation !== "None" && (
                              <p className="mt-0.5 text-[11px] font-semibold text-danger">{item.deviation}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[10px] font-bold uppercase text-ink-tertiary">
                              Limit: <span className="text-ink-secondary">{item.sop_limit}</span>
                            </p>
                            <p className={cn("text-xs font-bold", ok ? "text-success" : "text-danger")}>
                              Actual: {item.inspected_value}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Why not active — the honest explanation, never a blank screen */}
            {!hasData && (
              <Card>
                <CardHeader><CardTitle>Why compliance isn&apos;t active yet</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-[13px] leading-relaxed text-ink-secondary">
                    {overview?.message ??
                      "No compliance-related documents were detected among your uploads, so there is nothing to assess."}
                  </p>
                  {!!overview?.missing_documents.length && (
                    <div>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
                        Upload any of these to enable compliance analysis
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {overview.missing_documents.map((m) => (
                          <span key={m} className="rounded-ui-md border border-brand-line bg-brand-subtle px-2 py-0.5 text-[11px] font-semibold text-brand">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Side column */}
          <div className="space-y-4">
            <RegulationsPanel regs={overview?.applicable_regulations} />
            {hasData && <TimelinePanel events={overview?.timeline ?? []} />}

            {hasData && !!overview?.corrective_actions.length && (
              <Card>
                <CardHeader><CardTitle>Corrective actions</CardTitle></CardHeader>
                <CardContent>
                  <ol className="space-y-2">
                    {overview.corrective_actions.map((a, i) => (
                      <li key={i} className="flex gap-2.5">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warning-subtle text-[9px] font-bold text-warning">
                          {i + 1}
                        </span>
                        <p className="text-xs leading-relaxed text-ink-secondary">{a}</p>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            )}

            {!!overview?.detected_documents.length && (
              <Card>
                <CardHeader><CardTitle>Evidence base</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y divide-line">
                    {overview.detected_documents.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 px-4 py-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-ink" title={d.filename}>{d.filename}</p>
                          {d.category && <p className="text-[10px] text-ink-tertiary">{d.category}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {hasData && !!overview?.missing_documents.length && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-1.5">
                    <FileWarning className="h-3.5 w-3.5 text-warning" /> Gaps
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {overview.missing_documents.map((m) => (
                      <Badge key={m} tone="warning">{m}</Badge>
                    ))}
                  </div>
                  <p className="text-[11px] text-ink-tertiary">
                    These document types were not found. Their absence limits what can be verified.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </PageTransition>
  );
}

// ── Readiness ───────────────────────────────────────────────────────────────
function ReadinessPanel({
  readiness, hasData, score,
}: { readiness?: ModuleReadiness; hasData: boolean; score: number }) {
  const pct = Math.round((readiness?.score ?? 0) * 100);
  const tone = BAND_TONE[readiness?.band ?? "Insufficient"] ?? "neutral";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Compliance readiness</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tabular-nums text-ink">{pct}%</span>
          <Badge tone={tone}>{readiness?.band ?? "Insufficient"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: EASE }}
            className={cn("h-full", readiness?.active ? "bg-brand" : "bg-line-strong")}
          />
        </div>
        <p className="text-[13px] leading-relaxed text-ink-secondary">
          {readiness?.reason ??
            (hasData
              ? "Compliance is active for the standards found in your documents."
              : "Uploaded documents are operational records — no SOPs, audits, inspections or regulations detected.")}
        </p>
        {!hasData && readiness?.enable_hint && (
          <p className="flex items-start gap-1.5 text-xs font-semibold text-brand">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {readiness.enable_hint}
          </p>
        )}
        {!!readiness?.evidence?.length && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {readiness.evidence.slice(0, 4).map((e, i) => (
              <Badge key={i} tone="neutral">{e}</Badge>
            ))}
          </div>
        )}
        {hasData && (
          <p className="text-[11px] text-ink-tertiary">Overall compliance rating: {score}%</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Score ring ──────────────────────────────────────────────────────────────
function ScoreCard({
  score, risk, summary, passed, failed,
}: { score: number; risk: string; summary: string; passed: number; failed: number }) {
  const tone = scoreTone(score, true);
  const color = TONE_HEX[tone];
  const r = 38;
  const circ = 2 * Math.PI * r;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-5">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 90 90" className="h-full w-full -rotate-90">
            <circle cx="45" cy="45" r={r} fill="none" stroke="var(--color-subtle)" strokeWidth="8" />
            <motion.circle
              cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circ}
              initial={{ strokeDashoffset: circ }}
              animate={{ strokeDashoffset: circ * (1 - score / 100) }}
              transition={{ duration: 0.9, ease: EASE }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold tabular-nums" style={{ color }}>{score}%</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-sm font-bold text-ink">Compliance rating</h2>
            <Badge tone={tone}><ShieldAlert className="h-3 w-3" /> {risk} risk</Badge>
          </div>
          <p className="mb-2 text-xs leading-relaxed text-ink-secondary">{summary}</p>
          <div className="flex flex-wrap gap-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />{passed} passed
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-danger">
              <XCircle className="h-3.5 w-3.5" />{failed} deviations
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Findings (cross-document validation — the differentiator) ───────────────
function FindingsPanel({ findings }: { findings: ComplianceFinding[] }) {
  if (!findings.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cross-document findings</CardTitle>
        <span className="text-[11px] text-ink-tertiary">{findings.length}</span>
      </CardHeader>
      <CardContent className="p-0">
        <motion.ul variants={staggerContainer} initial="hidden" animate="show" className="divide-y divide-line">
          {findings.map((f, i) => {
            const tone = SEVERITY_TONE[f.severity] ?? FINDING_TONE[f.type] ?? "neutral";
            return (
              <motion.li key={i} variants={staggerItem} className="space-y-2 px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={tone}>{f.severity || f.type}</Badge>
                  <p className="text-[13px] font-bold text-ink">{f.title}</p>
                  {f.cross_document && <Badge tone="brand">Cross-doc</Badge>}
                  {f.overdue_days != null && f.overdue_days > 0 && (
                    <Badge tone="danger">{f.overdue_days}d overdue</Badge>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-ink-secondary">{f.description}</p>

                {!!f.evidence?.length && (
                  <div className="space-y-1">
                    {f.evidence.map((e, j) => (
                      <div key={j} className="rounded-ui-md border border-line bg-subtle px-2.5 py-1.5">
                        <p className="flex items-center gap-1 text-[10px] font-bold text-ink-tertiary">
                          <FileText className="h-2.5 w-2.5" /> {e.source_document}
                          {e.role ? ` · ${e.role}` : ""}
                        </p>
                        <p className="mt-0.5 text-[11px] italic leading-relaxed text-ink-secondary">
                          &ldquo;{e.snippet}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {f.recommendation && (
                  <p className="flex items-start gap-1.5 text-xs text-ink-secondary">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    {f.recommendation}
                  </p>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      </CardContent>
    </Card>
  );
}

// ── Regulations ─────────────────────────────────────────────────────────────
function RegulationsPanel({ regs }: { regs?: DetectedRegulation[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Applicable regulations</CardTitle>
        {!!regs?.length && <span className="text-[11px] text-ink-tertiary">{regs.length}</span>}
      </CardHeader>
      {!regs?.length ? (
        <EmptyState
          title="No standards detected"
          reason="None of your uploaded documents reference a recognised standard, so no regulation can be assessed."
        />
      ) : (
        <CardContent className="p-0">
          <ul className="divide-y divide-line">
            {regs.map((r) => (
              <li key={r.code} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-bold text-ink" title={r.name}>{r.name}</p>
                  <span className="shrink-0 text-[10px] font-bold text-ink-tertiary">
                    {Math.round(r.confidence * 100)}%
                  </span>
                </div>
                <p className="text-[10px] font-semibold text-ink-tertiary">{r.domain}</p>
                {r.snippet && (
                  <p className="mt-0.5 truncate text-[10px] italic text-ink-tertiary" title={r.snippet}>
                    &ldquo;{r.snippet}&rdquo;
                  </p>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────
function TimelinePanel({ events }: { events: ComplianceTimelineEvent[] }) {
  if (!events.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Compliance timeline</CardTitle></CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {events.map((e, i) => {
            const tone: Tone = e.status === "overdue" ? "danger" : "success";
            return (
              <li key={i} className="flex gap-2.5">
                <div className="flex flex-col items-center">
                  <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", tone === "danger" ? "bg-danger" : "bg-success")} />
                  {i < events.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-xs font-semibold text-ink">{e.event}</p>
                    <Badge tone={tone}>{e.status}</Badge>
                  </div>
                  <p className="text-[11px] text-ink-tertiary">
                    {e.date}
                    {e.source_document ? ` · ${e.source_document}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
