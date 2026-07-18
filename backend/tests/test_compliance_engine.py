"""
Cross-document compliance validation: extract interval requirements and
last-event observations, then detect overdue violations across documents with
evidence from both sources. Fully offline / rule-based.
"""
import io
import uuid
from datetime import date

from conftest import register_user, auth_headers
from app.services.compliance_engine import (
    extract_requirements, extract_observations, cross_document_findings,
)


def unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@example.com"


def test_extract_interval_requirements():
    reqs = extract_requirements(
        "The equipment shall be inspected every 30 days. Calibration performed quarterly. "
        "Filters replaced every 6 months.", "SOP.pdf")
    by = {r["activity"]: r["interval_days"] for r in reqs}
    assert by["inspection"] == 30
    assert by["calibration"] == 90       # quarterly
    assert by["replacement"] == 180      # 6 months
    assert all(r["source_document"] == "SOP.pdf" and r["snippet"] for r in reqs)


def test_extract_observations_dates_and_relative():
    obs = extract_observations(
        "The last inspection was performed on 2020-01-01. Calibration completed 40 days ago.",
        "Log.pdf", reference_date=date(2020, 3, 1))
    by = {o["activity"]: o for o in obs}
    assert by["inspection"]["days_since"] == 60          # Jan 1 -> Mar 1
    assert by["calibration"]["days_since"] == 40


def test_cross_document_overdue_violation_with_evidence():
    reqs = extract_requirements("Pumps must be inspected every 30 days.", "SOP.pdf")
    obs = extract_observations("Last inspection performed 100 days ago.", "MaintenanceLog.pdf")
    findings = cross_document_findings(reqs, obs)
    assert len(findings) == 1
    f = findings[0]
    assert f["type"] == "overdue"
    assert f["overdue_days"] == 70          # 100 - 30
    assert f["severity"] in ("Critical", "High", "Medium")
    assert f["cross_document"] is True
    # Evidence cites BOTH source documents.
    docs = {e["source_document"] for e in f["evidence"]}
    assert docs == {"SOP.pdf", "MaintenanceLog.pdf"}
    assert f["recommendation"]


def test_within_interval_is_compliant_not_a_violation():
    reqs = extract_requirements("Inspect every 90 days.", "SOP.pdf")
    obs = extract_observations("Last inspection was 20 days ago.", "Log.pdf")
    findings = cross_document_findings(reqs, obs)
    assert findings[0]["type"] == "compliant"
    assert findings[0]["overdue_days"] == 0


def test_requirement_without_record_is_missing_evidence():
    reqs = extract_requirements("Fire drill required every 180 days.", "Safety.pdf")
    findings = cross_document_findings(reqs, [])
    assert findings[0]["type"] == "missing_evidence"


def test_no_false_positive_on_plain_text():
    assert extract_requirements("The team enjoyed lunch.", "x.pdf") == []
    assert extract_observations("Revenue grew last quarter.", "x.pdf") == []


def test_timeline_marks_overdue_events():
    from app.services.compliance_engine import build_timeline, cross_document_findings, extract_requirements, extract_observations
    reqs = extract_requirements("Inspect every 30 days.", "SOP.pdf")
    obs = extract_observations("Last inspection performed on 2020-01-01.", "Log.pdf")
    findings = cross_document_findings(reqs, obs)
    tl = build_timeline(obs, findings)
    assert tl and tl[0]["activity"] == "inspection"
    assert tl[0]["status"] == "overdue"
    assert tl[0]["date"] == "2020-01-01"


def test_audit_report_endpoint_generates_downloadable_pdf(client):
    token = register_user(client, unique_email("audit"))
    headers = auth_headers(token)
    client.post("/api/v1/documents/upload", headers=headers, files={
        "file": ("SOP.txt", io.BytesIO(b"SOP per ISO 9001. Pump inspected every 30 days."), "text/plain")})
    client.post("/api/v1/documents/upload", headers=headers, files={
        "file": ("Log.txt", io.BytesIO(b"Inspection Report. Last inspection performed on 2020-02-01."), "text/plain")})

    resp = client.post("/api/v1/compliance/audit-report", headers=headers)
    assert resp.status_code == 200, resp.text
    report = resp.json()
    assert report["id"]
    # PDF is downloadable and it also shows up in the Reports list.
    dl = client.get(f"/api/v1/reports/download/{report['id']}", headers=headers)
    assert dl.status_code == 200 and dl.headers["content-type"] == "application/pdf"
    reports = client.get("/api/v1/reports/list", headers=headers).json()
    assert any(r["id"] == report["id"] for r in reports)


def test_compliance_overview_exposes_cross_document_violations(client):
    token = register_user(client, unique_email("xdoc"))
    headers = auth_headers(token)
    client.post("/api/v1/documents/upload", headers=headers, files={
        "file": ("SOP.txt", io.BytesIO(
            b"Standard Operating Procedure. The pump shall be inspected every 30 days."), "text/plain")})
    client.post("/api/v1/documents/upload", headers=headers, files={
        "file": ("Log.txt", io.BytesIO(
            b"Inspection Report. The last inspection was performed on 2020-01-01."), "text/plain")})

    body = client.get("/api/v1/compliance/overview", headers=headers).json()
    assert "violations" in body
    overdue = [f for f in body["violations"] if f["type"] == "overdue" and f["activity"] == "inspection"]
    assert overdue, "cross-document inspection overdue must be detected"
    assert overdue[0]["cross_document"] is True
    assert {e["source_document"] for e in overdue[0]["evidence"]} == {"SOP.txt", "Log.txt"}
