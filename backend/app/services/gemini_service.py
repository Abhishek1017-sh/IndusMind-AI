import os
import re
import logging
from typing import List, Dict, Any, Tuple
import google.generativeai as genai
from app.core.config import settings

logger = logging.getLogger(__name__)


# Retrieval returns a Top-10 reranked pool; only the best few are actually sent
# to the LLM. Fewer, higher-precision chunks give a sharper, better-cited answer
# than stuffing the prompt with marginal matches.
MAX_CONTEXT_CHUNKS = 5


def format_chunks_as_context(chunks: List[Dict[str, Any]], max_chunks: int = MAX_CONTEXT_CHUNKS) -> str:
    """
    Formats the best retrieved chunks into a
    `[Source: filename, Chunk N]\\nContent: ...` block, shared by every agent
    that builds a Gemini prompt. Capped to the top `max_chunks` (the reranked
    best) so only the strongest evidence reaches the model.
    """
    context_str = ""
    for chunk in chunks[:max_chunks]:
        meta = chunk.get("metadata", {})
        filename = meta.get("filename", "Unknown Document")
        chunk_idx = meta.get("chunk_index")
        source = f"{filename}, Chunk {chunk_idx}" if chunk_idx is not None else filename
        context_str += f"[Source: {source}]\nContent: {chunk.get('page_content', '')}\n\n"
    return context_str


_WORD_RE = re.compile(r"[A-Za-z0-9']+")
_SENTENCE_SPLIT_RE = re.compile(r'(?<=[.!?])\s+')

# Common English function words excluded from relevance scoring — otherwise
# every query would trivially "overlap" with every sentence via words like
# "is"/"the"/"what", making the not-found check nearly unreachable.
_STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "what", "when", "where", "who", "whom", "which", "why", "how",
    "do", "does", "did", "doing", "i", "me", "my", "we", "our", "you", "your",
    "he", "him", "his", "she", "her", "it", "its", "they", "them", "their",
    "and", "or", "but", "if", "of", "at", "by", "for", "with", "about",
    "against", "between", "into", "through", "during", "to", "from", "in",
    "on", "off", "over", "under", "again", "further", "then", "once", "this",
    "that", "these", "those", "am", "have", "has", "had", "having", "can",
    "will", "would", "should", "could", "shall", "may", "might", "must", "not",
    "no", "nor", "so", "than", "too", "very", "just", "s", "t",
}


def not_found_message(query: str) -> str:
    """Standard, consistent 'nothing relevant retrieved' response used everywhere."""
    return f'I could not find information about "{query}" in the uploaded documents.'


_PREFIX_LEN = 6


def _content_words(text: str) -> set:
    """
    Extracts lowercased content words (stopwords removed), truncated to a fixed
    prefix length. This lightweight stemming lets simple word-form variations
    still match for scoring purposes — e.g. "project"/"projects", or
    "internship"/"intern" — without needing a real NLP stemmer library.
    """
    words = (w.lower() for w in _WORD_RE.findall(text))
    return {(w[:_PREFIX_LEN] if len(w) > _PREFIX_LEN else w) for w in words if w not in _STOPWORDS}


_LINE_SPLIT_RE = re.compile(r"[\r\n]+")
_BULLET_RE = re.compile(r"^[•\-\*•●◦⁃]\s*")
_MAX_SNIPPET_LEN = 220


def _candidate_spans(content: str):
    """
    Splits chunk text into short candidate spans for scoring — first by line
    (so bulleted résumé/ticket-style text doesn't collapse into one giant
    run-on "sentence"), then by sentence punctuation within each line.
    """
    for line in _LINE_SPLIT_RE.split(content):
        line = _BULLET_RE.sub("", line.strip())
        if not line:
            continue
        for sentence in _SENTENCE_SPLIT_RE.split(line):
            sentence = sentence.strip()
            if len(sentence) >= 3:
                yield sentence


