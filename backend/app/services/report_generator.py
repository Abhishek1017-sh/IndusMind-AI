import os
import logging
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from app.core.config import settings

logger = logging.getLogger(__name__)


def generate_pdf_report(
    filename: str,
    title: str,
    report_type: str,
    data: dict
) -> str:
    """
    Compiles data into a styled PDF report using ReportLab and saves to disk.
    Returns the absolute path to the generated PDF.
    """
    os.makedirs(settings.REPORT_DIR, exist_ok=True)
    file_path = os.path.join(settings.REPORT_DIR, filename)
    
    logger.info(f"Generating PDF report: {file_path}")
    
    # 1. Page template document setup
    doc = SimpleDocTemplate(
        file_path,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    
    # 2. Styles
    styles = getSampleStyleSheet()
    
    # Custom colors
    primary_color = colors.HexColor("#0f172a") # Slate-900
    secondary_color = colors.HexColor("#3b82f6") # Blue-500
    text_color = colors.HexColor("#334155") # Slate-700
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=24,
        leading=28,
        textColor=primary_color,
        spaceAfter=15
    )
    
    h2_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=14,
        leading=18,
        textColor=secondary_color,
        spaceBefore=15,
        spaceAfter=8,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=text_color,
        spaceAfter=10
    )

    bullet_style = ParagraphStyle(
        'BulletCustom',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=text_color,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=6
    )

    story = []

    # 3. Header/Title
    generated_at = data.get("generated_at") or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    story.append(Paragraph(title, title_style))
    meta_line = f"<b>Report Type:</b> {report_type.upper()} | <b>Generated:</b> {generated_at}"
    if data.get("generated_by"):
        meta_line += f" | <b>By:</b> {data['generated_by']}"
    story.append(Paragraph(meta_line, body_style))

    # Confidence badge — present on every report so readers can weigh it.
    confidence = data.get("confidence_score")
    if confidence is not None:
        pct = int(round(float(confidence) * 100))
        conf_color = "#16a34a" if pct >= 75 else ("#ca8a04" if pct >= 50 else "#dc2626")
        story.append(Paragraph(
            f"<b>AI Confidence:</b> <font color='{conf_color}'>{pct}%</font> "
            f"| <b>Sources cited:</b> {data.get('source_count', len(data.get('citations', []) or []))}",
            body_style
        ))
    story.append(Spacer(1, 15))

    # 4. Content flow mapping based on report type
    if report_type.upper() == "COMPLIANCE":
        story.append(Paragraph("Audit Summary", h2_style))
        story.append(Paragraph(data.get("summary", "No summary available."), body_style))
        story.append(Spacer(1, 10))
        
        # Add score
        score_val = data.get("compliance_score", 0)
        score_color = "#16a34a" if score_val >= 80 else ("#ca8a04" if score_val >= 60 else "#dc2626")
        story.append(Paragraph(f"<b>Audit Score:</b> <font color='{score_color}'>{score_val}%</font>", body_style))
        story.append(Spacer(1, 15))
        
        # Checklist Table
        story.append(Paragraph("Compliance Parameter Checklist", h2_style))
        checklist = data.get("checklist", [])
        if checklist:
            table_data = [["Parameter", "SOP Limit", "Inspected", "Status"]]
            for item in checklist:
                table_data.append([
                    item.get("parameter", ""),
                    item.get("sop_limit", ""),
                    item.get("inspected_value", ""),
                    item.get("status", "")
                ])
            
            t = Table(table_data, colWidths=[180, 120, 120, 110])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), primary_color),
                ('TEXTCOLOR', (0,0), (-1,0), colors.white),
                ('ALIGN', (0,0), (-1,-1), 'LEFT'),
                ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
                ('BOTTOMPADDING', (0,0), (-1,0), 6),
                ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor("#f8fafc"), colors.white]),
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('TEXTCOLOR', (3,1), (3,-1), colors.HexColor("#16a34a")), # compliant = green text defaults
            ]))
            story.append(t)
            story.append(Spacer(1, 15))
            
        # Corrective actions
        actions = data.get("corrective_actions", [])
        if actions:
            story.append(Paragraph("Required Corrective Actions", h2_style))
            for action in actions:
                story.append(Paragraph(f"• {action}", bullet_style))

        # ── Rich audit sections (present only for the one-click audit report) ──
        regs = data.get("applicable_regulations", [])
        if regs:
            story.append(Paragraph("Applicable Regulations", h2_style))
            for r in regs:
                story.append(Paragraph(
                    f"• <b>{r.get('name', r.get('code',''))}</b> ({r.get('domain','')}) "
                    f"— {int((r.get('confidence') or 0)*100)}% confidence", bullet_style))

        findings = data.get("compliance_findings", [])
        if findings:
            story.append(Paragraph("Cross-Document Findings", h2_style))
            for f in findings:
                sev = f.get("severity", "")
                sev_color = {"Critical": "#dc2626", "High": "#ea580c", "Medium": "#ca8a04"}.get(sev, "#16a34a")
                story.append(Paragraph(
                    f"<b><font color='{sev_color}'>[{sev}]</font> {f.get('title','')}</b>"
                    + ("  (cross-document)" if f.get("cross_document") else ""), body_style))
                story.append(Paragraph(f.get("description", ""), bullet_style))
                for e in f.get("evidence", []):
                    role = f"{e.get('role','')}: " if e.get("role") else ""
                    story.append(Paragraph(
                        f"&nbsp;&nbsp;— {role}<i>{e.get('source_document','')}</i>: “{e.get('snippet','')}”",
                        bullet_style))
                if f.get("recommendation"):
                    story.append(Paragraph(f"&nbsp;&nbsp;→ <b>Recommendation:</b> {f['recommendation']}", bullet_style))
            story.append(Spacer(1, 8))

        timeline = data.get("compliance_timeline", [])
        if timeline:
            story.append(Paragraph("Compliance Timeline", h2_style))
            for ev in timeline:
                status_color = "#dc2626" if ev.get("status") == "overdue" else "#16a34a"
                story.append(Paragraph(
                    f"• <b>{ev.get('date','')}</b> — {ev.get('event','')} "
                    f"<font color='{status_color}'>[{ev.get('status','').upper()}]</font> "
                    f"({ev.get('source_document','')})", bullet_style))

        missing = data.get("missing_documents", [])
        if missing:
            story.append(Paragraph("Missing Document Types", h2_style))
            story.append(Paragraph("The following were not found and would strengthen the audit: "
                                   + ", ".join(missing) + ".", body_style))

    elif report_type.upper() == "RCA":
        story.append(Paragraph("Equipment details", h2_style))
        story.append(Paragraph(f"<b>Equipment ID:</b> {data.get('equipment_id', 'N/A')}", body_style))
        story.append(Paragraph(f"<b>Failure Mode:</b> {data.get('failure_mode', 'N/A')}", body_style))
        story.append(Spacer(1, 10))
        
        story.append(Paragraph("Root Cause Investigation", h2_style))
        story.append(Paragraph(data.get("root_cause", "No investigation details."), body_style))
        story.append(Spacer(1, 10))
        
        # Chronology
        chronology = data.get("chronology", [])
        if chronology:
            story.append(Paragraph("Incident Chronology", h2_style))
            for event in chronology:
                story.append(Paragraph(f"• {event}", bullet_style))
            story.append(Spacer(1, 10))
            
        # Corrective Actions Taken
        actions = data.get("maintenance_actions_taken", [])
        if actions:
            story.append(Paragraph("Corrective Actions Taken", h2_style))
            for action in actions:
                story.append(Paragraph(f"• {action}", bullet_style))
            story.append(Spacer(1, 10))
            
        # Recommendations
        recs = data.get("preventive_recommendations", [])
        if recs:
            story.append(Paragraph("Preventive Reliability Plan", h2_style))
            for rec in recs:
                story.append(Paragraph(f"• {rec}", bullet_style))
            story.append(Spacer(1, 10))
            
        # Lessons Learned
        lessons = data.get("lessons_learned", [])
        if lessons:
            story.append(Paragraph("Lessons Learned", h2_style))
            for lesson in lessons:
                story.append(Paragraph(f"• <i>{lesson}</i>", bullet_style))

    elif report_type.upper() in ("INSPECTION", "EXECUTIVE", "MAINTENANCE"):
        # Narrative/summary reports built from a grounded knowledge answer.
        heading = {
            "INSPECTION": "Inspection Summary",
            "EXECUTIVE": "Executive Summary",
            "MAINTENANCE": "Maintenance Summary",
        }[report_type.upper()]
        story.append(Paragraph(heading, h2_style))
        summary_text = data.get("response") or data.get("root_cause") or data.get("summary") \
            or "No relevant information was found in the uploaded documents for this report."
        story.append(Paragraph(summary_text, body_style))
        story.append(Spacer(1, 10))

        for section_key, section_title in [
            ("preventive_recommendations", "Recommendations"),
            ("maintenance_actions_taken", "Actions Taken"),
            ("lessons_learned", "Key Takeaways"),
        ]:
            items = data.get(section_key, []) or []
            if items:
                story.append(Paragraph(section_title, h2_style))
                for item in items:
                    story.append(Paragraph(f"• {item}", bullet_style))
                story.append(Spacer(1, 8))

        evidence = data.get("evidence_base", []) or []
        if evidence:
            story.append(Paragraph("Evidence Base", h2_style))
            for ev in evidence:
                story.append(Paragraph(f"• {ev}", bullet_style))

    else:  # Unknown/legacy type — render whatever fields exist, minus internals.
        story.append(Paragraph("Details", h2_style))
        _internal = {"citations", "graph_relationships", "confidence_score",
                     "generated_at", "generated_by", "source_count", "reasoning_steps"}
        for key, value in data.items():
            if key in _internal or isinstance(value, (list, dict)):
                continue
            story.append(Paragraph(f"<b>{key.replace('_', ' ').title()}:</b> {value}", body_style))

    # 5. Knowledge-graph relationships used (shared across all report types)
    graph_rels = data.get("graph_relationships", []) or []
    if graph_rels:
        story.append(Spacer(1, 12))
        story.append(Paragraph("Knowledge Graph Relationships", h2_style))
        for rel in graph_rels:
            story.append(Paragraph(f"• {rel}", bullet_style))

    # 6. Citations (shared across all report types)
    citations = data.get("citations", []) or []
    if citations:
        story.append(Spacer(1, 12))
        story.append(Paragraph("Sources & Citations", h2_style))
        for c in citations:
            name = c.get("document_name", "Unknown Document")
            page = c.get("page_number")
            loc = f" (chunk {page})" if page is not None else ""
            story.append(Paragraph(f"• <b>{name}</b>{loc}", bullet_style))
    else:
        story.append(Spacer(1, 12))
        story.append(Paragraph(
            "<i>No source documents were cited for this report — the uploaded knowledge base "
            "did not contain matching content.</i>", body_style))

    # Build Document
    try:
        doc.build(story)
        logger.info(f"Report PDF successfully compiled at {file_path}")
        return file_path
    except Exception as e:
        logger.error(f"Failed to build PDF using ReportLab: {e}")
        raise e
