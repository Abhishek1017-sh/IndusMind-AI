"""
Semantic asset classification for the Maintenance module.

Turns raw knowledge-graph entities (extracted from uploaded documents) into
the asset taxonomy an industrial asset-management system actually works with,
and — just as importantly — filters out everything that is NOT a maintainable
asset: people, skills, dates, contacts, SOPs, business regions, HR/Sales/
Finance locations, and maintenance *records* (which are history, not assets).

This is signal-based inference over each entity's own type and name, exactly
like app.services.document_classifier does for documents. It never invents
entities and never injects demo data — an entity only appears if it was
extracted from a document the user uploaded.
"""
import re
from typing import Dict, List, Optional, Any

# ── Asset categories (the maintenance taxonomy) ──────────────────────────────
FACILITIES = "Facilities"
MACHINES = "Machines"
SERVERS = "Servers"
EQUIPMENT = "Equipment"
VEHICLES = "Vehicles"
SPARE_PARTS = "Spare Parts"
FAILURES = "Failures"
INCIDENTS = "Incidents"
VENDORS = "Vendors"

# Display order used by the dashboard.
ASSET_CATEGORIES: List[str] = [
    MACHINES, EQUIPMENT, SERVERS, VEHICLES, FACILITIES,
    SPARE_PARTS, FAILURES, INCIDENTS, VENDORS,
]

# Categories that represent physical, maintainable things (vs. events/parties).
MAINTAINABLE_CATEGORIES = {MACHINES, EQUIPMENT, SERVERS, VEHICLES, FACILITIES, SPARE_PARTS}

# ── Graph node types that can NEVER be a maintainable asset ──────────────────
# People, competencies, temporal/contact facts, procedures, and maintenance
# *records*. Records and SOPs are surfaced as history / related documents
# instead of as asset cards.
_NEVER_ASSET_TYPES = {
    "person", "engineer", "technician", "employee", "contact", "skill", "date",
    "project", "event", "document", "sop", "certification", "training",
    "maintenancerecord", "inspectionreport", "workorder", "report",
}

# ── Name signals. These are detection patterns found in the document's own
#    text — not a predefined catalogue of assets. ───────────────────────────
_SERVER_SIGNALS = [
    "server", "rack", "blade", "hypervisor", "vm ", "virtual machine", "cluster node",
    "database server", "app server", "firewall", "router", "switch", "gateway",
    "scada server", "historian", "plc rack", "data center", "datacenter",
]
_VEHICLE_SIGNALS = [
    "vehicle", "truck", "forklift", "crane", "van", "loader", "excavator",
    "trailer", "tractor", "bulldozer", "lift truck", "pallet jack",
]
_MACHINE_SIGNALS = [
    "pump", "compressor", "turbine", "motor", "boiler", "conveyor", "press",
    "generator", "chiller", "mixer", "extruder", "furnace", "reactor", "drum",
    "centrifuge", "agitator", "blower", "fan", "engine", "mill", "lathe",
    "drill", "cnc", "robot", "actuator", "gearbox",
]
_EQUIPMENT_SIGNALS = [
    "equipment", "instrument", "sensor", "gauge", "analyzer", "transmitter",
    "panel", "meter", "controller", "detector", "scanner", "tool", "valve",
    "heat exchanger", "exchanger", "tank", "vessel", "filter unit",
]
_SPARE_PART_SIGNALS = [
    "spare", "bearing", "seal", "gasket", "impeller", "o-ring", "oring",
    "belt", "coupling", "bushing", "filter cartridge", "spare part",
    "part number", "kit", "shaft", "rotor", "stator", "blade set",
]
_FAILURE_SIGNALS = [
    "failure", "fault", "breakdown", "malfunction", "leak", "overheat",
    "overheating", "vibration", "crack", "corrosion", "wear", "seizure",
    "trip", "outage", "defect",
]
_INCIDENT_SIGNALS = [
    "incident", "accident", "near miss", "unplanned shutdown", "emergency",
    "safety event", "spill", "injury",
]
_VENDOR_SIGNALS = [
    "vendor", "supplier", "contractor", "oem", "manufacturer", "service provider",
    "distributor", "reseller",
]
# Industrial facility signals — a Location only becomes a Facility if it looks
# like a physical industrial site.
_FACILITY_SIGNALS = [
    "plant", "factory", "refinery", "workshop", "warehouse", "substation",
    "site", "unit", "bay", "deck", "shop floor", "production line", "line ",
    "yard", "terminal", "depot", "silo", "pump house", "control room",
    "boiler room", "compressor house", "storage area", "facility",
    "area", "processing", "block", "wing", "hall",
]

