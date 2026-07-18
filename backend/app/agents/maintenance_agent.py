import re
import logging
from typing import Dict, Any, List
import google.generativeai as genai
import json
from app.services.gemini_service import gemini_service, format_chunks_as_context, extractive_answer, not_found_message

logger = logging.getLogger(__name__)

# Vocabulary that indicates a document actually contains MAINTENANCE evidence
# (failure/repair/inspection history) — as opposed to merely mentioning the
# asset in a business/marketing/architecture context. If none of these appear
# in the retrieved text, we refuse to invent an RCA and say so honestly.
_MAINTENANCE_EVIDENCE_TERMS = (
    "failure", "fault", "faulty", "breakdown", "malfunction", "root cause",
    "repair", "repaired", "replaced", "replacement", "serviced", "servicing",
    "maintenance", "work order", "downtime", "outage", "inspection", "inspected",
    "overhaul", "corrective", "preventive", "defect", "worn", "wear", "leak",
    "leakage", "vibration", "overheat", "corrosion", "seizure", "alarm",
    "fault code", "calibration", "lubrication", "spare part", "rca",
    "degradation", "anomaly", "trip", "tripped", "shutdown",
)


def _chunks_blob(chunks: List[Dict[str, Any]]) -> str:
    return " ".join((c.get("page_content") or "") for c in chunks).lower()


def _has_maintenance_evidence(chunks: List[Dict[str, Any]]) -> bool:
    blob = _chunks_blob(chunks)
    return any(term in blob for term in _MAINTENANCE_EVIDENCE_TERMS)


_STOPWORDS = {"the", "and", "for", "with", "what", "which", "does", "maintenance",
              "schedule", "asset", "give", "show", "tell", "about", "generate"}


def _chunks_mention_subject(query: str, chunks: List[Dict[str, Any]]) -> bool:
    """
    True if the retrieved chunks actually talk about the query's subject (share
    a meaningful term). Distinguishes "asset is mentioned but has no maintenance
    data" (→ honest no-evidence report) from "an irrelevant chunk was retrieved"
    (→ standard not-found handling).
    """
    blob = _chunks_blob(chunks)
    terms = [w for w in re.findall(r"[a-z0-9\-]+", query.lower())
             if len(w) >= 4 and w not in _STOPWORDS]
    return any(t in blob for t in terms)


