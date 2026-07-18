"""
Compliance engine — evidence-based, cross-document compliance validation.

This is the differentiator: instead of just saying "compliant" or "violation",
it extracts the *requirements* a document states (e.g. an SOP: "inspect every
30 days") and the *observations* documents record (e.g. a log: "last inspection
72 days ago"), then validates them against each other ACROSS documents to
surface concrete, cited findings ("Inspection overdue by 42 days") with the
supporting evidence from both source documents.

Everything is rule-based and grounded — a requirement/observation/finding
exists only because it appears in the uploaded text, never invented. When
Gemini is available it can enrich this; the deterministic core stands alone so
it is fully testable offline.
"""
import re
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional

# ── Activity vocabulary (what is being inspected/serviced/etc.) ──────────────
# stem -> canonical activity. Matched case-insensitively as a word prefix.
_ACTIVITY_STEMS = {
    "inspect": "inspection", "calibrat": "calibration", "servic": "service",
    "maintain": "maintenance", "maintenance": "maintenance", "test": "testing",
    "audit": "audit", "replac": "replacement", "lubricat": "lubrication",
    "overhaul": "overhaul", "clean": "cleaning", "drill": "drill",
    "renew": "renewal", "certif": "certification",
}

# Named frequencies -> interval in days.
_NAMED_FREQ = {
    "daily": 1, "weekly": 7, "fortnightly": 14, "biweekly": 14, "monthly": 30,
    "bimonthly": 60, "bi-monthly": 60, "quarterly": 90, "semi-annually": 182,
    "semiannually": 182, "biannually": 182, "half-yearly": 182, "annually": 365,
    "yearly": 365, "annual": 365,
}

_UNIT_DAYS = {"day": 1, "week": 7, "month": 30, "year": 365}

_SENT_SPLIT = re.compile(r"(?<=[.!?;\n])\s+")

# "every 30 days", "at intervals of 3 months", "once every 6 months"
_INTERVAL_RE = re.compile(
    r"(?:every|each|at intervals of|interval of|once every|per)\s+(\d+)\s*(day|week|month|year)s?",
    re.IGNORECASE,
)
# "N days/months ago"
_AGO_RE = re.compile(r"(\d+)\s*(day|week|month|year)s?\s+ago", re.IGNORECASE)

# Dates: ISO, D/M/Y, "Month YYYY", "DD Month YYYY", "Month DD, YYYY"
_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
_DATE_RE = re.compile(
    r"\b(\d{4}-\d{2}-\d{2})\b"
    r"|\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b"
    r"|\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b"
    r"|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b"
    r"|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b",
    re.IGNORECASE,
)


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _activity_in(text: str) -> Optional[str]:
    low = text.lower()
    for stem, canon in _ACTIVITY_STEMS.items():
        if stem in low:
            return canon
    return None


def _parse_date(text: str) -> Optional[date]:
    m = _DATE_RE.search(text)
    if not m:
        return None
    try:
        if m.group(1):  # ISO
            return datetime.strptime(m.group(1), "%Y-%m-%d").date()
        if m.group(2):  # D/M/Y
            d, mo, y = int(m.group(2)), int(m.group(3)), int(m.group(4))
            if y < 100:
                y += 2000
            if mo > 12:  # tolerate M/D/Y
                d, mo = mo, d
            return date(y, mo, d)
        if m.group(5):  # DD Month YYYY
            return date(int(m.group(7)), _MONTHS[m.group(6)[:3].lower()], int(m.group(5)))
        if m.group(8):  # Month DD, YYYY
            return date(int(m.group(10)), _MONTHS[m.group(8)[:3].lower()], int(m.group(9)))
        if m.group(11):  # Month YYYY
            return date(int(m.group(12)), _MONTHS[m.group(11)[:3].lower()], 1)
    except (ValueError, KeyError):
        return None
    return None


def _interval_days(sentence: str) -> Optional[int]:
    m = _INTERVAL_RE.search(sentence)
    if m:
        return int(m.group(1)) * _UNIT_DAYS[m.group(2).lower()]
    low = sentence.lower()
    for word, days in _NAMED_FREQ.items():
        if re.search(r"\b" + re.escape(word) + r"\b", low):
            return days
    return None


def extract_requirements(text: str, source_filename: str) -> List[Dict[str, Any]]:
    """Interval requirements a document mandates, e.g. 'inspect every 30 days'."""
    out = []
    for sent in _SENT_SPLIT.split(text or ""):
        activity = _activity_in(sent)
        if not activity:
            continue
        interval = _interval_days(sent)
        if interval is None:
            continue
        out.append({
            "activity": activity,
            "interval_days": interval,
            "source_document": source_filename,
            "snippet": _clean(sent)[:220],
        })
    return out


def extract_observations(text: str, source_filename: str, reference_date: Optional[date] = None) -> List[Dict[str, Any]]:
    """
    Records of when an activity last happened, e.g. 'last inspection 2026-01-04'
    or 'inspected 72 days ago'. `reference_date` (the document's upload date)
    anchors relative "N ago" phrasing.
    """
    ref = reference_date or datetime.utcnow().date()
    out = []
    for sent in _SENT_SPLIT.split(text or ""):
        activity = _activity_in(sent)
        if not activity:
            continue
        # Only treat as an observation if it reads like a past event.
        low = sent.lower()
        is_pastish = any(w in low for w in ("last", "previous", "most recent", "performed",
                                            "completed", "conducted", "carried out", "done on",
                                            "dated", " on ", "ago"))
        ago = _AGO_RE.search(sent)
        last_date = _parse_date(sent)
        if not (ago or last_date) or not is_pastish:
            continue
        if ago:
            days_since = int(ago.group(1)) * _UNIT_DAYS[ago.group(2).lower()]
            event_date = None
        else:
            event_date = last_date
            days_since = (ref - event_date).days
        if days_since < 0:
            continue
        out.append({
            "activity": activity,
            "event_date": event_date.isoformat() if event_date else None,
            "days_since": days_since,
            "source_document": source_filename,
            "snippet": _clean(sent)[:220],
        })
    return out


