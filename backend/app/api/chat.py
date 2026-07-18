# pyrefly: ignore [missing-import]
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.chat import ChatQuery, ChatResponse
from app.agents.planner_agent import planner_agent
from app.services.report_service import create_report, infer_report_type
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/suggestions")
def chat_suggestions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Document-grounded starter questions for the chat welcome screen — built from
    the user's own uploaded documents (real assets, detected regulations,
    filenames), never hardcoded demo prompts. Empty list when nothing is
    uploaded yet.
    """
    from app.services.chat_suggestions import generate_suggestions
    return {"suggestions": generate_suggestions(db, current_user)}


@router.post("/", response_model=ChatResponse)
def ask_chat_agent(
    query: ChatQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint for unified AI Chat.
    Intercepted by the central Planner Agent to orchestrate and format response
    with citations, confidence score, reasoning steps, timeline, and agent logs.

    When the planner classifies the request as REPORTS, we actually generate a
    PDF report from the uploaded documents (persisted, so it shows up in the
    Reports section) instead of only claiming to.
    """
    result = planner_agent.handle_query(query.message, user_id=str(current_user.id), db=db)

    if result.get("intent") == "REPORTS":
        result = _handle_report_request(db, current_user, query.message, result)

    return ChatResponse(
        response=result.get("response", ""),
        citations=result.get("citations", []),
        graph_context=result.get("graph_context", []),
        confidence_score=result.get("confidence_score", 0.90),
        reasoning_steps=result.get("reasoning_steps", []),
        evidence_base=result.get("evidence_base", []),
        timeline=result.get("timeline", []),
        agent_logs=result.get("agent_logs", []),
    )


def _handle_report_request(db: Session, current_user: User, message: str, result: dict) -> dict:
    """
    Actually generates the requested report and rewrites the chat response to
    reflect what really happened (title, type, sources, or an honest note if
    the documents didn't contain matching content).
    """
    report_type = infer_report_type(message)
    title = message.strip()[:120] or f"{report_type.value.title()} Report"
    try:
        report, report_data = create_report(db, current_user, title, report_type)
    except Exception as err:
        logger.error(f"Chat-triggered report generation failed: {err}")
        result["response"] = (
            "⚠️ I couldn't generate the report just now due to an internal error. "
            "Please try again, or use the **Generate Report** button on the Reports page."
        )
        result["citations"] = []
        return result

    citations = report_data.get("citations", []) or []
    if citations:
        sources = ", ".join(sorted({c["document_name"] for c in citations}))
        result["response"] = (
            f"✅ I've generated a **{report_type.value.title()} report** — "
            f"*{title}* — from your uploaded documents.\n\n"
            f"**Sources used:** {sources}\n\n"
            f"You can open or download it now from the **Reports** section of the dashboard."
        )
    else:
        result["response"] = (
            f"I created a **{report_type.value.title()} report** titled *{title}* and added it to the "
            f"**Reports** section, but I couldn't find content matching your request in the uploaded "
            f"documents — so the report notes that no relevant sources were found. Try uploading the "
            f"relevant document, or rephrasing your request."
        )
    result["citations"] = citations
    result["confidence_score"] = report_data.get("confidence_score", 0.0)
    result["reasoning_steps"] = [
        f"Classified request as a {report_type.value} report.",
        "Retrieved matching document chunks and knowledge-graph relationships.",
        "Compiled the PDF and saved it to the Reports section.",
    ]
    result["evidence_base"] = sorted({c["document_name"] for c in citations})
    return result
