"""
Backward-compatibility shim.

The real, schema-driven classification now lives in
app.services.entity_classifier (returning a specific asset_type + confidence)
driven by app.services.asset_taxonomy. This module preserves the older
coarse-category API (`classify_asset` -> "Machines"/"Servers"/… or None) that
existing callers and tests were written against, by mapping the new asset types
onto the original nine categories.
"""
from typing import Any, Dict, Optional

from app.services.entity_classifier import classify_entity

# ── Legacy coarse categories ─────────────────────────────────────────────────
FACILITIES = "Facilities"
MACHINES = "Machines"
SERVERS = "Servers"
EQUIPMENT = "Equipment"
VEHICLES = "Vehicles"
SPARE_PARTS = "Spare Parts"
FAILURES = "Failures"
INCIDENTS = "Incidents"
VENDORS = "Vendors"

ASSET_CATEGORIES = [
    MACHINES, EQUIPMENT, SERVERS, VEHICLES, FACILITIES,
    SPARE_PARTS, FAILURES, INCIDENTS, VENDORS,
]
MAINTAINABLE_CATEGORIES = {MACHINES, EQUIPMENT, SERVERS, VEHICLES, FACILITIES, SPARE_PARTS}

# Specific asset_type (from the taxonomy) -> legacy coarse category.
_TYPE_TO_CATEGORY: Dict[str, str] = {
    "Pump": MACHINES, "Motor": MACHINES, "Compressor": MACHINES, "Turbine": MACHINES,
    "Generator": MACHINES, "Transformer": MACHINES, "Valve": MACHINES, "Conveyor": MACHINES,
    "Machine": MACHINES,
    "Server": SERVERS, "Database": SERVERS, "Storage Cluster": SERVERS, "Network Device": SERVERS,
    "Equipment": EQUIPMENT, "Sensor": EQUIPMENT, "PLC": EQUIPMENT, "Tool": EQUIPMENT,
    "Vehicle": VEHICLES,
    "Facility": FACILITIES, "Plant": FACILITIES, "Production Line": FACILITIES,
    "Spare Part": SPARE_PARTS,
    "Failure": FAILURES, "Incident": INCIDENTS, "Vendor": VENDORS,
    # "Maintenance Activity" and "Risk" have no legacy category -> None.
}


def classify_asset(node_type: Any, name: Any, properties: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """Legacy API: returns the coarse category string, or None if not an asset."""
    result = classify_entity(node_type, name, properties)
    if result is None:
        return None
    return _TYPE_TO_CATEGORY.get(result.asset_type)
