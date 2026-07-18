"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle, CheckCircle2, ChevronDown, Clock, FileSpreadsheet, FileText,
  Image as ImageIcon, Loader2, RefreshCw, Trash2, Upload, X,
} from "lucide-react";

import { deleteDocument, listDocuments, uploadDocument, type DocumentRecord } from "@/lib/api";
import PageTransition from "@/components/motion/PageTransition";
import { EASE, expandCollapse, staggerContainer, staggerItem } from "@/components/motion/variants";
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, EmptyState,
  KpiTile, SkeletonRow, type Tone,
} from "@/components/ui";
import { cn } from "@/lib/utils";

/* The processing pipeline below reflects the REAL backend stages. The API
   reports a single overall status per document (PENDING / PROCESSING /
   COMPLETED / FAILED) — it does not report which stage is currently running.
   So stages are marked done only when the document is genuinely COMPLETED, and
   PROCESSING shows an indeterminate indicator. We never simulate stage timings. */
const PIPELINE = [
  "Text extraction",
  "Classification",
  "Chunking",
  "Vector embedding",
  "Entity & graph sync",
  "Module routing",
] as const;

const STATUS: Record<DocumentRecord["status"], { tone: Tone; label: string; icon: React.ElementType }> = {
  COMPLETED: { tone: "success", label: "Indexed", icon: CheckCircle2 },
  PROCESSING: { tone: "info", label: "Processing", icon: Loader2 },
  PENDING: { tone: "neutral", label: "Queued", icon: Clock },
  FAILED: { tone: "danger", label: "Failed", icon: AlertTriangle },
};

const EXT_ICON: Record<string, React.ElementType> = {
  pdf: FileText, doc: FileText, docx: FileText, txt: FileText,
  xls: FileSpreadsheet, xlsx: FileSpreadsheet, csv: FileSpreadsheet,
  png: ImageIcon, jpg: ImageIcon, jpeg: ImageIcon,
};

const ACCEPT = ".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.txt,.csv";

