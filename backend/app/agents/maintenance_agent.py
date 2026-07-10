import logging
from typing import Dict, Any, List
import google.generativeai as genai
import json
from app.services.gemini_service import gemini_service, format_chunks_as_context, extractive_answer, not_found_message

logger = logging.getLogger(__name__)


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
