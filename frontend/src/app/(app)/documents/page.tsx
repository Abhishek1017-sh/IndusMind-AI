"use client";

import { useCallback, useState, useEffect } from "react";
import { listDocuments, uploadDocument, deleteDocument, type DocumentRecord } from "@/lib/api";
import { Upload, FileText, Trash2, CheckCircle2, Clock, AlertTriangle, RefreshCw, X, Sparkles, ShieldAlert } from "lucide-react";
import { DocumentPipelineLoader, SkeletonTable } from "@/components/loaders/SkeletonLoader";

function StatusBadge({ status }: { status: DocumentRecord["status"] }) {
  const cfg = {
    COMPLETED:  { icon: CheckCircle2, color: "#16A34A", bg: "#DCFCE7",  label: "Indexed"    },
    PROCESSING: { icon: Clock,        color: "#D97706", bg: "#FEF3C7",  label: "Processing" },
    PENDING:    { icon: Clock,        color: "#2563EB", bg: "#DBEAFE",  label: "Queued"     },
    FAILED:     { icon: AlertTriangle,color: "#DC2626", bg: "#FEE2E2",   label: "Failed"     },
  };
  const { icon: Icon, color, bg, label } = cfg[status] ?? cfg.PENDING;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold" style={{ background: bg, color }}>
      <Icon className="w-3 h-3" />{label}
    </span>
  );
}