class MaintenanceAgent:
    def __init__(self):
        self.active = gemini_service.active

    def generate_rca(self, query: str, context_chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Processes failure logs, manuals, and records retrieved from the user's own
        uploaded documents to build an RCA. Never fabricates a report — if no relevant
        content was retrieved, or Gemini is unavailable, falls back to a grounded,
        non-fabricated report built from the retrieved chunks only.
        """
        logger.info("MaintenanceAgent generating RCA for query: %r (%d context chunk(s))", query, len(context_chunks))

        if not context_chunks:
            logger.info("MaintenanceAgent: no context chunks retrieved, returning not-found report.")
            return self._not_found_rca(query)

        # Evidence gate: if the retrieved text actually talks about this asset
        # but contains no maintenance signal, do NOT run the LLM on it (that
        # produces business-text hallucinations like "API webhook latency" or
        # "upsell pitch"). Instead, honestly report that no maintenance history
        # exists for this asset. If the chunks don't even mention the subject,
        # fall through to the standard not-found handling below.
        if _chunks_mention_subject(query, context_chunks) and not _has_maintenance_evidence(context_chunks):
            logger.info("MaintenanceAgent: asset mentioned but no maintenance evidence; returning no-evidence report.")
            return self._no_evidence_rca(query)

        context_str = format_chunks_as_context(context_chunks)

        prompt = f"""
You are a senior reliability engineer building a formal Root Cause Analysis (RCA) report for a
failure described in the context below, for an owner who needs the complete picture in one
briefing. Use ONLY the context — never introduce equipment, dates, or facts that are not
present in it — but be exhaustive: pull in every relevant detail the context actually
contains (all timeline events, all actions taken, all recommendations), not just the first
one you find.

Retrieved Document Context:
---
{context_str}
---

User Query/Asset under investigation: {query}

Please formulate an RCA with the following sections, grounded strictly in the context above:
1. Equipment details and status under investigation.
2. Failure mode identification.
3. Chronological timeline of the failure (containing structured objects with time, event, status, and detail).
4. Underlying root cause (using 5-Whys methodology if applicable).
5. Contributing factors that made the failure more likely (operating conditions, deferred maintenance, etc.).
6. Criticality of this asset and the operational/downtime impact of the failure.
7. Spare parts or components involved in the failure or its repair.
8. Specific maintenance actions performed or proposed.
9. Long-term preventive maintenance recommendations (each concrete and actionable).
10. Lessons learned.
11. Confidence and explainability metrics.

If the context does not contain enough information for a section, use an empty list/string for it
rather than inventing details, and reflect the gap honestly in "root_cause".

Return your response in EXACT JSON format with these keys:
- "equipment_id": (string, e.g. "P-102", or "" if not present in context)
- "failure_mode": (string)
- "chronology": list of strings outlining events
- "timeline": list of objects, each containing:
  - "time": (string, e.g. "2026-05-08")
  - "event": (string, e.g. "Inspection")
  - "status": (string, one of: "normal", "warning", "ignored", "failure", "repair")
  - "detail": (string)
- "root_cause": (string)
- "contributing_factors": list of strings (empty list if none stated in context)
- "criticality": (string, one of: "Critical", "High", "Medium", "Low", or "" if not inferable from context)
- "downtime_impact": (string describing operational impact, or "" if not stated)
- "spare_parts_involved": list of strings of parts/components named in the context
- "maintenance_actions_taken": list of strings of actions performed
- "preventive_recommendations": list of strings for preventing recurrence
- "lessons_learned": list of strings
- "confidence_score": (float between 0.00 and 1.00)
- "reasoning_steps": list of strings detailing reasoning logic
- "evidence_base": list of strings detailing supporting documents and observations

Do not wrap in markdown or add explanations outside the JSON block.
"""

        try:
            if not self.active:
                logger.info("MaintenanceAgent: Gemini unavailable, building extractive summary RCA.")
                return self._extractive_rca(query, context_chunks)

            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            data = json.loads(response.text.strip())
            # Gemini may omit optional sections; guarantee every key exists so
            # downstream consumers never have to guard each field.
            return {**self._rca_defaults(), **data}
        except Exception as e:
            logger.error(f"MaintenanceAgent RCA generation failed: {e}. Falling back to extractive summary.")
            return self._extractive_rca(query, context_chunks)

    @staticmethod
    def _rca_defaults() -> Dict[str, Any]:
        return {
            "equipment_id": "",
            "failure_mode": "",
            "chronology": [],
            "timeline": [],
            "root_cause": "",
            "contributing_factors": [],
            "criticality": "",
            "downtime_impact": "",
            "spare_parts_involved": [],
            "maintenance_actions_taken": [],
            "preventive_recommendations": [],
            "lessons_learned": [],
            "confidence_score": 0.0,
            "reasoning_steps": [],
            "evidence_base": [],
            "no_maintenance_evidence": False,
        }

    def _no_evidence_rca(self, query: str) -> Dict[str, Any]:
        """
        Honest report for an asset that is mentioned in the documents but has no
        maintenance evidence (no repair logs, work orders or failure history).
        Better than inventing failures — the AI states what it does not know.
        """
        return {
            **self._rca_defaults(),
            "failure_mode": "No maintenance evidence found for this asset.",
            "root_cause": (
                "Maintenance history unavailable. The uploaded documents mention this asset "
                "but contain no repair logs, work orders, inspection records or failure history "
                "for it, so no root-cause analysis can be produced. Predictions are limited "
                "because operational maintenance data is not present in the source documents."
            ),
            "reasoning_steps": [
                "Retrieved the documents referencing this asset.",
                "Scanned for maintenance evidence (failures, repairs, work orders, inspections, downtime).",
                "None found — refusing to fabricate an RCA from non-maintenance text.",
            ],
            "no_maintenance_evidence": True,
            "confidence_score": 0.0,
        }

    def _not_found_rca(self, query: str) -> Dict[str, Any]:
        message = not_found_message(query)
        return {
            "equipment_id": "",
            "failure_mode": message,
            "chronology": [],
            "timeline": [],
            "root_cause": message,
            "contributing_factors": [],
            "criticality": "",
            "downtime_impact": "",
            "spare_parts_involved": [],
            "maintenance_actions_taken": [],
            "preventive_recommendations": [],
            "lessons_learned": [],
            "confidence_score": 0.0,
            "reasoning_steps": ["No matching content was retrieved from the uploaded documents."],
            "evidence_base": []
        }

    def _extractive_rca(self, query: str, context_chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Non-fabricated fallback used when Gemini is unavailable — builds a concise
        extractive summary from the retrieved chunks (never a raw excerpt dump,
        and never hardcoded/demo content).
        """
        summary, citations = extractive_answer(query, context_chunks)
        if not citations:
            return self._not_found_rca(query)
        return {
            "equipment_id": "",
            "failure_mode": "AI reasoning unavailable — see summary below.",
            "chronology": [],
            "timeline": [],
            "root_cause": f"AI reasoning is currently unavailable. Summary from your uploaded documents: {summary}",
            "contributing_factors": [],
            "criticality": "",
            "downtime_impact": "",
            "spare_parts_involved": [],
            "maintenance_actions_taken": [],
            "preventive_recommendations": [],
            "lessons_learned": [],
            "confidence_score": 0.3,
            "reasoning_steps": [
                "Retrieved matching content from uploaded documents.",
                "Gemini reasoning unavailable — returning an extractive summary instead of a structured RCA."
            ],
            "evidence_base": sorted({c["document_name"] for c in citations})
        }


maintenance_agent = MaintenanceAgent()
