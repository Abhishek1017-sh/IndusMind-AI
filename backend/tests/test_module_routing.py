"""
Document-driven module routing: regulation detection, per-document module
scoring, and aggregate readiness. Plus the end-to-end module-readiness and
compliance-regulation surfacing through the API.
"""
import io
import uuid

from conftest import register_user, auth_headers
from app.services.regulation_detector import detect_regulations
from app.services.module_router import score_document, compute_readiness


def unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@example.com"


def test_regulation_detection_grounded():
    regs = detect_regulations("This facility complies with ISO 9001 and OSHA. HIPAA is not relevant here except by name HIPAA.")
    codes = {r["code"] for r in regs}
    assert "ISO 9001" in codes and "OSHA" in codes and "HIPAA" in codes
    # Nothing invented for a doc that names no standard.
    assert detect_regulations("A note about lunch schedules and team morale.") == []
    # Provenance + confidence present.
    iso = next(r for r in regs if r["code"] == "ISO 9001")
    assert iso["snippet"] and 0 < iso["confidence"] <= 1 and iso["domain"]


def test_module_scoring_routes_by_evidence():
    # An SOP with a regulation -> strong compliance, weak maintenance.
    s = score_document("SOP", [], detect_regulations("ISO 9001 quality manual"))
    assert s["compliance"] >= 0.85 and s["maintenance"] < 0.5
    # A maintenance log with assets -> strong maintenance, weak compliance.
    s2 = score_document("Maintenance Log", ["Pump", "Machine"], [])
    assert s2["maintenance"] >= 0.85 and s2["compliance"] < 0.5
    # Reports + chat always available.
    assert s["reports"] >= 0.5 and s["chat"] == 1.0


def test_readiness_active_and_reasons():
    infos = [{"document_type": "Maintenance Log",
              "modules": score_document("Maintenance Log", ["Pump"], []),
              "regulations": []}]
    r = compute_readiness(infos)
    assert r["maintenance"]["active"] is True
    assert r["compliance"]["active"] is False
    # Inactive module explains what to upload.
    assert r["compliance"]["enable_hint"]
    assert r["chat"]["active"] is True


def test_module_readiness_endpoint(client):
    token = register_user(client, unique_email("modready"))
    headers = auth_headers(token)
    client.post("/api/v1/documents/upload", headers=headers,
                files={"file": ("sop.txt", io.BytesIO(
                    b"Standard Operating Procedure per ISO 9001. Step 1: the technician shall verify."), "text/plain")})

    resp = client.get("/api/v1/documents/module-readiness", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_documents"] is True
    assert body["modules"]["compliance"]["active"] is True
    assert body["modules"]["chat"]["active"] is True


def test_compliance_overview_surfaces_regulations(client):
    token = register_user(client, unique_email("compreg"))
    headers = auth_headers(token)
    client.post("/api/v1/documents/upload", headers=headers,
                files={"file": ("audit.txt", io.BytesIO(
                    b"Audit Report: assessed against ISO 27001 and OSHA controls. Access control reviewed."), "text/plain")})

    body = client.get("/api/v1/compliance/overview", headers=headers).json()
    assert "readiness" in body and "applicable_regulations" in body
    codes = {r["code"] for r in body["applicable_regulations"]}
    assert "ISO 27001" in codes or "OSHA" in codes


def test_compliance_empty_state_is_dynamic(client):
    """Even with no compliance docs, readiness + reason + hint are returned."""
    token = register_user(client, unique_email("compempty2"))
    headers = auth_headers(token)
    client.post("/api/v1/documents/upload", headers=headers,
                files={"file": ("log.txt", io.BytesIO(
                    b"Maintenance Log: Pump P-102 bearing replaced during repair."), "text/plain")})

    body = client.get("/api/v1/compliance/overview", headers=headers).json()
    assert body["has_data"] is False
    assert body["readiness"]["active"] is False
    assert body["readiness"]["reason"]
    assert body["readiness"]["enable_hint"]
