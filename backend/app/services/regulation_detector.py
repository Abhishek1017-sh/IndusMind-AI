"""
Regulation / standard detector.

Scans a document's own text for the compliance standards and regulations it
actually references, so the Compliance module can show which frameworks apply
to the uploaded corpus — domain-aware and generic across industries. Purely
grounded: a regulation is reported only if its name/number appears in the text,
never invented, each with the snippet it was matched from and a confidence.
"""
import re
from typing import List, Dict, Any

# Catalog of regulations/standards, each with the industry domain it implies
# and the text patterns that identify it. Extend this list to support more
# frameworks — it is configuration, not per-document logic.
_REGULATIONS = [
    # code, name, domain, [regex patterns]
    ("ISO 9001", "ISO 9001 — Quality Management", "Manufacturing / General", [r"iso[\s\-]*9001"]),
    ("ISO 14001", "ISO 14001 — Environmental Management", "Environment", [r"iso[\s\-]*14001"]),
    ("ISO 45001", "ISO 45001 — Occupational Health & Safety", "Safety", [r"iso[\s\-]*45001", r"ohsas[\s\-]*18001"]),
    ("ISO 27001", "ISO 27001 — Information Security", "Cybersecurity", [r"iso[\s\-]*27001", r"iso[\s/]*iec[\s\-]*27001"]),
    ("ISO 50001", "ISO 50001 — Energy Management", "Energy", [r"iso[\s\-]*50001"]),
    ("IATF 16949", "IATF 16949 — Automotive Quality", "Automotive", [r"iatf[\s\-]*16949", r"ts[\s\-]*16949"]),
    ("OSHA", "OSHA — Occupational Safety", "Safety / Construction", [r"\bosha\b", r"occupational safety and health"]),
    ("HACCP", "HACCP — Food Safety", "Food", [r"\bhaccp\b", r"hazard analysis critical control"]),
    ("HIPAA", "HIPAA — Health Data Privacy", "Healthcare", [r"\bhipaa\b"]),
    ("NABH", "NABH — Hospital Accreditation", "Healthcare", [r"\bnabh\b"]),
    ("PCI DSS", "PCI DSS — Payment Card Security", "Finance", [r"pci[\s\-]*dss", r"payment card industry"]),
    ("SOC 2", "SOC 2 — Service Org Controls", "Cybersecurity / Finance", [r"\bsoc[\s\-]*2\b", r"soc[\s\-]*ii"]),
    ("NIST", "NIST Cybersecurity Framework", "Cybersecurity", [r"\bnist\b"]),
    ("CIS Controls", "CIS Controls", "Cybersecurity", [r"\bcis controls?\b", r"center for internet security"]),
    ("GDPR", "GDPR — Data Protection", "Data Privacy", [r"\bgdpr\b", r"general data protection regulation"]),
    ("API Standard", "API Standards (Oil & Gas)", "Oil & Gas", [r"\bapi[\s\-]*(?:5[0-9]{2}|6[0-9]{2}|1[0-9]{3})\b", r"american petroleum institute"]),
    ("OISD", "OISD — Oil Industry Safety", "Oil & Gas", [r"\boisd\b"]),
    ("PESO", "PESO — Explosives/Pressure Safety", "Oil & Gas / Safety", [r"\bpeso\b", r"petroleum and explosives safety"]),
    ("IEC 61508", "IEC 61508/61511 — Functional Safety", "Process Safety", [r"iec[\s\-]*6150[0-9]", r"iec[\s\-]*6151[0-9]"]),
    ("Factory Act", "Factories Act", "Manufacturing (India)", [r"factor(?:y|ies) act"]),
    ("SOX", "Sarbanes-Oxley", "Finance", [r"sarbanes[\s\-]*oxley", r"\bsox\b"]),
]

_COMPILED = [
    (code, name, domain, [re.compile(p, re.IGNORECASE) for p in patterns])
    for code, name, domain, patterns in _REGULATIONS
]


def detect_regulations(text: str) -> List[Dict[str, Any]]:
    """
    Returns the regulations referenced in `text`, each as
    {code, name, domain, confidence, snippet}. Confidence reflects how
    explicitly it was matched (a full standard number is more certain than a
    bare acronym). Empty list when none are mentioned.
    """
    if not text:
        return []
    found: List[Dict[str, Any]] = []
    for code, name, domain, patterns in _COMPILED:
        for pat in patterns:
            m = pat.search(text)
            if not m:
                continue
            # Snippet around the match for provenance.
            start = max(0, m.start() - 40)
            end = min(len(text), m.end() + 40)
            snippet = re.sub(r"\s+", " ", text[start:end]).strip()
            # A numeric standard reference (contains a digit) is high confidence;
            # a bare acronym is medium.
            confidence = 0.95 if any(ch.isdigit() for ch in m.group(0)) else 0.8
            found.append({
                "code": code, "name": name, "domain": domain,
                "confidence": confidence, "snippet": snippet,
            })
            break  # one match per regulation is enough
    return found


def dominant_domain(regulations: List[Dict[str, Any]]) -> str:
    """The most-represented industry domain among detected regulations."""
    if not regulations:
        return ""
    counts: Dict[str, int] = {}
    for r in regulations:
        counts[r["domain"]] = counts.get(r["domain"], 0) + 1
    return max(counts, key=counts.get)
