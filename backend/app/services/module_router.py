"""
Document-driven module routing.

The document decides which modules it belongs to — not the UI. For each
uploaded document we compute a confidence score per module (Maintenance,
Compliance, Knowledge Graph, Reports, AI Chat) from what was actually
extracted (its type, entities and detected regulations). Aggregated across a
user's corpus this yields, per module, a readiness score + the evidence behind
it + a plain-English reason and a hint for what to upload to enable it.

Everything here is derived from real signals — nothing is hardcoded per
document, nothing is invented.
"""
from typing import Dict, Any, List, Optional

from app.services.document_classifier import MAINTENANCE_CATEGORIES, COMPLIANCE_CATEGORIES

MODULES = ["maintenance", "compliance", "knowledge_graph", "reports", "chat"]

MODULE_LABELS = {
    "maintenance": "Maintenance",
    "compliance": "Compliance",
    "knowledge_graph": "Knowledge Graph",
    "reports": "Reports",
    "chat": "AI Chat",
}

# Graph entity types that count as maintenance evidence for a document.
_MAINT_ENTITY_TYPES = {
    "Machine", "Equipment", "Server", "Vehicle", "SparePart", "Facility",
    "Failure", "Incident", "Pump", "Motor", "Valve", "Compressor", "Turbine",
    "Generator", "Transformer", "Conveyor", "Sensor", "PLC", "Network Device",
    "Database", "Storage Cluster", "Plant", "Production Line", "Tool",
}


def score_document(category: Optional[str], entity_types: List[str],
                   regulations: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Per-document module confidence scores from real signals: the auto-detected
    category, the entity types extracted into the graph, and detected
    regulations. Reports and Chat are always available (they work on any
    document); the others require evidence.
    """
    cat = category or ""
    etypes = set(entity_types or [])
    has_maint_entities = bool(etypes & _MAINT_ENTITY_TYPES)
    has_entities = bool(etypes)
    has_regs = bool(regulations)

    maintenance = 0.0
    if cat in MAINTENANCE_CATEGORIES:
        maintenance = 0.9
    elif has_maint_entities:
        maintenance = 0.6           # assets present but not a maintenance-type doc
    elif cat:
        maintenance = 0.1

    compliance = 0.0
    if cat in COMPLIANCE_CATEGORIES:
        compliance = 0.9
    if has_regs:
        compliance = max(compliance, 0.85)
    if compliance == 0.0 and cat:
        compliance = 0.1

    return {
        "maintenance": round(maintenance, 2),
        "compliance": round(compliance, 2),
        "knowledge_graph": 0.95 if has_entities else 0.4,
        "reports": 0.8,   # reports can always summarize a document
        "chat": 1.0,      # chat can always answer over a document
    }


# ── Readiness thresholds ─────────────────────────────────────────────────────
_ACTIVE_THRESHOLD = 0.5   # a module is "active" for a corpus at/above this


def _band(score: float) -> str:
    if score >= 0.75:
        return "Strong"
    if score >= 0.5:
        return "Partial"
    if score >= 0.2:
        return "Weak"
    return "Insufficient"


def compute_readiness(documents_intelligence: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    Aggregate per-module readiness across a user's documents. Each
    `documents_intelligence` item is a document's stored `intelligence` dict
    ({"modules": {...}, "regulations": [...], "document_type": ...}). Returns,
    per module: {score, band, active, evidence[], reason, enable_hint}.
    """
    infos = [i for i in documents_intelligence if isinstance(i, dict)]
    total_docs = len(infos)

    readiness: Dict[str, Dict[str, Any]] = {}
    for module in MODULES:
        # Corpus score = the best single-document score for this module (one
        # strong document is enough to activate a module).
        scores = [float((i.get("modules") or {}).get(module, 0.0)) for i in infos]
        score = max(scores) if scores else 0.0
        contributing = sum(1 for s in scores if s >= _ACTIVE_THRESHOLD)

        readiness[module] = {
            "label": MODULE_LABELS[module],
            "score": round(score, 2),
            "band": _band(score),
            "active": score >= _ACTIVE_THRESHOLD,
            "contributing_documents": contributing,
            "evidence": [],
            "reason": "",
            "enable_hint": "",
        }

    # Module-specific evidence + reasons.
    all_regs = {}
    for i in infos:
        for r in i.get("regulations", []) or []:
            all_regs[r.get("code")] = r.get("name")
    doc_types = [i.get("document_type") for i in infos if i.get("document_type")]

    def has_any_category(cats):
        return any((i.get("document_type") in cats) for i in infos)

    # Maintenance
    m = readiness["maintenance"]
    if m["active"]:
        m["evidence"] = sorted({d for d in doc_types if d in MAINTENANCE_CATEGORIES}) or ["assets detected in documents"]
        m["reason"] = "Maintainable assets and/or maintenance documents were detected."
    else:
        m["reason"] = "No machines, maintenance logs, incidents or inspection reports detected."
        m["enable_hint"] = "Upload a maintenance log, machine manual, incident or inspection report."

    # Compliance
    c = readiness["compliance"]
    if c["active"]:
        ev = sorted({d for d in doc_types if d in COMPLIANCE_CATEGORIES})
        ev += [f"Regulation: {n}" for n in sorted(all_regs.values()) if n]
        c["evidence"] = ev or ["compliance-relevant content detected"]
        c["reason"] = "SOPs / audits / inspections or referenced regulations were detected."
    else:
        c["reason"] = "Uploaded documents are operational records — no SOPs, audits, inspections or regulations detected."
        c["enable_hint"] = "Upload an SOP, audit report, inspection report, safety procedure or a document that references a standard (e.g. ISO 9001)."

    # Knowledge Graph
    kg = readiness["knowledge_graph"]
    kg["reason"] = ("Entities were extracted into the graph." if kg["active"]
                    else "No entities could be extracted yet.")
    if not kg["active"]:
        kg["enable_hint"] = "Upload a document that names assets, people, organizations or locations."

    # Reports & Chat — always available.
    readiness["reports"].update({
        "reason": ("Reports can summarize your uploaded documents." if total_docs
                   else "Upload a document to generate reports."),
        "enable_hint": "" if total_docs else "Upload any document.",
    })
    readiness["chat"].update({
        "reason": ("AI Chat can answer questions over your documents." if total_docs
                   else "Upload a document to chat about it."),
        "enable_hint": "" if total_docs else "Upload any document.",
    })

    return readiness
