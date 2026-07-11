"""
Tests for the schema-driven entity classifier (confidence, bands, specific
asset types, business-entity exclusion).
"""
import pytest

from app.services.entity_classifier import classify_entity
from app.services.asset_taxonomy import (
    confidence_band, BAND_NEEDS_REVIEW, BAND_AUTO_APPROVED,
    GROUP_ASSET, GROUP_EVENT, GROUP_PARTY, MAINTAINABLE_GROUPS,
)


@pytest.mark.parametrize("ntype,name,props,expected_type,expected_group", [
    ("Machine", "Pump P-102", {"type": "Pump"}, "Pump", GROUP_ASSET),
    ("Machine", "Vibration Sensor", {}, "Sensor", GROUP_ASSET),   # specific beats generic
    ("Equipment", "Database Server rack-01", {}, "Database", GROUP_ASSET),
    ("Equipment", "Forklift FL-3", {}, "Vehicle", GROUP_ASSET),
    ("Entity", "Programmable Logic Controller PLC-7", {}, "PLC", GROUP_ASSET),
    ("Entity", "Network Switch SW-2", {}, "Network Device", GROUP_ASSET),
    ("Entity", "Power Transformer T-9", {}, "Transformer", GROUP_ASSET),
    ("Location", "Boiler Room", {}, "Facility", None),  # group checked separately
    ("Failure", "Bearing failure", {}, "Failure", GROUP_EVENT),
    ("Organization", "Acme Bearings Supplier", {}, "Vendor", GROUP_PARTY),
])
def test_specific_asset_types(ntype, name, props, expected_type, expected_group):
    r = classify_entity(ntype, name, props)
    assert r is not None
    assert r.asset_type == expected_type
    if expected_group is not None:
        assert r.group == expected_group


@pytest.mark.parametrize("ntype,name", [
    ("Engineer", "Elena Rostova"),
    ("Person", "Sneha Kulkarni"),
    ("Skill", "Python"),
    ("SOP", "SOP-MECH-022"),
    ("InspectionReport", "INSP-2026-01"),
    ("Location", "Sales Region North"),
    ("Location", "Corporate Headquarters"),
    ("Entity", "HR Department"),
    ("Entity", "Finance Division"),
    ("Entity", "Legal Contract Review"),
    ("Entity", "Customer Billing Account"),
    ("Organization", "NovaTech Manufacturing Pvt Ltd"),
])
def test_business_and_non_assets_excluded(ntype, name):
    assert classify_entity(ntype, name, {}) is None


def test_confidence_and_bands():
    assert confidence_band(0.5) == BAND_NEEDS_REVIEW
    assert confidence_band(0.95) == BAND_AUTO_APPROVED
    # A specific node type is high-confidence and auto-approved.
    r = classify_entity("Server", "App Server 1", {})
    assert r.asset_type == "Server"
    assert r.confidence > 0.9
    assert r.confidence_band == BAND_AUTO_APPROVED
    assert r.reason  # explainability string present


def test_cross_document_corroboration_raises_confidence():
    low = classify_entity("Machine", "Widget Press", {}, corroborating_documents=1)
    high = classify_entity("Machine", "Widget Press", {}, corroborating_documents=4)
    assert high.confidence > low.confidence


def test_maintainable_flag():
    assert classify_entity("Pump", "P-1", {}).is_maintainable is True
    assert classify_entity("Failure", "Leak", {}).group not in MAINTAINABLE_GROUPS