function relTime(iso?: string | null) {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(mins)) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [docToDelete, setDocToDelete] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [reloadKey, setReloadKey] = useState(0);

  /** Silent refetch — used by polling and after an upload (no skeleton flash). */
  const fetchDocs = useCallback(async () => {
    try {
      setDocs(await listDocuments());
      setLoadError(null);
    } catch {
      setLoadError("Couldn't reach the document service.");
    }
  }, []);

  /** Visible reload. setState lives in the handler, never in the effect body. */
  const refresh = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await listDocuments();
        if (!alive) return;
        setDocs(d);
        setLoadError(null);
      } catch {
        if (alive) setLoadError("Couldn't reach the document service.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  // Background polling keeps statuses fresh without flashing skeletons. Only
  // polls while something is actually in flight.
  const inFlight = useMemo(
    () => docs.some((d) => d.status === "PROCESSING" || d.status === "PENDING"),
    [docs]
  );
  useEffect(() => {
    if (!inFlight && uploading.length === 0) return;
    const t = setInterval(() => void fetchDocs(), 3000);
    return () => clearInterval(t);
  }, [inFlight, uploading.length, fetchDocs]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    for (const file of Array.from(files)) {
      setUploading((u) => [...u, file.name]);
      try {
        await uploadDocument(file);
        // Real status now comes from the backend via polling — no simulated stages.
        await fetchDocs();
      } catch (e) {
        setError(`Failed to upload ${file.name}: ${e instanceof Error ? e.message : "Unknown error"}`);
      } finally {
        setUploading((u) => u.filter((n) => n !== file.name));
      }
    }
  };

  const handleDelete = async () => {
    if (!docToDelete) return;
    setDeleting(true);
    try {
      await deleteDocument(docToDelete.id);
      setDocs((d) => d.filter((x) => x.id !== docToDelete.id));
      setDocToDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const stats = useMemo(() => {
    if (loadError) return { total: null, indexed: null, processing: null, failed: null };
    return {
      total: docs.length,
      indexed: docs.filter((d) => d.status === "COMPLETED").length,
      processing: docs.filter((d) => d.status === "PROCESSING" || d.status === "PENDING").length,
      failed: docs.filter((d) => d.status === "FAILED").length,
    };
  }, [docs, loadError]);

  return (
    <PageTransition className="space-y-4 p-5 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Documents</h1>
          <p className="mt-0.5 text-xs text-ink-secondary">
            Everything the platform knows is derived from these files.
          </p>
        </div>
        <Button size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Refresh
        </Button>
      </div>

      {/* KPIs */}
      <motion.div variants={staggerContainer} initial="hidden" animate="show"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <motion.div variants={staggerItem}><KpiTile label="Total" value={stats.total} icon={FileText} tone="brand" /></motion.div>
        <motion.div variants={staggerItem}><KpiTile label="Indexed" value={stats.indexed} sub="searchable" icon={CheckCircle2} tone="success" /></motion.div>
        <motion.div variants={staggerItem}><KpiTile label="In pipeline" value={stats.processing} icon={Clock} tone="info" /></motion.div>
        <motion.div variants={staggerItem}><KpiTile label="Failed" value={stats.failed} icon={AlertTriangle} tone={(stats.failed ?? 0) > 0 ? "danger" : "neutral"} /></motion.div>
      </motion.div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "cursor-pointer rounded-ui-xl border-2 border-dashed p-8 text-center transition-colors",
          dragging ? "border-brand bg-brand-subtle" : "border-line bg-surface hover:border-line-strong hover:bg-subtle"
        )}
      >
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden"
          onChange={(e) => void handleFiles(e.target.files)} />
        <div className={cn(
          "mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-ui-lg border transition-colors",
          dragging ? "border-brand-line bg-surface" : "border-line bg-subtle"
        )}>
          <Upload className={cn("h-5 w-5", dragging ? "text-brand" : "text-ink-tertiary")} />
        </div>
        <p className="text-sm font-semibold text-ink">
          {dragging ? "Drop to upload" : "Drag files here, or click to browse"}
        </p>
        <p className="mt-1 text-[11px] text-ink-tertiary">PDF · DOCX · XLSX · CSV · TXT · PNG · JPG</p>
      </div>

      {/* In-flight uploads (real: the file transfer itself) */}
      <AnimatePresence>
        {uploading.map((name) => (
          <motion.div key={name}
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE }}>
            <Card className="border-brand-line bg-brand-subtle">
              <CardContent className="flex items-center gap-2.5 py-2.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
                <p className="text-xs font-semibold text-brand">Uploading {name}…</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>

      {error && (
        <Card className="border-danger/30 bg-danger-subtle">
          <CardContent className="flex items-center gap-2.5 py-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
            <p className="flex-1 text-xs font-medium text-danger">{error}</p>
            <button onClick={() => setError("")} className="text-danger/70 hover:text-danger">
              <X className="h-3.5 w-3.5" />
            </button>
          </CardContent>
        </Card>
      )}

      {/* Library */}
      <Card>
        <CardHeader>
          <CardTitle>Library</CardTitle>
          {!loadError && <span className="text-[11px] text-ink-tertiary">{docs.length} files</span>}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="divide-y divide-line px-5">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
          ) : loadError ? (
            <EmptyState
              icon={AlertTriangle}
              title="Library unavailable"
              reason="The document service couldn't be reached, so your files can't be listed. This does not mean you have no documents."
              action={<Button size="sm" onClick={refresh}>Retry</Button>}
            />
          ) : docs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              reason="Nothing has been uploaded. Every module — chat, graph, maintenance and compliance — is built from these files."
              hint="Drop a file above to get started."
            />
          ) : (
            <ul className="divide-y divide-line">
              {docs.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  expanded={expanded === doc.id}
                  onToggle={() => setExpanded(expanded === doc.id ? null : doc.id)}
                  onDelete={() => setDocToDelete(doc)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <Dialog
        open={!!docToDelete}
        onOpenChange={(o) => !o && setDocToDelete(null)}
        title="Delete document?"
        description={
          <>
            <span className="font-semibold text-ink">{docToDelete?.filename}</span> will be removed, along with
            its chunks, embeddings and extracted graph entities. This cannot be undone.
          </>
        }
        footer={
          <>
            <Button size="sm" onClick={() => setDocToDelete(null)}>Cancel</Button>
            <Button size="sm" variant="danger" onClick={handleDelete} loading={deleting}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </>
        }
      />
    </PageTransition>
  );
}

// ── Row + pipeline ──────────────────────────────────────────────────────────
function DocumentRow({
  doc, expanded, onToggle, onDelete,
}: { doc: DocumentRecord; expanded: boolean; onToggle: () => void; onDelete: () => void }) {
  const s = STATUS[doc.status] ?? STATUS.PENDING;
  const StatusIcon = s.icon;
  const ext = (doc.file_type ?? "").toLowerCase();
  const FileIcon = EXT_ICON[ext] ?? FileText;
  const done = doc.status === "COMPLETED";
  const failed = doc.status === "FAILED";
  const active = doc.status === "PROCESSING";

  return (
    <li>
      <div className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-subtle">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-md border border-line bg-subtle">
            <FileIcon className="h-4 w-4 text-ink-tertiary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-ink">{doc.filename}</span>
            <span className="block truncate text-[11px] text-ink-tertiary">
              {(doc.file_size / 1024).toFixed(0)} KB · {ext.toUpperCase()}
              {doc.category ? ` · ${doc.category}` : ""}
              {doc.created_at ? ` · ${relTime(doc.created_at)}` : ""}
            </span>
          </span>
        </button>

        <Badge tone={s.tone}>
          <StatusIcon className={cn("h-3 w-3", active && "animate-spin")} />
          {s.label}
        </Badge>

        <button onClick={onToggle} className="p-1 text-ink-tertiary hover:text-ink">
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.15 }} className="block">
            <ChevronDown className="h-3.5 w-3.5" />
          </motion.span>
        </button>
        <button onClick={onDelete} title="Delete" className="p-1 text-ink-tertiary hover:text-danger">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div variants={expandCollapse} initial="collapsed" animate="expanded" exit="collapsed"
            className="overflow-hidden bg-subtle">
            <div className="space-y-2.5 px-5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
                Processing pipeline
              </p>

              {failed ? (
                <div className="rounded-ui-md border border-danger/25 bg-danger-subtle px-3 py-2">
                  <p className="text-xs font-semibold text-danger">Processing failed</p>
                  {doc.error_message && (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-danger/90">{doc.error_message}</p>
                  )}
                </div>
              ) : (
                <>
                  <ol className="flex flex-wrap gap-1.5">
                    {PIPELINE.map((stage) => (
                      <li key={stage}
                        className={cn(
                          "flex items-center gap-1.5 rounded-ui-md border px-2 py-1 text-[11px] font-semibold",
                          done
                            ? "border-success/25 bg-success-subtle text-success"
                            : "border-line bg-surface text-ink-tertiary"
                        )}>
                        {done
                          ? <CheckCircle2 className="h-3 w-3" />
                          : <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-info" : "bg-line-strong")} />}
                        {stage}
                      </li>
                    ))}
                  </ol>

                  {active && (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-line">
                      {/* Indeterminate: the API reports overall status only. */}
                      <motion.div
                        className="h-full w-1/3 rounded-full bg-info"
                        animate={{ x: ["-100%", "300%"] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                      />
                    </div>
                  )}

                  <p className="text-[11px] leading-relaxed text-ink-tertiary">
                    {done
                      ? "All stages complete — this document is searchable and feeds every module."
                      : active
                      ? "Processing. The service reports overall status only, so individual stage progress isn't shown rather than guessed."
                      : "Queued — processing hasn't started yet."}
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
