"""
Query normalization & alias expansion for the AI Chat retrieval pipeline.

Retrieval accuracy suffers badly when the *words* in the question differ from
the *words* in the document even though they mean the same thing. A user asks
for the "R&D budget" but the document says "Research and Development
allocation"; a keyword/BM25/full-text search then finds nothing, and even
embedding search can miss short acronyms. This module bridges that gap by
detecting known aliases in the query and expanding it with every equivalent
surface form, so all three retrievers (FAISS semantic, PostgreSQL full-text,
BM25) get the vocabulary they need to match.

Grounded and deterministic — this only rewrites the *query*, never the answer,
and adds no external knowledge beyond a fixed synonym table.
"""
import re
from dataclasses import dataclass, field
from typing import List, Tuple


# Bidirectional alias groups. If ANY surface form in a group appears in the
# query, every other form is added as an extra search term / synonym phrase.
# Kept curated (not auto-generated) so expansion stays precise and predictable.
ALIAS_GROUPS: List[List[str]] = [
    # ── Finance / corporate ───────────────────────────────────────────────
    ["R&D", "R and D", "R_and_D", "RnD", "Research and Development", "Research & Development"],
    ["CapEx", "Capital Expenditure", "Capital Expenditures", "Capital Expense"],
    ["OpEx", "Operating Expenditure", "Operating Expenses", "Operational Expenditure"],
    ["EBITDA", "Earnings Before Interest Taxes Depreciation and Amortization"],
    ["ROI", "Return on Investment"],
    ["COGS", "Cost of Goods Sold"],
    ["YoY", "Year over Year", "Year on Year"],
    ["FY", "Fiscal Year", "Financial Year"],
    ["TCO", "Total Cost of Ownership"],
    ["P&L", "Profit and Loss", "Profit & Loss"],
    ["AR", "Accounts Receivable"],
    ["AP", "Accounts Payable"],
    # ── Operations / maintenance ──────────────────────────────────────────
    ["MTTR", "Mean Time To Repair"],
    ["MTBF", "Mean Time Between Failures"],
    ["OEE", "Overall Equipment Effectiveness"],
    ["RCA", "Root Cause Analysis"],
    ["PM", "Preventive Maintenance", "Preventative Maintenance"],
    ["SOP", "Standard Operating Procedure", "Standard Operating Procedures"],
    ["BOM", "Bill of Materials"],
    ["KPI", "Key Performance Indicator", "Key Performance Indicators"],
    ["SLA", "Service Level Agreement"],
    ["WO", "Work Order", "Work Orders"],
    ["PdM", "Predictive Maintenance"],
    # ── Quality / safety / HR ─────────────────────────────────────────────
    ["QA", "Quality Assurance"],
    ["QC", "Quality Control"],
    ["HSE", "Health Safety and Environment", "Health, Safety and Environment"],
    ["PPE", "Personal Protective Equipment"],
    ["HR", "Human Resources"],
]


_SEP_RE = re.compile(r"[&_\-/.,]+")
_WS_RE = re.compile(r"\s+")
_TOKEN_RE = re.compile(r"[a-z0-9]+")

# Function words excluded from lexical terms so the query "what is the R&D
# budget" contributes the meaningful tokens (r, d, budget, research,
# development) rather than trivially matching every chunk via "is"/"the".
_STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "what", "when", "where", "who", "whom", "which", "why", "how", "whose",
    "do", "does", "did", "doing", "of", "at", "by", "for", "with", "about",
    "to", "from", "in", "on", "and", "or", "but", "if", "as", "this", "that",
    "these", "those", "it", "its", "their", "our", "your", "my", "me", "we",
    "you", "they", "them", "please", "show", "tell", "give", "list", "find",
    "get", "there", "here", "any", "all", "some", "much", "many",
}


def _norm(text: str) -> str:
    """Normalize for alias matching: lowercase, '&'→'and', drop separators."""
    low = text.lower().replace("&", " and ")
    low = _SEP_RE.sub(" ", low)
    return _WS_RE.sub(" ", low).strip()


def content_tokens(text: str) -> List[str]:
    """Meaningful lowercase tokens (stopwords removed), numbers kept."""
    return [
        t for t in _TOKEN_RE.findall(text.lower())
        if t not in _STOPWORDS and (len(t) >= 2 or t.isdigit())
    ]


# Precomputed normalized forms so matching is a cheap substring test.
_NORM_GROUPS: List[Tuple[List[str], List[str]]] = [
    ([_norm(v) for v in group], group) for group in ALIAS_GROUPS
]


@dataclass
class ExpandedQuery:
    original: str
    # Query text (original + synonym phrases) fed to the embedding model.
    semantic_query: str
    # De-duplicated lexical tokens (original + synonyms) for BM25 / FTS.
    lexical_terms: List[str] = field(default_factory=list)
    # (matched surface form, [added synonyms]) — for debug logging only.
    matched_aliases: List[Tuple[str, List[str]]] = field(default_factory=list)


def expand_query(query: str) -> ExpandedQuery:
    """
    Detect known aliases in `query` and expand it with every equivalent form.

    Returns an ExpandedQuery carrying a synonym-enriched semantic query string
    (for FAISS) and a de-duplicated lexical-term list (for BM25 / Postgres FTS).
    A query with no known alias passes through unchanged (semantic_query ==
    query, lexical_terms == its content tokens).
    """
    norm_q = f" {_norm(query)} "
    added_phrases: List[str] = []
    matched: List[Tuple[str, List[str]]] = []

    for norm_variants, original_variants in _NORM_GROUPS:
        present_idx = [i for i, nv in enumerate(norm_variants) if f" {nv} " in norm_q]
        if not present_idx:
            continue
        present_norms = {norm_variants[i] for i in present_idx}
        others = [ov for nv, ov in zip(norm_variants, original_variants) if nv not in present_norms]
        if others:
            added_phrases.extend(others)
            matched.append((original_variants[present_idx[0]], others))

    if added_phrases:
        semantic_query = f"{query} ({'; '.join(added_phrases)})"
    else:
        semantic_query = query

    lexical: List[str] = list(content_tokens(query))
    for phrase in added_phrases:
        lexical.extend(content_tokens(phrase))

    # De-duplicate while preserving order.
    seen = set()
    lexical_terms = [t for t in lexical if not (t in seen or seen.add(t))]

    return ExpandedQuery(
        original=query,
        semantic_query=semantic_query,
        lexical_terms=lexical_terms,
        matched_aliases=matched,
    )
