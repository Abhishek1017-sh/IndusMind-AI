"""
Tests for the Maintenance / Compliance / Reports module integrations: they
must auto-populate from the shared knowledge base (classification + graph +
FAISS) after upload, and show explanatory empty states when the user has no
relevant documents. Runs fully offline (see conftest.py).
"""
import io
import uuid

from conftest import register_user, auth_headers


def unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@example.com"


MAINTENANCE_DOC = (
    b"Maintenance Log - Work Order 4471\n"
    b"Machine P-102 experienced a bearing failure and unplanned downtime.\n"
    b"Technician replaced the mechanical seal. Preventive maintenance scheduled.\n"
)
SOP_DOC = (
    b"Standard Operating Procedure SOP-MECH-022\n"
    b"Purpose and scope: shaft alignment protocol. Responsibilities defined.\n"
    b"Step 1: measure runout. The technician shall verify tolerance limits.\n"
)


def test_maintenance_overview_empty_state(client):
    token = register_user(client, unique_email("maintempty"))
    resp = client.get("/api/v1/maintenance/overview", headers=auth_headers(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_data"] is False
    assert "upload" in body["message"].lower()
    assert body["assets"] == []


def test_maintenance_overview_populates_after_upload(client):
    token = register_user(client, unique_email("maintfull"))
    headers = auth_headers(token)
    resp = client.post(
        "/api/v1/documents/upload", headers=headers,
        files={"file": ("work_order.txt", io.BytesIO(MAINTENANCE_DOC), "text/plain")},
    )
    assert resp.status_code == 201, resp.text
    doc_id = resp.json()["id"]

    # Classification runs in the background task (after the upload response is
    # serialized), so re-fetch to confirm the category was auto-detected.
    status = client.get(f"/api/v1/documents/status/{doc_id}", headers=headers).json()
    assert status["category"] is not None

    resp = client.get("/api/v1/maintenance/overview", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_data"] is True
    # The P-102 machine should be discovered as an asset from the graph.
    assert any(a["type"] == "Machine" for a in body["assets"])
    assert len(body["documents"]) >= 1


def test_maintenance_register_excludes_non_assets(client):
    """
    SOPs, contacts, dates and business/HR entities extracted from a document must
    never show up in the maintainable asset register, and assets must carry a
    semantic category. Failures/incidents/vendors live in their own buckets.
    """
    token = register_user(client, unique_email("assetreg"))
    headers = auth_headers(token)
    doc = (
        b"Maintenance Log Work Order 88.\n"
        b"Pump P-102 bearing failure in the Boiler Room. Compressor C-301 inspected.\n"
        b"Reported by HR Department and Sales Region North. Contact: ops@novatech.com.\n"
        b"May 2025. SOP-MECH-022 referenced.\n"
    )
    resp = client.post("/api/v1/documents/upload", headers=headers,
                       files={"file": ("wo.txt", io.BytesIO(doc), "text/plain")})
    assert resp.status_code == 201, resp.text

    body = client.get("/api/v1/maintenance/overview", headers=headers).json()
    assert body["has_data"] is True

    names = {a["name"] for a in body["assets"]}
    # Machines are present, and every asset carries a category.
    assert any("P-102" in n for n in names)
    assert all(a["category"] for a in body["assets"])

    # Non-assets must be absent from the register.
    for forbidden in ("SOP-MECH-022", "ops@novatech.com", "May 2025"):
        assert not any(forbidden in n for n in names), f"{forbidden} must not be an asset"
    assert not any("HR" in n or "Sales" in n or "Finance" in n for n in names)

    # Separate buckets exist and never leak into `assets`.
    for bucket in ("failures", "incidents", "vendors"):
        assert bucket in body
        for e in body[bucket]:
            assert e["name"] not in names

    # Search + category filter work server-side.
    s = client.get("/api/v1/maintenance/overview?q=pump", headers=headers).json()
    assert all("pump" in a["name"].lower() for a in s["assets"])


def test_maintenance_overview_kpis_and_confidence(client):
    """Overview must expose KPIs, specific asset types, and confidence bands."""
    token = register_user(client, unique_email("kpis"))
    headers = auth_headers(token)
    client.post("/api/v1/documents/upload", headers=headers,
                files={"file": ("wo.txt", io.BytesIO(
                    b"Maintenance Log: Pump P-102 and Compressor C-301 serviced."), "text/plain")})

    body = client.get("/api/v1/maintenance/overview", headers=headers).json()
    assert "kpis" in body
    for k in ("total_assets", "critical_assets", "open_incidents", "high_risk_assets",
              "assets_missing_maintenance", "assets_with_alerts"):
        assert k in body["kpis"]
    assert body["kpis"]["total_assets"] == len(body["assets"])

    for a in body["assets"]:
        # Specific taxonomy type + confidence band on every asset.
        assert a["asset_type"] in ("Pump", "Compressor", "Machine", "Equipment")
        assert a["confidence_band"] in ("Needs Review", "Review Suggested", "Auto Approved")
        assert 0.0 <= a["confidence"] <= 1.0
        assert a["risk_level"] in ("Low", "Medium", "High", "Critical")

    # Filter by a specific asset type works.
    types = body["asset_types"]
    if types:
        filtered = client.get(f"/api/v1/maintenance/overview?category={types[0]}", headers=headers).json()
        assert all(a["asset_type"] == types[0] for a in filtered["assets"])


def test_maintenance_asset_dossier_shape(client):
    token = register_user(client, unique_email("dossier"))
    headers = auth_headers(token)
    client.post("/api/v1/documents/upload", headers=headers,
                files={"file": ("m.txt", io.BytesIO(
                    b"Maintenance Log: Pump P-102 seal replaced after bearing failure."), "text/plain")})

    d = client.get("/api/v1/maintenance/asset/Pump%20P-102", headers=headers).json()
    # Backward-compatible keys still present
    for k in ("asset", "report", "citations"):
        assert k in d
    # Enriched dossier
    for k in ("overview", "related_documents", "related_graph_nodes", "maintenance_history", "recommendations"):
        assert k in d
    assert d["overview"]["category"] == "Machines"
    assert any(doc["filename"] == "m.txt" for doc in d["related_documents"])
    # New RCA insight fields always exist
    for k in ("contributing_factors", "criticality", "downtime_impact", "spare_parts_involved"):
        assert k in d["report"]


def test_compliance_overview_empty_state(client):
    token = register_user(client, unique_email("compempty"))
    resp = client.get("/api/v1/compliance/overview", headers=auth_headers(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_data"] is False
    assert body["risk_level"] == "Unknown"
    # With nothing uploaded, every compliance document class is "missing".
    assert "SOP" in body["missing_documents"]


def test_compliance_overview_detects_sop(client):
    token = register_user(client, unique_email("compfull"))
    headers = auth_headers(token)
    resp = client.post(
        "/api/v1/documents/upload", headers=headers,
        files={"file": ("sop.txt", io.BytesIO(SOP_DOC), "text/plain")},
    )
    assert resp.status_code == 201, resp.text

    resp = client.get("/api/v1/compliance/overview", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_data"] is True
    assert any(d["category"] == "SOP" for d in body["detected_documents"])
    assert body["risk_level"] in ("Low", "Medium", "High", "Critical")


def test_report_generation_and_ownership(client):
    token = register_user(client, unique_email("report"))
    headers = auth_headers(token)
    client.post(
        "/api/v1/documents/upload", headers=headers,
        files={"file": ("wo.txt", io.BytesIO(MAINTENANCE_DOC), "text/plain")},
    )

    # Every report type (including the new EXECUTIVE) must generate a PDF.
    for rtype in ["RCA", "COMPLIANCE", "MAINTENANCE", "INSPECTION", "EXECUTIVE"]:
        resp = client.post(
            "/api/v1/reports/generate", headers=headers,
            json={"title": f"{rtype} for P-102", "report_type": rtype},
        )
        assert resp.status_code == 201, f"{rtype}: {resp.text}"
        report = resp.json()
        assert report["report_type"] == rtype
        dl = client.get(f"/api/v1/reports/download/{report['id']}", headers=headers)
        assert dl.status_code == 200
        assert dl.headers["content-type"] == "application/pdf"

    # A different user must not see or download another user's reports.
    other = register_user(client, unique_email("reportother"))
    listing = client.get("/api/v1/reports/list", headers=auth_headers(other))
    assert listing.status_code == 200
    assert listing.json() == []

    my_reports = client.get("/api/v1/reports/list", headers=headers).json()
    assert len(my_reports) == 5
    victim_id = my_reports[0]["id"]
    resp = client.get(f"/api/v1/reports/download/{victim_id}", headers=auth_headers(other))
    assert resp.status_code == 404


def test_chat_report_request_actually_creates_report(client):
    """
    Asking the chat for a report must ACTUALLY generate + persist one that then
    appears in the Reports section — not just print a stub message.
    """
    token = register_user(client, unique_email("chatreport"))
    headers = auth_headers(token)
    client.post(
        "/api/v1/documents/upload", headers=headers,
        files={"file": ("annual.txt", io.BytesIO(
            b"NovaTech Annual Plant Performance Report. Last year revenue was strong. "
            b"Pump P-102 uptime improved after preventive maintenance."
        ), "text/plain")},
    )

    # Reports empty to start.
    assert client.get("/api/v1/reports/list", headers=headers).json() == []

    # Ask the chat for a report.
    resp = client.post("/api/v1/chat/", headers=headers,
                       json={"message": "give me the annual report of last year", "history": []})
    assert resp.status_code == 200
    body = resp.json()
    # Response must not be the old fabricated stub.
    assert "Report Generation Initialized" not in body["response"]
    assert "report" in body["response"].lower()

    # A real report row must now exist and be downloadable as a PDF.
    reports = client.get("/api/v1/reports/list", headers=headers).json()
    assert len(reports) == 1
    dl = client.get(f"/api/v1/reports/download/{reports[0]['id']}", headers=headers)
    assert dl.status_code == 200
    assert dl.headers["content-type"] == "application/pdf"


def test_orphaned_report_files_are_reconciled(client):
    """
    A PDF in the reports folder with no Report row (e.g. left behind by the old
    SQLite-fallback era) must be purged by reconcile_report_files, while a file
    backed by a real row is kept.
    """
    import os
    from app.core.config import settings
    from app.services.report_service import reconcile_report_files
    from app.db.session import SessionLocal

    # Create a real report (file + row) so we can confirm it's NOT deleted.
    token = register_user(client, unique_email("orphanrep"))
    headers = auth_headers(token)
    client.post("/api/v1/documents/upload", headers=headers,
                files={"file": ("d.txt", io.BytesIO(b"Pump P-102 maintenance record."), "text/plain")})
    rep = client.post("/api/v1/reports/generate", headers=headers,
                      json={"title": "Real report", "report_type": "MAINTENANCE"}).json()
    real_path = os.path.join(settings.REPORT_DIR, os.path.basename(rep["file_path"]))
    assert os.path.exists(real_path)

    # Drop an orphaned PDF with no DB row.
    orphan = os.path.join(settings.REPORT_DIR, "orphan_deadbeef_report.pdf")
    with open(orphan, "wb") as f:
        f.write(b"%PDF-1.4 orphan")
    assert os.path.exists(orphan)

    db = SessionLocal()
    reconcile_report_files(db)
    db.close()

    assert not os.path.exists(orphan), "orphaned report file must be removed"
    assert os.path.exists(real_path), "report file backed by a DB row must be kept"
