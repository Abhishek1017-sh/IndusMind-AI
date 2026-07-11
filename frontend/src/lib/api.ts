const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

function getHeaders(contentType = "application/json"): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("im_token") : null;
  const headers: Record<string, string> = {};
  if (contentType !== "multipart/form-data") headers["Content-Type"] = contentType;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "API error");
  }
  return res.json() as Promise<T>;
}

// ─── Auth ──────────────────────────────────────────────────────────────────
export interface LoginPayload { email: string; password: string; }
export interface AuthToken { access_token: string; token_type: string; role: string; email: string; name: string; }

export async function loginApi(payload: LoginPayload): Promise<AuthToken> {
  const res = await fetch(`${API_BASE}/auth/login-json`, {
    method: "POST", headers: getHeaders(), body: JSON.stringify(payload),
  });
  return handleResponse<AuthToken>(res);
}

export interface RegisterPayload { email: string; full_name: string; password: string; role?: string; }
export async function registerApi(payload: RegisterPayload): Promise<AuthToken> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST", headers: getHeaders(), body: JSON.stringify(payload),
  });
  return handleResponse<AuthToken>(res);
}

// ─── Documents ─────────────────────────────────────────────────────────────
export interface DocumentRecord {
  id: string; filename: string; file_type: string; file_size: number;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  error_message?: string; category?: string | null; uploaded_by: string; created_at: string;
}

export async function uploadDocument(file: File): Promise<DocumentRecord> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/documents/upload`, {
    method: "POST", headers: getHeaders("multipart/form-data"), body: form,
  });
  return handleResponse<DocumentRecord>(res);
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const res = await fetch(`${API_BASE}/documents/list`, { headers: getHeaders() });
  return handleResponse<DocumentRecord[]>(res);
}

export async function deleteDocument(id: string): Promise<void> {
  await fetch(`${API_BASE}/documents/delete/${id}`, { method: "DELETE", headers: getHeaders() });
}

// ─── Chat ──────────────────────────────────────────────────────────────────
export interface Citation { document_name: string; page_number?: number; text: string; }

export interface AgentLogStep {
  agent_name: string;
  status: string; // "COMPLETED" | "IN_PROGRESS" | "SKIPPED"
  log_message: string;
}

export interface TimelineEvent {
  time: string;
  event: string;
  status: string; // "normal" | "warning" | "ignored" | "failure" | "repair"
  detail: string;
}

export interface ChatResponse {
  response: string;
  citations: Citation[];
  graph_context: unknown[];
  confidence_score: number;
  reasoning_steps: string[];
  evidence_base: string[];
  timeline: TimelineEvent[];
  agent_logs: AgentLogStep[];
}

export async function sendChatMessage(message: string): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat/`, {
    method: "POST", headers: getHeaders(),
    body: JSON.stringify({ message, history: [] }),
  });
  return handleResponse<ChatResponse>(res);
}

// ─── Graph ─────────────────────────────────────────────────────────────────
export interface GraphNode {
  id: string; type: string;
  data: Record<string, unknown> & { label: string };
}
export interface GraphEdge { id: string; source: string; target: string; label: string; }
export interface GraphData { nodes: GraphNode[]; relationships: GraphEdge[]; }

export async function fetchGraph(): Promise<GraphData> {
  const res = await fetch(`${API_BASE}/graph/`, { headers: getHeaders() });
  return handleResponse<GraphData>(res);
}

export interface RecurringPattern { type: string; name: string; documents: string[]; doc_count: number; }

export async function fetchRecurringPatterns(): Promise<RecurringPattern[]> {
  const res = await fetch(`${API_BASE}/graph/patterns`, { headers: getHeaders() });
  const data = await handleResponse<{ patterns: RecurringPattern[] }>(res);
  return data.patterns;
}

// ─── Reports ───────────────────────────────────────────────────────────────
export interface ReportRecord {
  id: string; title: string; report_type: string;
  file_path: string; generated_by: string; created_at: string;
}
export async function generateReport(title: string, report_type: string): Promise<ReportRecord> {
  const res = await fetch(`${API_BASE}/reports/generate`, {
    method: "POST", headers: getHeaders(),
    body: JSON.stringify({ title, report_type }),
  });
  return handleResponse<ReportRecord>(res);
}
export async function listReports(): Promise<ReportRecord[]> {
  const res = await fetch(`${API_BASE}/reports/list`, { headers: getHeaders() });
  return handleResponse<ReportRecord[]>(res);
}
export function getReportDownloadUrl(id: string) {
  return `${API_BASE}/reports/download/${id}`;
}