# Graph types that already denote a physical thing. For these, failure/incident
# *name* signals must never win — a "Vibration Sensor" is equipment, not a
# failure, even though "vibration" is a failure keyword.
_PHYSICAL_TYPES = {
    "machine", "equipment", "server", "vehicle", "sparepart",
    "location", "facility", "plant", "site",
}
# Business / HR / org-chart locations that must NEVER appear as assets, even
# though the extractor typed them as "Location".
_NON_FACILITY_SIGNALS = [
    "office", "headquarters", "hq", "branch", "region", "district", "division",
    "department", "sales", "marketing", "finance", "human resource", "hr ",
    "corporate", "campus", "zone", "territory", "market", "subsidiary",
    "board", "reception", "cafeteria", "meeting room",
]


def _norm(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip().lower())


def _has(text: str, signals: List[str]) -> bool:
    return any(s in text for s in signals)


def classify_asset(node_type: Any, name: Any, properties: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """
    Returns the asset category for a knowledge-graph entity, or None if the
    entity is not a maintainable asset (person, skill, business region, SOP,
    maintenance record, …) and must be kept out of the Maintenance module.

    Classification uses the entity's graph type first, then falls back to
    signals in its name. Unknown entities with no asset signal return None —
    we never guess an entity into the asset register.
    """
    ntype = _norm(node_type)
    text = _norm(name)
    props = properties or {}
    # Some extracted entities carry a descriptive sub-type (e.g. Machine nodes
    # get {"type": "Pump"}); include it so it can drive the signal match.
    subtype = _norm(props.get("type") or props.get("category") or "")
    haystack = f"{text} {subtype}".strip()

    if not haystack:
        return None

    # 1. Hard exclusions by graph type — people, procedures, records.
    if ntype in _NEVER_ASSET_TYPES:
        return None

    is_physical = ntype in _PHYSICAL_TYPES

    # 2. Event-like entities, by explicit graph type.
    if ntype in ("incident", "incidentreport"):
        return INCIDENTS
    if ntype == "failure":
        return FAILURES

    # 3. Event-like entities by name signal — only for entities NOT already
    #    typed as a physical asset, so "Vibration Sensor" stays equipment and
    #    "Bearing failure" is still a failure rather than a spare part.
    if not is_physical:
        if _has(haystack, _INCIDENT_SIGNALS):
            return INCIDENTS
        if _has(haystack, _FAILURE_SIGNALS):
            return FAILURES

    # 4. Parties. An Organization is only an asset-register entry when it acts
    #    as a vendor/supplier; the operating company itself is not an asset.
    if ntype in ("vendor", "supplier", "manufacturer"):
        return VENDORS
    if ntype == "organization":
        return VENDORS if _has(haystack, _VENDOR_SIGNALS) else None
    if not is_physical and _has(haystack, _VENDOR_SIGNALS):
        return VENDORS

    # 5. Locations. Industrial sites become Facilities; employee locations and
    #    business regions are excluded entirely.
    if ntype in ("location", "facility", "plant", "site"):
        if _has(haystack, _NON_FACILITY_SIGNALS):
            return None
        if ntype != "location" or _has(haystack, _FACILITY_SIGNALS):
            return FACILITIES
        return None
    if _has(haystack, _NON_FACILITY_SIGNALS):
        return None  # e.g. a stray "Sales Region"/"HR Department" typed otherwise

    # 6. Physical assets — most specific signal wins.
    if ntype == "sparepart" or _has(haystack, _SPARE_PART_SIGNALS):
        return SPARE_PARTS
    if ntype == "server" or _has(haystack, _SERVER_SIGNALS):
        return SERVERS
    if ntype == "vehicle" or _has(haystack, _VEHICLE_SIGNALS):
        return VEHICLES
    if _has(haystack, _EQUIPMENT_SIGNALS):
        return EQUIPMENT
    if _has(haystack, _MACHINE_SIGNALS):
        return MACHINES
    if _has(haystack, _FACILITY_SIGNALS):
        return FACILITIES

    # 7. Typed as an asset but with no distinguishing name signal.
    if ntype == "machine":
        return MACHINES
    if ntype == "equipment":
        return EQUIPMENT

    # 8. No asset signal at all — not part of the asset register.
    return None
