import logging
from typing import Dict, Any, List
import google.generativeai as genai

from app.services.vector_store import vector_store
from app.services.graph_db import graph_db
from app.services.gemini_service import gemini_service
from app.agents.compliance_agent import compliance_agent
from app.agents.maintenance_agent import maintenance_agent
from app.agents.knowledge_agent import knowledge_agent

logger = logging.getLogger(__name__)


# Query keywords that indicate the user is asking to enumerate a whole category
# of entities (e.g. "what skills are mentioned") rather than look up one named
# entity — mapped to the graph node type(s) they should pull in.
_CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "Skill": ["skill", "skills", "technology", "technologies", "programming language"],
    "Organization": ["organization", "organizations", "organisation", "company", "companies", "employer"],
    "Project": ["project", "projects"],
    "Person": ["person", "people", "contact", "contacts"],
    "Date": ["date", "dates", "timeline"],
    "Event": ["event", "events"],
}


def _graph_entity_context(query: str, user_id: str) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Finds knowledge-graph nodes relevant to this query — either a specific named
    entity mentioned in the query text, or (for "what skills/organizations/etc.
    are mentioned" style questions) every node of the matching category — and
    returns:
      - graph_triples: (source, label, target) triples for the matched nodes'
        immediate neighborhood, to feed into the Gemini prompt as context.
      - graph_visual_context: the matched neighborhood (or the whole graph, if
        nothing matched) for the frontend graph view.

    Only nodes owned by `user_id` are ever considered (see
    graph_db.get_owned_graph) — entities from another user's documents, and
    any ownerless orphan/demo data, never leak into this user's answers.

    This generalizes beyond the old industrial equipment-ID-only regex match —
    any extracted entity (Person, Organization, Skill, Project, Machine, etc.)
    can be matched, so retrieval works the same for a resume or a ticket as it
    does for a maintenance record.
    """
    owned_graph = graph_db.get_owned_graph(user_id)
    owned_nodes = owned_graph["nodes"]
    all_edges = owned_graph["relationships"]

    query_lower = query.lower()
    matched_ids = set()
    for node in owned_nodes:
        data = node.get("data", {})
        name = str(data.get("name") or data.get("id") or "")
        if len(name) >= 3 and name.lower() in query_lower:
            matched_ids.add(node["id"])

    # Category-style questions ("what skills are mentioned?") pull in every
    # owned node of the relevant type(s), capped to keep the context concise.
    for node_type, keywords in _CATEGORY_KEYWORDS.items():
        if any(kw in query_lower for kw in keywords):
            type_matches = [n["id"] for n in owned_nodes if n.get("type") == node_type][:20]
            matched_ids.update(type_matches)

    graph_triples = []
    related_ids = set(matched_ids)
    if matched_ids:
        nodes_by_id = {n["id"]: n for n in owned_nodes}
        for edge in all_edges:
            if edge["source"] in matched_ids or edge["target"] in matched_ids:
                related_ids.add(edge["source"])
                related_ids.add(edge["target"])
                src, tgt = nodes_by_id.get(edge["source"]), nodes_by_id.get(edge["target"])
                if src and tgt:
                    graph_triples.append({
                        "source": f"{src['type']}: {src['data'].get('name', src['data'].get('id'))}",
                        "label": edge["label"],
                        "target": f"{tgt['type']}: {tgt['data'].get('name', tgt['data'].get('id'))}"
                    })
        graph_visual_context = {
            "nodes": [n for n in owned_nodes if n["id"] in related_ids],
            "relationships": [e for e in all_edges if e["source"] in related_ids and e["target"] in related_ids]
        }
    else:
        graph_visual_context = {"nodes": owned_nodes, "relationships": all_edges}

    return graph_triples, graph_visual_context


def _citations_from_chunks(chunks: List[Dict[str, Any]], note: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Builds citation entries from the chunks actually retrieved for this query,
    instead of a fixed placeholder citation. Never references documents that
    weren't actually retrieved.
    """
    citations = []
    seen = set()
    for chunk in chunks[:limit]:
        meta = chunk.get("metadata", {})
        filename = meta.get("filename", "Unknown Document")
        if filename in seen:
            continue
        seen.add(filename)
        content = (chunk.get("page_content") or "").strip()
        citations.append({
            "document_name": filename,
            "page_number": meta.get("chunk_index"),
            "text": note if not content else (content[:200] + ("..." if len(content) > 200 else ""))
        })
    return citations


class PlannerAgent:
    def __init__(self):
        self.active = gemini_service.active

    def classify_intent(self, query: str) -> str:
        """
        Classifies user query into COMPLIANCE, MAINTENANCE, KNOWLEDGE, REPORTS, or GENERAL_QA.
        """
        if not self.active:
            q = query.lower()
            if "report" in q or "export" in q or "pdf" in q:
                return "REPORTS"
            elif any(x in q for x in ["comply", "compliance", "audit", "standard", "regulation"]):
                return "COMPLIANCE"
            elif any(x in q for x in ["sop", "manual", "guideline", "oem", "procedure"]):
                return "KNOWLEDGE"
            elif any(x in q for x in ["rca", "fail", "broken", "cause", "trouble", "suggest", "prevent", "maintenance"]):
                return "MAINTENANCE"
            return "GENERAL_QA"

        prompt = f"""
You are the central Planner Agent for the Industrial AI Brain platform.
Your task is to classify the user's query into one of five operational routing categories:

1. "COMPLIANCE": Queries asking to check compliance of work, inspect audits, compare logs against SOPs, or assess regulatory scores.
2. "MAINTENANCE": Queries requesting Root Cause Analysis (RCA), failure mode troubleshooting, maintenance history lookups, or repair details.
3. "KNOWLEDGE": Queries asking directly for manuals, SOP details, guidelines, or OEM documentation sections (e.g. "Show me the SOP for misalignment limits").
4. "REPORTS": Queries explicitly asking to generate, export, download, or compile PDF reports.
5. "GENERAL_QA": General engineering questions, standard RAG lookup, or general text search.

Query: "{query}"

Output ONLY the category name ("COMPLIANCE", "MAINTENANCE", "KNOWLEDGE", "REPORTS", or "GENERAL_QA"). Do not write any other text.
"""
        try:
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(prompt)
            classification = response.text.strip().upper()
            if classification in ["COMPLIANCE", "MAINTENANCE", "KNOWLEDGE", "REPORTS", "GENERAL_QA"]:
                return classification
            # Fallback regex search
            for cat in ["COMPLIANCE", "MAINTENANCE", "KNOWLEDGE", "REPORTS", "GENERAL_QA"]:
                if cat in classification:
                    return cat
            return "GENERAL_QA"
        except Exception as e:
            logger.error(f"Intent classification failed: {e}")
            return "GENERAL_QA"

    def handle_query(self, query: str, user_id: str, db: Any = None) -> Dict[str, Any]:
        """
        Orchestration flow:
        1. Classifies intent.
        2. Retrieves RAG vector chunks (restricted to this user's own uploaded
           documents) and graph neighborhood.
        3. Invokes specific agent.
        4. Injects agent log trace steps for the frontend Agent Activity log.
        5. Formulates structured response conforming to the ChatResponse schema.

        `db` is the request's SQLAlchemy session, reused by the hybrid retriever
        for its PostgreSQL full-text / BM25 passes (see vector_store.search).
        """
        logger.info(f"Planner Agent received query: {query} (user_id={user_id})")

        agent_logs = [
            {"agent_name": "Planner Agent", "status": "COMPLETED", "log_message": "Classified user query intent."}
        ]

        # 1. Classify
        intent = self.classify_intent(query)
        logger.info(f"Classified query intent: {intent}")

        # 2. Retrieve Context (Hybrid RAG): FAISS + keyword chunks (see
        # vector_store.search) scoped to this user's own documents, plus any
        # knowledge-graph entities mentioned by name in the query.
        agent_logs.append({"agent_name": "Retriever Service", "status": "COMPLETED", "log_message": "Fetched hybrid FAISS + PostgreSQL full-text + BM25 chunks and knowledge graph entities."})
        # Hybrid retrieval (FAISS semantic + PostgreSQL FTS + BM25), alias-expanded
        # and reranked with RRF. Retrieve the Top 10 so a thorough question gets
        # enough material; the answer agents then send only the best 5 to Gemini
        # (see gemini_service.format_chunks_as_context).
        vector_chunks = vector_store.search(query, k=10, user_id=user_id, db=db)
        graph_triples, graph_visual_context = _graph_entity_context(query, user_id)

        # 3. Route & Process
        result = self._route(intent, query, vector_chunks, graph_triples, graph_visual_context, agent_logs)

        # Expose the classified intent so the chat endpoint can act on it
        # (e.g. actually generate a report for a REPORTS request). Not part of
        # the ChatResponse schema — consumed server-side only.
        result["intent"] = intent

        retrieved_docs = sorted({c.get("metadata", {}).get("filename", "Unknown Document") for c in vector_chunks})
        graph_node_count = len(result.get("graph_context") or [])
        logger.info(
            "Query summary | question=%r | agent=%s | gemini_active=%s | retrieved_chunks=%d %s | graph_nodes=%d | response_preview=%r",
            query, intent, gemini_service.active, len(vector_chunks), retrieved_docs, graph_node_count,
            (result.get("response") or "")[:200]
        )
        return result

    def _route(
        self,
        intent: str,
        query: str,
        vector_chunks: List[Dict[str, Any]],
        graph_triples: List[Dict[str, Any]],
        graph_visual_context: Any,
        agent_logs: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        if intent == "COMPLIANCE":
            agent_logs.append({"agent_name": "Compliance Agent", "status": "COMPLETED", "log_message": "Auditing parameters and tolerance limits found in the retrieved documents."})
            report = compliance_agent.evaluate_compliance(query, vector_chunks)

            if not vector_chunks:
                markdown_response = report.get("summary", "No relevant information was found in the uploaded documents.")
            else:
                markdown_response = f"### Compliance Audit Score: {report.get('compliance_score')}%\n\n"
                markdown_response += f"**Summary:** {report.get('summary')}\n\n"
                if report.get("checklist"):
                    markdown_response += "#### Compliance Parameter Checklists:\n"
                    for item in report.get("checklist", []):
                        icon = "✅" if item.get("status") == "COMPLIANT" else "❌"
                        markdown_response += f"- {icon} **{item.get('parameter')}**: Inspected `{item.get('inspected_value')}` vs SOP limits `{item.get('sop_limit')}`. (Deviation: {item.get('deviation')})\n"
                if report.get("corrective_actions"):
                    markdown_response += "\n#### Corrective Actions Recommended:\n"
                    for action in report.get("corrective_actions", []):
                        markdown_response += f"1. {action}\n"

            # Only cite chunks when the agent actually found relevant content
            # (confidence_score > 0) — otherwise a document that was merely
            # retrieved by a loose keyword match, but explicitly judged
            # irrelevant by the not-found path, would be shown as "evidence"
            # for an answer that says no information was found.
            cited_chunks = vector_chunks if report.get("confidence_score", 0.0) > 0 else []
            return {
                "response": markdown_response,
                "citations": _citations_from_chunks(cited_chunks, "Compliance-relevant excerpt from uploaded document."),
                "graph_context": graph_visual_context.get("nodes", []) if isinstance(graph_visual_context, dict) else [],
                "confidence_score": report.get("confidence_score", 0.0),
                "reasoning_steps": report.get("reasoning_steps", []),
                "evidence_base": report.get("evidence_base", []),
                "timeline": [],
                "agent_logs": agent_logs
            }

        elif intent == "MAINTENANCE":
            agent_logs.append({"agent_name": "Maintenance Agent", "status": "COMPLETED", "log_message": "Running Root Cause Analysis (RCA) from the retrieved documents."})
            report = maintenance_agent.generate_rca(query, vector_chunks)

            if not vector_chunks:
                markdown_response = report.get("root_cause", "No relevant information was found in the uploaded documents.")
            else:
                markdown_response = f"### Root Cause Analysis (RCA) - Asset: {report.get('equipment_id') or 'Unknown'}\n\n"
                markdown_response += f"**Primary Failure Mode:** {report.get('failure_mode')}\n\n"
                markdown_response += f"**Root Cause Diagnosis:** {report.get('root_cause')}\n\n"
                if report.get("chronology"):
                    markdown_response += "#### Chronological Events Timeline:\n"
                    for item in report.get("chronology", []):
                        markdown_response += f"- {item}\n"
                if report.get("maintenance_actions_taken"):
                    markdown_response += "\n#### Maintenance Actions Executed:\n"
                    for item in report.get("maintenance_actions_taken", []):
                        markdown_response += f"- {item}\n"
                if report.get("preventive_recommendations"):
                    markdown_response += "\n#### Preventive Maintenance Plan:\n"
                    for item in report.get("preventive_recommendations", []):
                        markdown_response += f"- {item}\n"

            cited_chunks = vector_chunks if report.get("confidence_score", 0.0) > 0 else []
            return {
                "response": markdown_response,
                "citations": _citations_from_chunks(cited_chunks, "RCA-relevant excerpt from uploaded document."),
                "graph_context": graph_visual_context.get("nodes", []) if isinstance(graph_visual_context, dict) else [],
                "confidence_score": report.get("confidence_score", 0.0),
                "reasoning_steps": report.get("reasoning_steps", []),
                "evidence_base": report.get("evidence_base", []),
                "timeline": report.get("timeline", []),
                "agent_logs": agent_logs
            }

        elif intent == "KNOWLEDGE":
            agent_logs.append({"agent_name": "Knowledge Agent", "status": "COMPLETED", "log_message": "Retrieving relevant procedures/manuals from the uploaded documents."})
            report = knowledge_agent.retrieve_sop_or_manual(query, vector_chunks)

            cited_chunks = vector_chunks if report.get("confidence_score", 0.0) > 0 else []
            return {
                "response": report.get("response", ""),
                "citations": _citations_from_chunks(cited_chunks, "Reference excerpt from uploaded document."),
                "graph_context": graph_visual_context.get("nodes", []) if isinstance(graph_visual_context, dict) else [],
                "confidence_score": report.get("confidence_score", 0.0),
                "reasoning_steps": report.get("reasoning_steps", []),
                "evidence_base": report.get("evidence_base", []),
                "timeline": [],
                "agent_logs": agent_logs
            }

        elif intent == "REPORTS":
            # The report is actually generated and persisted by the chat
            # endpoint (see app.api.chat._handle_report_request), which has the
            # DB session + user needed to save the Report row. This branch just
            # provides the placeholder the endpoint overwrites with the real
            # outcome — it never claims success on its own.
            agent_logs.append({"agent_name": "Report Agent", "status": "COMPLETED", "log_message": "Compiling report from retrieved documents and knowledge graph."})
            return {
                "response": "Generating your report…",
                "citations": _citations_from_chunks(vector_chunks, "Reference excerpt from uploaded document."),
                "graph_context": graph_visual_context.get("nodes", []) if isinstance(graph_visual_context, dict) else [],
                "confidence_score": 0.0,
                "reasoning_steps": ["Classified request as report generation."],
                "evidence_base": [],
                "timeline": [],
                "agent_logs": agent_logs
            }

        else: # GENERAL_QA
            agent_logs.append({"agent_name": "Gemini Reasoning Engine", "status": "COMPLETED", "log_message": "Formulating detailed general response with citations."})
            response_text, citations = gemini_service.query_gemini_with_context(
                query, 
                vector_chunks, 
                graph_triples
            )
            return {
                "response": response_text,
                "citations": citations,
                "graph_context": graph_visual_context.get("nodes", []) if isinstance(graph_visual_context, dict) else [],
                "confidence_score": 0.94,
                "reasoning_steps": [
                    "Identified query as general operations QA.",
                    "Isolated keyword subjects and pulled closest vector records."
                ],
                "evidence_base": [
                    f"Vector search returned {len(vector_chunks)} context sources."
                ],
                "timeline": [],
                "agent_logs": agent_logs
            }


planner_agent = PlannerAgent()
