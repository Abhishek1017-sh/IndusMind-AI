"""
Incident extractor — detects incidents/failures described in a document and
extracts their structured details (req 5) using Gemini, grounded strictly in
the text. Returns [] when Gemini is unavailable or no incident is described —
incidents are never fabricated.
"""
import os
import json
import logging
from typing import List, Dict, Any

import google.generativeai as genai

from app.core.config import settings

logger = logging.getLogger(__name__)


def extract_incidents(text: str, known_asset_names: List[str]) -> List[Dict[str, Any]]:
    """
    Returns a list of incidents, each:
      { title, severity, symptoms[], root_cause, impact, downtime,
        corrective_actions[], preventive_actions[], recommendations[],
        confidence, affected_assets[] }
    affected_assets are matched against `known_asset_names` where possible.
    """
    api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return []

    excerpt = text[:12000]
    prompt = f"""
You are an industrial reliability analyst. Identify any incidents or failures
described in the document text below. Extract ONLY what the text states — never
invent details. If no incident is described, return an empty array.

Known asset names (match affected_assets to these when they apply): {json.dumps(known_asset_names)}

Document text:
---
{excerpt}
---

Return EXACT JSON: an array of incident objects with keys:
- "title" (string, short)
- "severity" (one of "Critical","High","Medium","Low", or "")
- "symptoms" (array of strings)
- "root_cause" (string)
- "impact" (string)
- "downtime" (string, e.g. "4 hours" or "")
- "corrective_actions" (array of strings)
- "preventive_actions" (array of strings)
- "recommendations" (array of strings)
- "confidence" (0-1 float)
- "affected_assets" (array of asset names actually mentioned as affected)

No markdown, no prose outside the JSON array.
"""
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(prompt, generation_config={"response_mime_type": "application/json"})
        data = json.loads(response.text.strip())
        if isinstance(data, dict):  # tolerate {"incidents": [...]}
            data = data.get("incidents", [])
        if not isinstance(data, list):
            return []
        incidents = []
        for item in data:
            if isinstance(item, dict) and str(item.get("title") or "").strip():
                incidents.append(item)
        return incidents
    except Exception as e:
        logger.error(f"Incident extraction failed (non-blocking): {e}")
        return []