// ─── Compliance ────────────────────────────────────────────────────────────
export async function runComplianceCheck(query: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/compliance/check?query=${encodeURIComponent(query)}`, {
    method: "POST", headers: getHeaders(),
  });
  return handleResponse<unknown>(res);
}

export interface ComplianceChecklistItem {
  parameter: string; sop_limit: string; inspected_value: string;
  status: "COMPLIANT" | "NON_COMPLIANT"; deviation: string;
}
export interface ComplianceOverview {
  has_data: boolean;
  message: string;
  compliance_score: number;
  risk_level: string;
  summary: string;
  passed_checks: number;
  failed_checks: number;
  checklist: ComplianceChecklistItem[];
  corrective_actions: string[];
  deviations: ComplianceChecklistItem[];
  detected_documents: { id: string; filename: string; category: string }[];
  category_counts: Record<string, number>;
  missing_documents: string[];
  citations: Citation[];
  confidence_score: number;
  generated_at: string;
}
export async function fetchComplianceOverview(): Promise<ComplianceOverview> {
  const res = await fetch(`${API_BASE}/compliance/overview`, { headers: getHeaders() });
  return handleResponse<ComplianceOverview>(res);
}

// ─── Maintenance ───────────────────────────────────────────────────────────
export interface MaintenanceAsset {
  id: string; type: string; name: string; doc_count: number;
  category: string | null;
  asset_type: string;
  group: string;
  confidence: number;
  confidence_band: string;
  reason: string;
  risk_level?: string;
  incident_count?: number;
  status?: string;
  location?: string | null;
  document_ids: string[];
  properties: Record<string, unknown>;
}

export interface MaintenanceKpis {
  total_assets: number;
  critical_assets: number;
  open_incidents: number;
  high_risk_assets: number;
  assets_missing_maintenance: number;
  assets_with_alerts: number;
}
export interface MaintenanceDoc { id: string; filename: string; category: string | null; status: string; created_at: string | null; }
export interface MaintenanceOverview {
  has_data: boolean;
  message: string;
  kpis: MaintenanceKpis;
  assets: MaintenanceAsset[];
  type_counts: Record<string, number>;
  asset_types: string[];
  asset_counts: Record<string, number>;
  category_counts: Record<string, number>;
  categories: string[];
  failures: MaintenanceAsset[];
  incidents: MaintenanceAsset[];
  vendors: MaintenanceAsset[];
  documents: MaintenanceDoc[];
  recent_incidents: MaintenanceDoc[];
  recurring_patterns: RecurringPattern[];
}
export async function fetchMaintenanceOverview(opts?: { q?: string; category?: string }): Promise<MaintenanceOverview> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.category) params.set("category", opts.category);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/maintenance/overview${qs ? `?${qs}` : ""}`, { headers: getHeaders() });
  return handleResponse<MaintenanceOverview>(res);
}

export interface RelatedGraphNode { id: string; type: string; name: string; relationship: string; direction: "incoming" | "outgoing"; }
export interface MaintenanceHistoryEntry { date: string; event: string; status: string; detail: string; source_document: string | null; }

export interface AssetRca {
  equipment_id: string; failure_mode: string; root_cause: string;
  chronology: string[]; timeline?: TimelineEvent[];
  contributing_factors: string[]; criticality: string; downtime_impact: string;
  spare_parts_involved: string[];
  maintenance_actions_taken: string[]; preventive_recommendations: string[];
  lessons_learned: string[]; confidence_score: number;
}

export interface AssetMetadataField {
  value: string;
  confidence: number | null;
  source_document: string | null;
  page_number: number | null;
  snippet: string | null;
}

export interface AssetIncident {
  id: string; title: string; severity: string | null; symptoms: string[];
  root_cause: string | null; impact: string | null; downtime: string | null;
  corrective_actions: string[]; preventive_actions: string[]; recommendations: string[];
  confidence: number | null; source_document: string | null;
}

export interface AssetDetail {
  asset: string;
  report: AssetRca;
  citations: Citation[];
  overview: {
    name: string;
    asset_type: string | null;
    category: string | null;
    type: string | null;
    confidence: number | null;
    confidence_band: string | null;
    risk_level: string | null;
    criticality: string | null;
    status: string | null;
    location: string | null;
    incident_count: number;
    persisted: boolean;
    properties: Record<string, unknown>;
    document_count: number;
    related_node_count: number;
  };
  metadata: Record<string, AssetMetadataField>;
  aliases: string[];
  incidents: AssetIncident[];
  related_documents: MaintenanceDoc[];
  related_graph_nodes: RelatedGraphNode[];
  maintenance_history: MaintenanceHistoryEntry[];
  recommendations: string[];
}
export async function fetchAssetDetail(assetName: string): Promise<AssetDetail> {
  const res = await fetch(`${API_BASE}/maintenance/asset/${encodeURIComponent(assetName)}`, { headers: getHeaders() });
  return handleResponse<AssetDetail>(res);
}