def extractive_answer(query: str, chunks: List[Dict[str, Any]], max_sentences: int = 6) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Builds a concise, non-fabricated answer by picking the most query-relevant
    spans directly out of retrieved chunks — used whenever Gemini reasoning
    is unavailable. This is a summary, not a raw dump of chunk text, and it
    never falls back to hardcoded/demo content.

    Returns a "not found" message (rather than a summary of unrelated content)
    if none of the retrieved chunks actually relate to the query.
    """
    if not chunks:
        return not_found_message(query), []

    # Alias-expand the query terms so an offline extractive answer matches the
    # same synonyms the retriever used (e.g. query "R&D" scores against a
    # sentence that says "Research and Development") — otherwise retrieval would
    # find the chunk but this scorer would wrongly reject it as unrelated.
    from app.services.query_normalizer import expand_query
    expanded = expand_query(query)
    query_words = _content_words(query) | {
        (w[:_PREFIX_LEN] if len(w) > _PREFIX_LEN else w) for w in expanded.lexical_terms
    }
    candidates = []  # (score, sentence, filename, chunk_index)
    for chunk in chunks:
        meta = chunk.get("metadata", {})
        filename = meta.get("filename", "Unknown Document")
        chunk_idx = meta.get("chunk_index")
        content = chunk.get("page_content") or ""
        for sentence in _candidate_spans(content):
            sentence_words = _content_words(sentence)
            score = len(query_words & sentence_words)
            candidates.append((score, sentence, filename, chunk_idx))

    if not candidates or not query_words or max(c[0] for c in candidates) == 0:
        # Nothing in the retrieved chunks actually relates to the query —
        # never summarize unrelated content as if it were an answer.
        return not_found_message(query), []

    candidates.sort(key=lambda c: c[0], reverse=True)
    top = [
        (score, sentence[:_MAX_SNIPPET_LEN] + ("…" if len(sentence) > _MAX_SNIPPET_LEN else ""), filename, chunk_idx)
        for score, sentence, filename, chunk_idx in candidates[:max_sentences]
    ]

    summary = " ".join(sentence for _, sentence, _, _ in top)

    citations = []
    seen = set()
    for _, sentence, filename, chunk_idx in top:
        if filename in seen:
            continue
        seen.add(filename)
        citations.append({"document_name": filename, "page_number": chunk_idx, "text": sentence[:200]})

    return summary, citations


def _fallback_answer(
    query: str,
    vector_chunks: List[Dict[str, Any]],
    graph_triples: List[Dict[str, Any]]
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Non-fabricated fallback used whenever Gemini is unavailable (no key,
    call failure, or rate limit). Tries the retrieved document chunks first;
    if those aren't relevant but the knowledge graph found relevant entities
    (e.g. a "what organizations are mentioned" category match from
    app.agents.planner_agent), summarizes those instead of declaring
    "not found" — retrieval succeeded even though the text-overlap heuristic
    alone wouldn't have caught it.
    """
    summary, citations = extractive_answer(query, vector_chunks)
    if citations:
        return summary, citations

    if graph_triples:
        lines = [f"- {t['source']} → {t['label']} → {t['target']}" for t in graph_triples[:15]]
        return "Based on the knowledge graph extracted from your documents:\n" + "\n".join(lines), []

    return not_found_message(query), []


