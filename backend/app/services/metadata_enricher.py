"""
Metadata enricher — extracts structured asset metadata (the 25 enrichment
fields) from a document's text using Gemini, WITH provenance (a text snippet
the value came from) and a confidence per field.

Strictly grounded: a field is only returned if it is actually stated in the
document. When Gemini is unavailable, this returns nothing — missing values
stay NULL and are never invented (req 3, 11).
"""
import os
import json
import logging
from typing import Dict, Any, List

import google.generativeai as genai

from app.core.config import settings
from app.services.asset_store import METADATA_FIELDS

logger = logging.getLogger(__name__)


def enrich_assets(text: str, asset_names: List[str]) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """
    Returns { asset_name: { field: {"value","confidence","snippet"} } } for the
    given assets, using only what the document text states. Empty dict when
    Gemini is unavailable or nothing is stated.
    """
    api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "")
    if not api_key or not asset_names:
        return {}

    excerpt = text[:12000]
    fields = ", ".join(METADATA_FIELDS)
    prompt = f"""
You are an industrial asset data extractor. For each asset listed, extract ONLY
the metadata fields that are explicitly stated in the document text. Do NOT
guess or infer values that are not written. If a field is not present for an
asset, omit it.

Assets: {json.dumps(asset_names)}

Allowed fields: {fields}

Document text:
---
{excerpt}
---

Return EXACT JSON mapping each asset name to an object of the fields you found,
where each field maps to an object with "value" (string), "confidence" (0-1
float for how certain the extraction is), and "snippet" (the short exact text
the value came from). Example:
{{
  "Pump P-102": {{
    "manufacturer": {{"value": "Grundfos", "confidence": 0.9, "snippet": "Manufacturer: Grundfos"}},
    "criticality": {{"value": "High", "confidence": 0.8, "snippet": "criticality rated High"}}
  }}
}}
Only include assets and fields that are actually present. No markdown, no prose.
"""
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(prompt, generation_config={"response_mime_type": "application/json"})
        data = json.loads(response.text.strip())
        if not isinstance(data, dict):
            return {}
        # Sanitize: keep only allowed fields with a value.
        cleaned: Dict[str, Dict[str, Dict[str, Any]]] = {}
        for aname, fields_obj in data.items():
            if not isinstance(fields_obj, dict):
                continue
            asset_fields = {}
            for field, spec in fields_obj.items():
                if field not in METADATA_FIELDS:
                    continue
                if isinstance(spec, dict) and spec.get("value") not in (None, ""):
                    asset_fields[field] = {
                        "value": str(spec.get("value")),
                        "confidence": spec.get("confidence"),
                        "snippet": spec.get("snippet"),
                    }
            if asset_fields:
                cleaned[aname] = asset_fields
        return cleaned
    except Exception as e:
        logger.error(f"Metadata enrichment failed (non-blocking): {e}")
        return {}