def extract_document_compliance(text: str, source_filename: str,
                                reference_date: Optional[date] = None) -> Dict[str, List[Dict[str, Any]]]:
    """Per-document compliance signals stored in Document.intelligence."""
    return {
        "requirements": extract_requirements(text, source_filename),
        "observations": extract_observations(text, source_filename, reference_date),
    }


def _severity(overdue_ratio: float) -> str:
    if overdue_ratio >= 3:
        return "Critical"
    if overdue_ratio >= 2:
        return "High"
    if overdue_ratio >= 1.3:
        return "Medium"
    return "Low"


def cross_document_findings(requirements: List[Dict[str, Any]],
                            observations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Validate observations against requirements ACROSS documents. For each
    activity that has both a mandated interval and a last-event record, flag an
    overdue violation (elapsed > interval) with severity, the overdue amount,
    confidence, a recommendation, and evidence from BOTH source documents.
    """
    findings: List[Dict[str, Any]] = []

    # Best (shortest) interval requirement per activity, and most-recent (max
    # days_since = worst) observation per activity.
    req_by_activity: Dict[str, Dict[str, Any]] = {}
    for r in requirements:
        a = r["activity"]
        if a not in req_by_activity or r["interval_days"] < req_by_activity[a]["interval_days"]:
            req_by_activity[a] = r
    obs_by_activity: Dict[str, Dict[str, Any]] = {}
    for o in observations:
        a = o["activity"]
        if a not in obs_by_activity or o["days_since"] > obs_by_activity[a]["days_since"]:
            obs_by_activity[a] = o

    for activity, req in req_by_activity.items():
        obs = obs_by_activity.get(activity)
        interval = req["interval_days"]
        if not obs:
            # Requirement stated but no evidence it was ever done.
            findings.append({
                "type": "missing_evidence",
                "severity": "Medium",
                "activity": activity,
                "title": f"No {activity} record found",
                "description": (f"A {activity} is required every {interval} day(s), but no "
                                f"{activity} record was found in the uploaded documents."),
                "overdue_days": None,
                "confidence": 0.7,
                "recommendation": f"Upload the latest {activity} record to verify compliance.",
                "cross_document": False,
                "evidence": [{"source_document": req["source_document"], "snippet": req["snippet"]}],
            })
            continue

        elapsed = obs["days_since"]
        if elapsed > interval:
            overdue = elapsed - interval
            ratio = elapsed / interval if interval else 99
            cross = req["source_document"] != obs["source_document"]
            findings.append({
                "type": "overdue",
                "severity": _severity(ratio),
                "activity": activity,
                "title": f"{activity.title()} overdue by {overdue} day(s)",
                "description": (f"{activity.title()} is required every {interval} day(s), but the last "
                                f"recorded {activity} was {elapsed} day(s) ago — overdue by {overdue} day(s)."),
                "overdue_days": overdue,
                "interval_days": interval,
                "elapsed_days": elapsed,
                "confidence": 0.9 if cross else 0.8,
                "recommendation": f"Schedule a {activity} immediately and record it to restore compliance.",
                "cross_document": cross,
                "evidence": [
                    {"source_document": req["source_document"], "snippet": req["snippet"], "role": "requirement"},
                    {"source_document": obs["source_document"], "snippet": obs["snippet"], "role": "last record"},
                ],
            })
        else:
            findings.append({
                "type": "compliant",
                "severity": "Low",
                "activity": activity,
                "title": f"{activity.title()} up to date",
                "description": (f"{activity.title()} interval is {interval} day(s); last recorded "
                                f"{elapsed} day(s) ago — within limit."),
                "overdue_days": 0,
                "confidence": 0.85,
                "recommendation": "",
                "cross_document": req["source_document"] != obs["source_document"],
                "evidence": [
                    {"source_document": req["source_document"], "snippet": req["snippet"], "role": "requirement"},
                    {"source_document": obs["source_document"], "snippet": obs["snippet"], "role": "last record"},
                ],
            })

    # Severity-first ordering (violations before compliant items).
    order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    findings.sort(key=lambda f: (f["type"] == "compliant", order.get(f["severity"], 9), -(f.get("overdue_days") or 0)))
    return findings


def build_timeline(observations: List[Dict[str, Any]],
                   findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    A chronological compliance timeline from the recorded activity events. Each
    event gets an ok/overdue status (an activity is 'overdue' if it appears in
    an overdue finding). Dates are absolute where stated, else derived from the
    'N days ago' phrasing relative to today.
    """
    overdue_activities = {f["activity"] for f in findings if f.get("type") == "overdue"}
    today = date.today()
    events = []
    for o in observations:
        if o.get("event_date"):
            when = o["event_date"]
        else:
            when = (today - timedelta(days=o.get("days_since", 0))).isoformat()
        events.append({
            "date": when,
            "activity": o["activity"],
            "event": f"{o['activity'].title()} recorded",
            "source_document": o.get("source_document"),
            "status": "overdue" if o["activity"] in overdue_activities else "ok",
        })
    events.sort(key=lambda e: e["date"])
    return events