class GeminiService:
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "")
        self.active = False
        self._init_client()

    def _init_client(self):
        if self.api_key:
            genai.configure(api_key=self.api_key)
            self.active = True
            logger.info("Gemini API client initialized successfully.")
        else:
            logger.warning("GEMINI_API_KEY is not set. Gemini queries will run in mock mode.")
            self.active = False

    def query_gemini_with_context(
        self,
        query: str,
        vector_chunks: List[Dict[str, Any]],
        graph_triples: List[Dict[str, Any]]
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Sends the query, vector chunks, and graph context to Gemini 2.5 Flash.
        Instructs Gemini to answer using ONLY the provided contexts (i.e. the user's
        own uploaded documents) and to output inline citations.
        Returns the text response and a list of citation dictionaries.

        If Gemini is not configured, or the call fails, falls back to a grounded,
        non-fabricated answer built directly from the retrieved chunks (never demo data).
        """
        if not vector_chunks and not graph_triples:
            logger.info("No context retrieved from FAISS/graph for query: %r", query)
            return not_found_message(query), []

        if not self.active:
            logger.info("Gemini service offline (no API key). Building extractive summary from retrieved chunks/graph.")
            return _fallback_answer(query, vector_chunks, graph_triples)

        # Format Vector context
        context_str = format_chunks_as_context(vector_chunks)

        # Format Graph context
        graph_str = ""
        for edge in graph_triples:
            graph_str += f"Relation: ({edge.get('source')}) -[{edge.get('label')}]-> ({edge.get('target')})\n"

        system_prompt = f"""
You are a senior expert analyst engaged to brief a decision-maker (e.g. a business or plant
owner) on exactly what they asked about. You answer using ONLY the context retrieved from
the user's own uploaded documents (and, if present, their knowledge graph). You have no
other source of information — never use outside or general knowledge to fill in gaps, and
never invent a figure, date, name, or fact that is not present in the context below.

Context Datasets:
1. RETRIEVED DOCUMENT EXCERPTS:
{context_str if context_str else "(none retrieved)"}

2. KNOWLEDGE GRAPH RELATIONSHIPS:
{graph_str if graph_str else "(none retrieved)"}

CRITICAL RULES:
1. If the context above contains relevant material, give a complete, well-organized briefing —
   the way a senior consultant who is paid well for exactly this expertise would: surface every
   relevant figure, name, date, and detail found in the context, not just the single most
   obviously-matching sentence. Use short paragraphs or bullet points to organize a
   multi-part answer; do not compress a rich answer down to one terse line when the context
   supports more.
2. Every fact or figure you state MUST be cited directly from the RETRIEVED DOCUMENT EXCERPTS —
   thoroughness never means going beyond what the context actually supports.
3. Use inline brackets for citations, referencing the exact Source ID (e.g., `[Resume.pdf, Page 1]`
   or `[Contract.docx, Sheet: Logs]`), placed next to each specific fact they support.
4. If the context is only partially relevant (e.g. it answers part of a multi-part question),
   answer the part(s) it supports and explicitly say which part(s) are not covered by the
   uploaded documents — do not silently drop them or refuse the whole question.
5. If the context does not contain the answer at all, say exactly: {not_found_message(query)}
   Do not make up facts, and never invent details not present in the context.
"""

        try:
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(
                contents=[
                    {"role": "user", "parts": [f"System instruction: {system_prompt}\n\nUser Question: {query}"]}
                ]
            )

            answer = response.text.strip()
            citations = self._parse_citations(answer, vector_chunks)
            # If the model answered but didn't emit parseable inline citations,
            # still surface the evidence it was grounded in (the best retrieved
            # chunks) — an answer should never appear source-less in the UI.
            if not citations and answer.strip() != not_found_message(query).strip():
                citations = self._top_chunk_citations(vector_chunks)
            logger.info("Gemini answered query using %d retrieved chunk(s), %d citation(s).", len(vector_chunks), len(citations))
            return answer, citations
        except Exception as e:
            logger.error(f"Gemini query failed: {e}. Falling back to extractive summary.")
            return _fallback_answer(query, vector_chunks, graph_triples)

    def _top_chunk_citations(self, chunks: List[Dict[str, Any]], limit: int = 3) -> List[Dict[str, Any]]:
        """
        Fallback citations built from the top reranked chunks, used when the
        model's prose didn't include parseable inline `[Source]` brackets — so
        the answer is still traceable to specific documents.
        """
        citations = []
        seen = set()
        for chunk in chunks[:MAX_CONTEXT_CHUNKS]:
            meta = chunk.get("metadata", {})
            filename = meta.get("filename", "Unknown Document")
            if filename in seen:
                continue
            seen.add(filename)
            content = (chunk.get("page_content") or "").strip()
            citations.append({
                "document_name": filename,
                "page_number": meta.get("chunk_index"),
                "text": content[:200] + ("..." if len(content) > 200 else ""),
            })
            if len(citations) >= limit:
                break
        return citations

    def _parse_citations(self, text: str, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Parses text to find inline citations (e.g. [Filename.pdf, Page X])
        and maps them to original chunk records.
        """
        citations = []
        # Find matches like [Filename.pdf, Page 12] or [Filename.pdf, Chunk X] or [Filename.pdf]
        matches = re.findall(r'\[([^\]]+)\]', text)
        
        seen_filenames = set()
        for match in matches:
            parts = match.split(",")
            doc_name = parts[0].strip()
            
            if doc_name in seen_filenames:
                continue
                
            # Find the chunk that matches this document name to extract snippet
            matching_chunk = next(
                (c for c in chunks if c.get("metadata", {}).get("filename", "").lower() == doc_name.lower()),
                None
            )
            
            if matching_chunk:
                seen_filenames.add(doc_name)
                page = None
                if len(parts) > 1:
                    try:
                        # Extract digits
                        digits = re.findall(r'\d+', parts[1])
                        if digits:
                            page = int(digits[0])
                    except ValueError:
                        pass
                
                citations.append({
                    "document_name": doc_name,
                    "page_number": page,
                    "text": matching_chunk["page_content"][:200] + "..."  # Short summary snippet
                })
        return citations


gemini_service = GeminiService()