const TYPE_COLORS: Record<string, string> = {
  pdf: "#DC2626", xlsx: "#16A34A", xls: "#16A34A",
  docx: "#2563EB", doc: "#2563EB", cad: "#06B6D4", dwg: "#06B6D4",
  png: "#F59E0B", jpg: "#F59E0B", jpeg: "#F59E0B",
  txt: "#64748B", csv: "#7C3AED",
};

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [docToDelete, setDocToDelete] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadStage, setUploadStage] = useState(-1);
  const [uploadingFilename, setUploadingFilename] = useState("");


  const fetchDocs = useCallback((showSkeleton = true) => {
    if (showSkeleton) setLoading(true);
    listDocuments()
      .then(setDocs)
      .catch(console.error)
      .finally(() => {
        if (showSkeleton) setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchDocs(true);
  }, [fetchDocs]);

  useEffect(() => {
    // Passive background polling to auto-update statuses without flashing skeletons
    const interval = setInterval(() => {
      fetchDocs(false);
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchDocs]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError("");
    const fileArr = Array.from(files);
    for (const file of fileArr) {
      setUploadingFilename(file.name);
      setUploading(u => [...u, file.name]);
      setUploadStage(0); // Uploading File
      try {
        await uploadDocument(file);
        
        // Step through OCR, Entity, Graph, Vector steps smoothly
        const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
        setUploadStage(1); // OCR Processing
        await delay(350);
        setUploadStage(2); // Entity Extraction
        await delay(300);
        setUploadStage(3); // Relationship Detection
        await delay(300);
        setUploadStage(4); // Knowledge Graph Generation
        await delay(350);
        setUploadStage(5); // Vector Embedding
        await delay(300);
        setUploadStage(6); // Indexing Documents
        await delay(350);
        setUploadStage(7); // AI Ready
        await delay(300);
        
        await fetchDocs();
      } catch (e: unknown) {
        setError(`Failed to upload ${file.name}: ${e instanceof Error ? e.message : "Unknown error"}`);
      } finally {
        setUploading(u => u.filter(n => n !== file.name));
        setUploadStage(-1);
        setUploadingFilename("");
      }
    }
  };

  const handleDelete = async () => {
    if (!docToDelete) return;
    setDeleting(true);
    try {
      await deleteDocument(docToDelete.id);
      setDocs(d => d.filter(doc => doc.id !== docToDelete.id));
      setDocToDelete(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };


  return (
    <div className="p-6 md:p-8 space-y-6 bg-[#FAFAF8]">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">Universal Document Intelligence</h1>
        <p className="text-xs text-[#64748B] font-semibold mt-1">
          Upload and index equipment manuals, CAD schematics, SOP sheets, raw telemetry logs, and emails.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Uploads", value: docs.length, color: "#2563EB" },
          { label: "Indexed & Searchable", value: docs.filter(d => d.status === "COMPLETED").length, color: "#16A34A" },
          { label: "Queued / Processing", value: docs.filter(d => d.status === "PROCESSING" || d.status === "PENDING").length, color: "#F59E0B" },
          { label: "Failed Pipelines", value: docs.filter(d => d.status === "FAILED").length, color: "#DC2626" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm transition-all actionable-card">
            <p className="text-2xl font-extrabold text-[#0F172A]" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-[#64748B] font-bold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Main Drag-Drop & Split View */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Dragzone and Table list */}
        <div className="xl:col-span-2 space-y-6">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => document.getElementById("fileInput")?.click()}
            className="relative rounded-2xl p-8 text-center cursor-pointer border-2 border-dashed border-[#E2E8F0] hover:border-blue-600 bg-white hover:bg-slate-50/50 transition-all overflow-hidden"
          >
            <input id="fileInput" type="file" multiple className="hidden"
              accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.txt,.csv"
              onChange={e => handleFiles(e.target.files)} />
            
            {/* Green horizontal scanner scanline */}
            {uploadStage >= 0 && (
              <div className="laser-scan-line" />
            )}

            <Upload className="w-10 h-10 mx-auto mb-3 text-blue-600" />
            <p className="text-xs font-bold text-[#0F172A]">Drop factory records here or <span className="text-blue-600 hover:underline">browse files</span></p>
            <p className="text-[10px] text-[#64748B] font-semibold mt-1">Supports PDF, DOCX, P&amp;ID schematics, CAD prints, Excel databases — Max 50MB</p>
            
            {/* Simulated pipeline steps badge */}
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-[9px] font-bold">
              <span className={`px-2.5 py-0.5 border rounded transition-all duration-300 ${
                uploadStage === 1
                  ? "bg-green-50 border-green-500 text-green-600 scale-105 animate-pulse shadow-sm"
                  : uploadStage > 1
                  ? "bg-green-50/50 border-green-200 text-green-600 font-extrabold"
                  : "bg-[#F1F5F9] border-[#E2E8F0] text-[#64748B]"
              }`}>
                1. OCR Processing
              </span>
              <span className={`px-2.5 py-0.5 border rounded transition-all duration-300 ${
                uploadStage === 2
                  ? "bg-green-50 border-green-500 text-green-600 scale-105 animate-pulse shadow-sm"
                  : uploadStage > 2
                  ? "bg-green-50/50 border-green-200 text-green-600 font-extrabold"
                  : "bg-[#F1F5F9] border-[#E2E8F0] text-[#64748B]"
              }`}>
                2. Entity Extraction
              </span>
              <span className={`px-2.5 py-0.5 border rounded transition-all duration-300 ${
                uploadStage === 3
                  ? "bg-green-50 border-green-500 text-green-600 scale-105 animate-pulse shadow-sm"
                  : uploadStage > 3
                  ? "bg-green-50/50 border-green-200 text-green-600 font-extrabold"
                  : "bg-[#F1F5F9] border-[#E2E8F0] text-[#64748B]"
              }`}>
                3. Relation Detection
              </span>
              <span className={`px-2.5 py-0.5 border rounded transition-all duration-300 ${
                (uploadStage >= 4 && uploadStage <= 5)
                  ? "bg-green-50 border-green-500 text-green-600 scale-105 animate-pulse shadow-sm"
                  : uploadStage > 5
                  ? "bg-green-50/50 border-green-200 text-green-600 font-extrabold"
                  : "bg-[#F1F5F9] border-[#E2E8F0] text-[#64748B]"
              }`}>
                4. Graph Embeddings
              </span>
            </div>

            {/* Uploading progress indicators */}
            {uploadStage >= 0 && (
              <div className="mt-4 text-left">
                <DocumentPipelineLoader activeStage={uploadStage} filename={uploadingFilename} />
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-3 px-4 py-3 border border-red-200 bg-red-50 rounded-xl text-xs text-red-700 font-semibold">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError("")} className="cursor-pointer bg-transparent border-0"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Document list table */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">Uploaded Files</h2>
              <button onClick={() => fetchDocs(true)} className="text-[#64748B] hover:text-[#0F172A] cursor-pointer bg-transparent border-0">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {loading ? (
              <SkeletonTable rows={5} />
            ) : docs.length === 0 ? (
              <div className="p-10 text-center">
                <FileText className="w-8 h-8 mx-auto mb-3 text-[#94A3B8]" />
                <p className="text-xs font-bold text-[#64748B]">No documents uploaded yet.</p>
                <p className="text-[10px] text-[#94A3B8] mt-1 font-semibold">Upload an operating standard above to start embedding plant indexes.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {docs.map(doc => {
                  const ext = doc.file_type.toLowerCase();
                  const color = TYPE_COLORS[ext] ?? "#64748B";
                  const isProcessing = doc.status === "PROCESSING" || doc.status === "PENDING";
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-[#F8FAFC] transition-colors group relative overflow-hidden"
                    >
                      {/* Laser scanner active line overlay for processing files */}
                      {isProcessing && (
                        <div className="laser-scan-line" />
                      )}

                      <div className="flex items-center gap-3 min-w-0 z-10">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: `${color}10`, border: `1.5px solid ${color}20` }}>
                          <FileText className="w-4 h-4" style={{ color }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#0F172A] truncate">{doc.filename}</p>
                          <p className="text-[10px] text-[#64748B] font-semibold mt-0.5">
                            {(doc.file_size / 1024).toFixed(0)} KB · {ext.toUpperCase()} · {new Date(doc.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 flex-shrink-0 z-10">
                        <StatusBadge status={doc.status} />
                        <button
                          onClick={(e) => { e.stopPropagation(); setDocToDelete(doc); }}
                          className="opacity-0 group-hover:opacity-100 text-[#64748B] hover:text-red-600 transition-opacity p-1 cursor-pointer bg-transparent border-0"
                          title="Delete document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Quick AI Query Shortcuts */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4 transition-all actionable-card">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-600" /> Quick AI Query Shortcuts
            </h3>
            <a href="/chat" className="text-xs text-blue-600 hover:underline font-bold">Open Chat →</a>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {[
              "Summarize all uploaded documents",
              "What SOPs are available for pump maintenance?",
              "List all compliance standards in my documents",
              "What equipment is mentioned in my files?",
              "Show failure records extracted from documents",
              "What inspection procedures are documented?",
            ].map(q => (
              <a
                key={q}
                href={`/chat?q=${encodeURIComponent(q)}`}
                className="flex items-center gap-3 px-3.5 py-3 border border-[#E2E8F0] hover:border-blue-300 rounded-xl text-xs text-[#64748B] hover:text-[#0F172A] bg-[#FAFAF8] hover:bg-[#F1F5F9] transition-all font-semibold group cursor-pointer focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10 outline-none"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0 group-hover:bg-blue-600 transition-colors" />
                {q}
              </a>
            ))}
          </div>

          <div className="border-t border-[#E2E8F0] pt-4">
            <p className="text-[10px] text-[#94A3B8] font-semibold leading-relaxed">
              Clicking a shortcut opens the AI Copilot with that query pre-filled. Answers are grounded using your uploaded documents via RAG retrieval.
            </p>
          </div>
        </div>
      </div>

      {/* ── Delete Confirmation Modal ── */}
      {docToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !deleting && setDocToDelete(null)}
          />

          {/* Modal card */}
          <div className="relative bg-white rounded-2xl shadow-2xl border border-red-100 w-full max-w-md p-7 animate-in fade-in zoom-in-95 duration-200">
            {/* Close button */}
            <button
              onClick={() => setDocToDelete(null)}
              disabled={deleting}
              className="absolute top-4 right-4 text-[#94A3B8] hover:text-[#0F172A] transition-colors cursor-pointer disabled:opacity-50 bg-transparent border-0"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon (pulsing red warning badge) */}
            <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mb-5 mx-auto relative">
              <span className="absolute inset-0 rounded-full bg-red-500/10 animate-ping opacity-75" />
              <ShieldAlert className="w-6 h-6 text-red-600 relative z-10" />
            </div>

            {/* Heading */}
            <h2 className="text-base font-extrabold text-[#0F172A] text-center mb-1">Delete Document?</h2>
            <p className="text-xs text-[#64748B] font-semibold text-center mb-5 leading-relaxed">
              This will permanently remove
              <span className="block text-[#0F172A] font-bold mt-1 truncate px-4">
                &ldquo;{docToDelete.filename}&rdquo;
              </span>
              along with its vector index and all extracted knowledge graph nodes. This action <span className="text-red-600">cannot be undone</span>.
            </p>

            {/* Metadata chips */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="px-2.5 py-1 bg-red-50 border border-red-100 rounded-lg text-[10px] font-extrabold text-red-600 uppercase tracking-wider">
                {docToDelete.file_type.toUpperCase()}
              </span>
              <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600">
                {(docToDelete.file_size / 1024).toFixed(0)} KB
              </span>
              <span className="px-2.5 py-1 bg-green-50 border border-green-100 rounded-lg text-[10px] font-extrabold text-green-600 tracking-wider">
                {docToDelete.status.toUpperCase()}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setDocToDelete(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#E2E8F0] text-xs font-bold text-[#64748B] hover:bg-[#F8FAFC] transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 border-0"
              >
                {deleting ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <><Trash2 className="w-3.5 h-3.5" /> Yes, Delete</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
