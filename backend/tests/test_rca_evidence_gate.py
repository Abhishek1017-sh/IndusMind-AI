"""
The maintenance RCA must NOT fabricate failures from business text. When the
retrieved context has no maintenance evidence (no repair logs / work orders /
failure history), it returns an honest "no maintenance evidence" report.
"""
from app.agents.maintenance_agent import maintenance_agent


def _chunk(text: str) -> dict:
    return {"page_content": text, "metadata": {"filename": "doc.pdf"}}


def test_business_text_yields_no_maintenance_evidence():
    business_chunks = [_chunk(
        "Vanguard Logistics Global is a key customer. Strategic upsell opportunities "
        "identified. Competitor activity increasing. Quarterly revenue grew 12%."
    )]
    rca = maintenance_agent.generate_rca("Vanguard Logistics Global", business_chunks)
    assert rca["no_maintenance_evidence"] is True
    assert rca["confidence_score"] == 0.0
    assert "unavailable" in rca["root_cause"].lower()
    # It must NOT invent a failure narrative.
    assert not rca["timeline"]
    assert not rca["preventive_recommendations"]


def test_maintenance_text_is_analyzed_normally():
    maint_chunks = [_chunk(
        "Pump P-102 bearing failure caused unplanned downtime. Technician replaced "
        "the mechanical seal during the repair. Work order WO-88 closed."
    )]
    rca = maintenance_agent.generate_rca("Pump P-102", maint_chunks)
    # Real maintenance evidence -> not the no-evidence path.
    assert rca.get("no_maintenance_evidence") is not True


def test_no_chunks_is_not_found_not_evidence_gate():
    rca = maintenance_agent.generate_rca("Ghost Asset", [])
    # No retrieval at all -> the standard not-found report (also honest).
    assert rca["confidence_score"] == 0.0
