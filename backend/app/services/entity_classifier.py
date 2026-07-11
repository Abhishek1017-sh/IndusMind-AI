"""
Semantic entity classifier for the Maintenance module.

Given a knowledge-graph entity (extracted from an uploaded document), decide
which asset type it is — or that it is NOT a maintainable asset at all — driven
entirely by the schema in app.services.asset_taxonomy. Returns a structured
result with a confidence score and a human-readable reason, so the UI can flag
low-confidence extractions ("Needs Review") and users always know WHY something
was classified the way it was (explainability).

This is deterministic and generic: it works for any industrial document and
never invents an entity — an entity only reaches here because it was extracted
from a document the user uploaded.
"""
import re
from dataclasses import dataclass
from typing import Any, Dict, Optional

from app.services.asset_taxonomy import (
    ASSET_TAXONOMY, NEVER_ASSET_NODE_TYPES,
    BUSINESS_EXCLUSION_TERMS, MAINTAINABLE_GROUPS, confidence_band,
    GROUP_EVENT, GROUP_PARTY,
)

_WS = re.compile(r"\s+")


def _norm(text: Any) -> str:
    return _WS.sub(" ", str(text or "").strip().lower())


def _has(text: str, signals) -> bool:
    return any(s in text for s in signals)


@dataclass
class Classification:
    asset_type: str
    group: str
    confidence: float
    confidence_band: str
    reason: str

    @property
    def is_maintainable(self) -> bool:
        return self.group in MAINTAINABLE_GROUPS

    def as_dict(self) -> Dict[str, Any]:
        return {
            "asset_type": self.asset_type,
            "group": self.group,
            "confidence": round(self.confidence, 2),
            "confidence_band": self.confidence_band,
            "reason": self.reason,
        }


# Base confidence by how the match was made. A node whose graph type already IS
# the asset type is the most certain; a strong multi-word phrase next; a single
# weak keyword least. These are transparent heuristics (we have no LLM logprobs
# at this layer), documented so the score is explainable rather than arbitrary.
_CONF_NODE_TYPE = 0.92
_CONF_STRONG = 0.88
_CONF_WEAK = 0.70
# A generic node type ("Machine"/"Equipment"/"Facility") is deliberately scored
# BELOW a specific weak keyword, so "Vibration Sensor" typed as Machine is
# classified as a Sensor rather than a bare Machine.
_CONF_GENERIC_TYPE = 0.68


def classify_entity(
    node_type: Any,
    name: Any,
    properties: Optional[Dict[str, Any]] = None,
    corroborating_documents: int = 1,
) -> Optional[Classification]:
    """
    Classify a graph entity. Returns a Classification, or None if the entity is
    not a maintainable/relevant asset (person, skill, SOP, business region, …).

    `corroborating_documents` is how many of the user's documents reference this
    entity; being named in several documents raises confidence slightly (a real
    asset tends to recur), which is genuine cross-document evidence rather than a
    guess.
    """
    ntype = _norm(node_type)
    props = properties or {}
    subtype = _norm(props.get("type") or props.get("category") or "")
    text = _norm(name)
    haystack = f"{text} {subtype}".strip()

    if not haystack:
        return None

    # 1. Hard type exclusions — people, procedures, inspection reports, etc.
    if ntype in NEVER_ASSET_NODE_TYPES:
        return None

    # 2. Business / HR / Finance / Sales / Legal exclusion by name.
    if _has(haystack, BUSINESS_EXCLUSION_TERMS):
        return None

    is_physical_node = ntype in {
        "machine", "equipment", "server", "vehicle", "sparepart", "part",
        "location", "facility", "plant", "site", "sensor", "pump", "motor",
        "valve", "compressor", "turbine", "generator", "transformer",
        "conveyor", "networkdevice", "database", "storagecluster", "plc",
        "controller", "tool",
    }

    best: Optional[Classification] = None

    def consider(asset_type: str, group: str, confidence: float, reason: str):
        nonlocal best
        # Event/party name-signals must never override an entity already typed
        # as a physical asset (a "Vibration Sensor" is a Sensor, not a Failure).
        if is_physical_node and group in (GROUP_EVENT, GROUP_PARTY):
            return
        if best is None or confidence > best.confidence:
            best = Classification(asset_type, group, confidence, confidence_band(confidence), reason)

    for spec in ASSET_TAXONOMY:
        # a) graph node type directly implies this asset type
        if ntype in spec.node_types:
            # If it's a generic type (Machine/Equipment) we may still find a more
            # specific signal below, so score it as a solid-but-not-max match.
            base = _CONF_NODE_TYPE if spec.asset_type not in ("Machine", "Equipment", "Facility") else _CONF_GENERIC_TYPE
            consider(spec.asset_type, spec.group, base,
                     f"graph node type '{node_type}' maps to {spec.asset_type}")
        # b) strong phrase signal in the name
        if _has(haystack, spec.strong):
            consider(spec.asset_type, spec.group, _CONF_STRONG,
                     f"name contains a strong {spec.asset_type} indicator")
        # c) weak keyword signal in the name
        elif _has(haystack, spec.weak):
            consider(spec.asset_type, spec.group, _CONF_WEAK,
                     f"name contains a {spec.asset_type} keyword")

    if best is None:
        return None

    # Cross-document corroboration nudge (+0.03 per extra document, capped).
    if corroborating_documents > 1:
        bonus = min(0.06, 0.03 * (corroborating_documents - 1))
        conf = min(0.99, best.confidence + bonus)
        best = Classification(best.asset_type, best.group, conf, confidence_band(conf),
                              best.reason + f"; corroborated across {corroborating_documents} documents")

    return best
