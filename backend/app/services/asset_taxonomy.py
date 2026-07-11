"""
Schema-driven asset taxonomy for the Maintenance Intelligence module.

Everything the classifier knows about asset classes lives HERE as data, not as
hardcoded branches scattered through the code — so supporting a new asset class
(or tuning what counts as a business entity to ignore) is a config edit, and
the same pipeline works for any industrial document. Nothing here is specific
to any particular uploaded file.

An `AssetTypeSpec` maps a specific asset type (Pump, Server, PLC, Transformer…)
to a coarse `group` used for KPIs/colour-coding, plus the vocabulary signals
that identify it and, optionally, the raw graph node types that imply it.
"""
from dataclasses import dataclass, field
from typing import List, Dict


# ── Coarse groups (drive KPIs, filtering and colour-coding) ──────────────────
GROUP_ASSET = "asset"        # maintainable physical thing
GROUP_FACILITY = "facility"  # site / building / area
GROUP_PARTY = "party"        # vendor / supplier
GROUP_EVENT = "event"        # incident / failure
GROUP_ACTIVITY = "activity"  # maintenance activity / work order
GROUP_RISK = "risk"          # risk item

# Groups whose members belong in the maintainable asset register.
MAINTAINABLE_GROUPS = {GROUP_ASSET, GROUP_FACILITY}


@dataclass(frozen=True)
class AssetTypeSpec:
    asset_type: str
    group: str
    # Multi-word phrases are strong signals; single words are weak signals.
    strong: List[str] = field(default_factory=list)
    weak: List[str] = field(default_factory=list)
    # Graph node-type labels (lowercased) that directly imply this asset type.
    node_types: List[str] = field(default_factory=list)


# ── The taxonomy. Order matters: the classifier prefers the FIRST spec whose
#    signals match, so put more specific types before generic ones. ──────────
ASSET_TAXONOMY: List[AssetTypeSpec] = [
    # ---- Events (checked early so a failure isn't mistaken for a part) -------
    AssetTypeSpec("Incident", GROUP_EVENT,
                  strong=["incident report", "unplanned shutdown", "near miss", "safety incident",
                          "operational incident", "service outage", "outage report"],
                  weak=["incident", "accident", "spill", "injury", "emergency"],
                  node_types=["incident", "incidentreport"]),
    AssetTypeSpec("Failure", GROUP_EVENT,
                  strong=["failure mode", "equipment failure", "root cause", "breakdown"],
                  weak=["failure", "fault", "malfunction", "seizure", "rupture", "burnout"],
                  node_types=["failure"]),
    AssetTypeSpec("Risk", GROUP_RISK,
                  strong=["risk assessment", "risk register", "hazard analysis", "single point of failure"],
                  weak=["risk", "hazard", "threat", "vulnerability"],
                  node_types=["risk"]),
    AssetTypeSpec("Maintenance Activity", GROUP_ACTIVITY,
                  strong=["work order", "maintenance activity", "preventive maintenance",
                          "service task", "maintenance record"],
                  weak=[],
                  node_types=["maintenancerecord", "workorder", "maintenanceactivity"]),

    # ---- Parties -------------------------------------------------------------
    AssetTypeSpec("Vendor", GROUP_PARTY,
                  strong=["service provider", "original equipment manufacturer"],
                  weak=["vendor", "supplier", "contractor", "oem", "manufacturer", "distributor"],
                  node_types=["vendor", "supplier", "manufacturer"]),

    # ---- IT / OT assets ------------------------------------------------------
    AssetTypeSpec("Network Device", GROUP_ASSET,
                  strong=["network switch", "network router", "load balancer", "access point", "firewall appliance"],
                  weak=["firewall", "router", "switch", "gateway", "modem"],
                  node_types=["networkdevice"]),
    AssetTypeSpec("Storage Cluster", GROUP_ASSET,
                  strong=["storage cluster", "storage array", "san ", "nas ", "disk array", "storage node"],
                  weak=[],
                  node_types=["storagecluster", "storage"]),
    AssetTypeSpec("Database", GROUP_ASSET,
                  strong=["database server", "db instance", "database cluster", "postgres", "oracle db",
                          "sql server", "mysql", "mongodb"],
                  weak=["database"],
                  node_types=["database"]),
    AssetTypeSpec("Server", GROUP_ASSET,
                  strong=["application server", "web server", "rack server", "blade server", "hypervisor",
                          "virtual machine", "compute node", "scada server", "historian server"],
                  weak=["server", "hypervisor"],
                  node_types=["server"]),
    AssetTypeSpec("PLC", GROUP_ASSET,
                  strong=["programmable logic controller", "plc rack", "control system", "dcs "],
                  weak=["plc", "rtu", "hmi"],
                  node_types=["plc", "controller"]),
    AssetTypeSpec("Sensor", GROUP_ASSET,
                  strong=["pressure sensor", "temperature sensor", "vibration sensor", "flow sensor",
                          "level sensor", "proximity sensor"],
                  weak=["sensor", "transmitter", "transducer", "detector", "gauge", "probe"],
                  node_types=["sensor"]),

    # ---- Rotating / process equipment ---------------------------------------
    AssetTypeSpec("Pump", GROUP_ASSET, weak=["pump"], node_types=["pump"]),
    AssetTypeSpec("Motor", GROUP_ASSET, weak=["motor"], node_types=["motor"]),
    AssetTypeSpec("Compressor", GROUP_ASSET, weak=["compressor"], node_types=["compressor"]),
    AssetTypeSpec("Turbine", GROUP_ASSET, weak=["turbine"], node_types=["turbine"]),
    AssetTypeSpec("Generator", GROUP_ASSET, weak=["generator", "genset"], node_types=["generator"]),
    AssetTypeSpec("Transformer", GROUP_ASSET, weak=["transformer"], node_types=["transformer"]),
    AssetTypeSpec("Valve", GROUP_ASSET, weak=["valve"], node_types=["valve"]),
    AssetTypeSpec("Conveyor", GROUP_ASSET, weak=["conveyor", "belt line"], node_types=["conveyor"]),
    AssetTypeSpec("Vehicle", GROUP_ASSET,
                  strong=["lift truck", "pallet jack"],
                  weak=["vehicle", "truck", "forklift", "crane", "van", "loader", "excavator",
                        "trailer", "tractor", "bulldozer", "fleet"],
                  node_types=["vehicle", "fleet"]),

    # ---- Parts and tools -----------------------------------------------------
    AssetTypeSpec("Spare Part", GROUP_ASSET,
                  strong=["spare part", "part number", "replacement part"],
                  weak=["spare", "bearing", "seal", "gasket", "impeller", "o-ring", "oring", "belt",
                        "coupling", "bushing", "shaft", "rotor", "stator", "cartridge", "kit"],
                  node_types=["sparepart", "part"]),
    AssetTypeSpec("Tool", GROUP_ASSET,
                  strong=["torque wrench", "calibration tool", "measuring instrument"],
                  weak=["tool", "wrench", "jig", "fixture"],
                  node_types=["tool"]),

    # ---- Facilities / sites --------------------------------------------------
    AssetTypeSpec("Production Line", GROUP_FACILITY,
                  strong=["production line", "assembly line", "packaging line", "process train"],
                  weak=["line", "train"],
                  node_types=["productionline"]),
    AssetTypeSpec("Plant", GROUP_FACILITY,
                  strong=["power plant", "processing plant", "manufacturing plant", "treatment plant"],
                  weak=["plant", "refinery"],
                  node_types=["plant"]),
    # NOTE: raw "location" node type is deliberately NOT listed here — a Location
    # only becomes a Facility when its NAME carries an industrial signal, so
    # employee locations / business regions are not swept into the register.
    AssetTypeSpec("Facility", GROUP_FACILITY,
                  strong=["pump house", "control room", "boiler room", "compressor house", "shop floor",
                          "storage area", "processing area", "utility bay"],
                  weak=["facility", "factory", "workshop", "warehouse", "substation", "site", "bay",
                        "deck", "yard", "terminal", "depot", "silo", "area", "block", "wing", "hall"],
                  node_types=["facility", "site"]),

    # ---- Generic fallbacks (only reached if nothing specific matched) --------
    AssetTypeSpec("Equipment", GROUP_ASSET,
                  strong=["heat exchanger", "pressure vessel"],
                  weak=["equipment", "instrument", "panel", "meter", "controller", "analyzer",
                        "exchanger", "tank", "vessel", "filter", "actuator", "gearbox", "boiler",
                        "chiller", "mixer", "extruder", "furnace", "reactor", "drum", "blower",
                        "fan", "engine", "mill", "lathe", "drill", "cnc", "robot"],
                  node_types=["equipment"]),
    AssetTypeSpec("Machine", GROUP_ASSET, weak=["machine"], node_types=["machine"]),
]

