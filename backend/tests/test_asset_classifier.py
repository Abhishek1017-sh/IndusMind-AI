"""
Regression tests for semantic asset classification (app.services.asset_classifier).

These lock in the Maintenance-module fixes: every Location is NOT an asset,
HR/Sales/Finance entities never appear, and assets/incidents/facilities are
separated into their own categories.
"""
import pytest

from app.services.asset_classifier import (
    classify_asset, MAINTAINABLE_CATEGORIES,
    FACILITIES, MACHINES, SERVERS, EQUIPMENT, VEHICLES,
    SPARE_PARTS, FAILURES, INCIDENTS, VENDORS,
)


@pytest.mark.parametrize("ntype,name,props,expected", [
    # Physical assets
    ("Machine", "Pump P-102", {"type": "Pump"}, MACHINES),
    ("Machine", "HP450 Compressor", {}, MACHINES),
    ("Equipment", "Database Server rack-01", {}, SERVERS),
    ("Equipment", "Forklift FL-3", {}, VEHICLES),
    ("Equipment", "Pressure Transmitter PT-9", {}, EQUIPMENT),
    ("SparePart", "Mechanical Seal S-100", {}, SPARE_PARTS),
    # Facilities vs. business locations
    ("Location", "Boiler Room", {}, FACILITIES),
    ("Location", "Train 2 Processing Area", {}, FACILITIES),
    # Events
    ("Failure", "Bearing failure", {}, FAILURES),
    ("Entity", "Bearing failure", {}, FAILURES),
    ("Entity", "Unplanned shutdown incident", {}, INCIDENTS),
    # Vendors
    ("Organization", "Acme Bearings Supplier", {}, VENDORS),
])
def test_assets_are_classified(ntype, name, props, expected):
    assert classify_asset(ntype, name, props) == expected


@pytest.mark.parametrize("ntype,name", [
    # People and competencies are never assets
    ("Engineer", "Elena Rostova"),
    ("Person", "Sneha Kulkarni"),
    ("Skill", "Python"),
    ("Contact", "ops@novatech.com"),
    ("Date", "May 2025"),
    # Procedures and records are history/reference, not assets
    ("SOP", "SOP-MECH-022"),
    ("MaintenanceRecord", "WO-4471"),
    ("InspectionReport", "INSP-2026-01"),
    # Business regions / HR / Sales / Finance must never reach Maintenance
    ("Location", "Sales Region North"),
    ("Location", "Corporate Headquarters"),
    ("Entity", "HR Department"),
    ("Entity", "Finance Division"),
    # The operating company itself is not a vendor asset
    ("Organization", "NovaTech Manufacturing Pvt Ltd"),
])
def test_non_assets_are_excluded(ntype, name):
    assert classify_asset(ntype, name, {}) is None


def test_failure_keyword_does_not_hijack_physical_asset():
    """A 'Vibration Sensor' is equipment, even though 'vibration' is a failure keyword."""
    assert classify_asset("Machine", "Vibration Sensor", {}) == EQUIPMENT


def test_maintainable_categories_exclude_events_and_parties():
    for cat in (FAILURES, INCIDENTS, VENDORS):
        assert cat not in MAINTAINABLE_CATEGORIES
    for cat in (MACHINES, EQUIPMENT, SERVERS, VEHICLES, FACILITIES, SPARE_PARTS):
        assert cat in MAINTAINABLE_CATEGORIES


def test_empty_name_is_not_an_asset():
    assert classify_asset("Machine", "", {}) is None
    assert classify_asset(None, None, None) is None