# Fast lookup: asset_type -> group.
ASSET_TYPE_GROUP: Dict[str, str] = {s.asset_type: s.group for s in ASSET_TAXONOMY}
ASSET_TYPES: List[str] = [s.asset_type for s in ASSET_TAXONOMY]


# ── Graph node types that can NEVER be a maintainable asset ──────────────────
# People, competencies, temporal/contact facts, procedures. Records/SOPs are
# surfaced as history/related documents, not as asset cards.
NEVER_ASSET_NODE_TYPES = {
    "person", "engineer", "technician", "employee", "operator", "contact",
    "skill", "date", "project", "event", "document", "sop", "certification",
    "training", "inspectionreport", "report",
}

# ── Business / HR / Finance / Sales / Legal entities to exclude entirely ─────
# If any of these terms appears in an entity's name it is NOT a maintainable
# asset, regardless of how the extractor typed it. Configurable, generic.
BUSINESS_EXCLUSION_TERMS = [
    "office", "headquarters", "hq", "branch", "region", "district", "division",
    "department", "sales", "marketing", "finance", "financial", "accounting",
    "human resource", "hr ", "payroll", "salary", "compensation", "recruit",
    "legal", "contract", "invoice", "customer", "client", "procurement budget",
    "revenue", "profit", "corporate", "campus", "zone", "territory", "market",
    "subsidiary", "board", "reception", "cafeteria", "meeting room", "committee",
    "shareholder", "investor", "tax",
]


# ── Confidence bands (req 10) ────────────────────────────────────────────────
BAND_NEEDS_REVIEW = "Needs Review"      # confidence < 0.65
BAND_REVIEW = "Review Suggested"        # 0.65 <= confidence <= 0.90
BAND_AUTO_APPROVED = "Auto Approved"    # confidence > 0.90


def confidence_band(confidence: float) -> str:
    if confidence < 0.65:
        return BAND_NEEDS_REVIEW
    if confidence > 0.90:
        return BAND_AUTO_APPROVED
    return BAND_REVIEW
