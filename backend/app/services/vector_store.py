import os
import json
import logging
from typing import List, Dict, Any, Optional, Set
from app.core.config import settings

logger = logging.getLogger(__name__)

FALLBACK_INDEX_FILENAME = "fallback_index.json"


def _reciprocal_rank_fusion(result_lists: List[List[Dict[str, Any]]], k_constant: int = 60) -> List[Dict[str, Any]]:
    """
    Reranks results from multiple retrievers (e.g. vector similarity + keyword
    overlap) using Reciprocal Rank Fusion — the standard technique production
    hybrid-search systems (Elasticsearch, Weaviate, etc.) use to combine
    rankings from retrievers whose raw scores aren't on comparable scales
    (FAISS L2 distance vs. a 0..1 keyword-overlap ratio). Each item's fused
    score is the sum, across every list it appears in, of 1/(k_constant + rank);
    items ranked highly by multiple retrievers naturally float to the top.
    """
    scores: Dict[tuple, float] = {}
    items: Dict[tuple, Dict[str, Any]] = {}
    for results in result_lists:
        for rank, r in enumerate(results):
            meta = r.get("metadata", {})
            key = (meta.get("document_id"), meta.get("chunk_index"))
            scores[key] = scores.get(key, 0.0) + 1.0 / (k_constant + rank + 1)
            if key not in items:
                items[key] = r

    ranked_keys = sorted(scores.keys(), key=lambda key: scores[key], reverse=True)
    return [{**items[key], "rerank_score": scores[key]} for key in ranked_keys]

# Fallback basic text searcher class in case FAISS/Embeddings fail to initialize
class BasicTextSearcher:
    """
    A pure Python fallback semantic-ish searcher based on overlap/keyword matching
    if FAISS or remote embeddings are offline or fail to compile on Python 3.14.

    Persists to disk (see save/load) so that documents already indexed here are
    not lost on process restart — otherwise, whenever FAISS/Gemini embeddings are
    unavailable, a restart would silently make every previously-uploaded document
    unsearchable even though it still shows as COMPLETED in the database.
    """
    def __init__(self):
        self.chunks: List[str] = []
        self.metadatas: List[Dict[str, Any]] = []

    def add_texts(self, texts: List[str], metadatas: List[Dict[str, Any]]):
        self.chunks.extend(texts)
        self.metadatas.extend(metadatas)

    def remove_by_document_id(self, document_id: str) -> int:
        keep = [i for i, m in enumerate(self.metadatas) if m.get("document_id") != document_id]
        removed = len(self.metadatas) - len(keep)
        self.chunks = [self.chunks[i] for i in keep]
        self.metadatas = [self.metadatas[i] for i in keep]
        return removed

    def reconcile(self, valid_document_ids: Set[str]) -> int:
        keep = [i for i, m in enumerate(self.metadatas) if m.get("document_id") in valid_document_ids]
        removed = len(self.metadatas) - len(keep)
        self.chunks = [self.chunks[i] for i in keep]
        self.metadatas = [self.metadatas[i] for i in keep]
        return removed

    def save(self, index_dir: str) -> None:
        path = os.path.join(index_dir, FALLBACK_INDEX_FILENAME)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"chunks": self.chunks, "metadatas": self.metadatas}, f)
            logger.info(f"Fallback text index persisted to disk at {path} ({len(self.chunks)} chunk(s)).")
        except Exception as e:
            logger.error(f"Failed to persist fallback text index: {e}")

    def load(self, index_dir: str) -> None:
        path = os.path.join(index_dir, FALLBACK_INDEX_FILENAME)
        if not os.path.exists(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.chunks = data.get("chunks", [])
            self.metadatas = data.get("metadatas", [])
            logger.info(f"Fallback text index loaded from disk at {path} ({len(self.chunks)} chunk(s)).")
        except Exception as e:
            logger.error(f"Failed to load fallback text index from {path}: {e}")

    def similarity_search(self, query: str, k: int = 5, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        # Simple query term overlap ranking, restricted to the requesting user's own documents
        query_words = set(query.lower().split())
        results = []

        for idx, chunk in enumerate(self.chunks):
            meta = self.metadatas[idx]
            if user_id is not None and meta.get("user_id") != user_id:
                continue
            chunk_words = set(chunk.lower().split())
            overlap = len(query_words.intersection(chunk_words))
            # Calculate a pseudo score
            score = overlap / (len(query_words) + 1)
            results.append((score, chunk, meta))

        # Sort by score descending
        results.sort(key=lambda x: x[0], reverse=True)

        # Return top k as standard dicts
        top_k = results[:k]
        return [
            {
                "page_content": content,
                "metadata": meta,
                "score": float(score)
            }
            for score, content, meta in top_k
        ]


class VectorStoreService:
    def __init__(self):
        self.index_dir = settings.FAISS_INDEX_PATH
        self.db = None
        self.embedding_model_name = "none (lexical-only)"
        self.fallback_db = BasicTextSearcher()
        self.fallback_db.load(self.index_dir)
        self._init_embeddings_and_faiss()

    def _init_embeddings_and_faiss(self):
        try:
            # We use Google Generative AI Embeddings as primary choice
            from langchain_google_genai import GoogleGenerativeAIEmbeddings

            api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "")
            if not api_key:
                logger.warning("GEMINI_API_KEY is not configured. Falling back to local SentenceTransformers or BasicTextSearcher.")
                raise ValueError("No Gemini API key")

            self.embeddings = GoogleGenerativeAIEmbeddings(
                model="models/gemini-embedding-001",
                google_api_key=api_key
            )
            self.embedding_model_name = "models/gemini-embedding-001 (Google)"
            logger.info("GoogleGenerativeAIEmbeddings initialized successfully.")
        except Exception as e:
            logger.warning(f"Could not load Google Generative AI Embeddings: {e}. Trying SentenceTransformers...")
            try:
                from langchain_community.embeddings import HuggingFaceEmbeddings
                self.embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
                self.embedding_model_name = "all-MiniLM-L6-v2 (local HuggingFace)"
                logger.info("Local HuggingFace all-MiniLM-L6-v2 Embeddings initialized successfully.")
            except Exception as hf_err:
                logger.error(f"Could not load local HuggingFace embeddings: {hf_err}. Using BasicTextSearcher fallback.")
                self.embeddings = None
                return

        # Attempt to load existing FAISS index
        try:
            from langchain_community.vectorstores import FAISS
            if os.path.exists(os.path.join(self.index_dir, "index.faiss")):
                # FAISS requires allow_dangerous_deserialization=True for local files loading
                self.db = FAISS.load_local(
                    self.index_dir,
                    self.embeddings,
                    allow_dangerous_deserialization=True
                )
                logger.info("Existing FAISS index loaded successfully.")
            else:
                logger.info("No existing FAISS index found. Ready for creation.")
        except Exception as faiss_err:
            logger.error(f"Could not load/initialize FAISS: {faiss_err}. Using BasicTextSearcher.")
            self.db = None

    def add_chunks(self, texts: List[str], metadatas: List[Dict[str, Any]]) -> None:
        """
        Adds text chunks with metadata to the active index and persists it to disk.
        """
        # Always feed the fallback, and persist it immediately so it survives a restart
        self.fallback_db.add_texts(texts, metadatas)
        self.fallback_db.save(self.index_dir)
        logger.info(f"Indexing {len(texts)} chunk(s) into vector store (metadata sample: {metadatas[0] if metadatas else None})")

        if self.embeddings is None:
            logger.warning("Embeddings not initialized. Chunks saved only to fallback text index.")
            return

        try:
            # pyrefly: ignore [missing-import]
            from langchain_community.vectorstores import FAISS
            if self.db is None:
                self.db = FAISS.from_texts(texts, self.embeddings, metadatas=metadatas)
            else:
                self.db.add_texts(texts, metadatas=metadatas)

            # Save the index locally
            self.db.save_local(self.index_dir)
            logger.info(f"FAISS index successfully updated and saved to disk at {self.index_dir}.")
        except Exception as e:
            logger.error(f"Error adding chunks to FAISS index: {e}")
            # Do not raise, we have the fallback database

    def _faiss_search(self, query: str, fetch_k: int, user_id: Optional[str]) -> List[Dict[str, Any]]:
        """FAISS semantic vector similarity, scoped to the user's own documents."""
        if self.db is None or self.embeddings is None:
            return []
        try:
            filter_ = {"user_id": user_id} if user_id is not None else None
            raw_results = self.db.similarity_search_with_score(query, k=fetch_k, filter=filter_)
            return [
                {"page_content": doc.page_content, "metadata": doc.metadata,
                 "score": float(score), "retriever": "faiss"}
                for doc, score in raw_results
            ]
        except Exception as e:
            logger.error(f"FAISS search failed: {e}. Continuing with lexical retrievers only.")
            return []

    def search(self, query: str, k: int = 10, user_id: Optional[str] = None,
               db: Optional[Any] = None) -> List[Dict[str, Any]]:
        """
        Hybrid retrieval over three complementary retrievers, merged and reranked
        with Reciprocal Rank Fusion (see `_reciprocal_rank_fusion`):

          1. FAISS  — semantic vector similarity (embedding model).
          2. PostgreSQL Full-Text Search — `to_tsvector`/`ts_rank` over the
             `document_chunks` source of truth (Postgres only).
          3. BM25   — classic keyword ranking over the same chunks (any backend).

        The query is first alias-expanded (see `query_normalizer.expand_query`)
        so "R&D budget" also matches "Research and Development allocation" — the
        single biggest cause of "data exists but the question fails". A chunk
        ranked well by several retrievers floats to the top of the fused list.

        No retriever is allowed to declare defeat on its own: a "not found"
        answer upstream is only reached when ALL THREE return nothing.

        Restricted to the given user's own uploaded documents (if user_id given).
        `db` is an optional SQLAlchemy session to reuse; when omitted a short
        read-only session is opened for the lexical retrievers. Returns a list
        of dicts with 'page_content' and 'metadata' (best-first).
        """
        from app.services.query_normalizer import expand_query
        from app.services import lexical_search

        fetch_k = max(k * 3, 30)  # wide candidate pool per retriever feeds the reranker
        expanded = expand_query(query)

        # 1. Semantic (uses the synonym-enriched query so acronyms/aliases match).
        faiss_results = self._faiss_search(expanded.semantic_query, fetch_k, user_id)

        # 2 & 3. Lexical retrievers over the Postgres source of truth.
        owns_session = False
        if db is None:
            try:
                from app.db.session import SessionLocal
                db = SessionLocal()
                owns_session = True
            except Exception as e:
                logger.warning(f"Could not open a DB session for lexical retrieval: {e}")
                db = None

        fts_results: List[Dict[str, Any]] = []
        bm25_results: List[Dict[str, Any]] = []
        try:
            if db is not None:
                fts_results = lexical_search.postgres_fts_search(db, expanded.lexical_terms, user_id, fetch_k)
                bm25_results = lexical_search.bm25_search(db, expanded.lexical_terms, user_id, fetch_k)
        except Exception as e:
            logger.error(f"Lexical retrieval failed: {e}.")
        finally:
            if owns_session and db is not None:
                db.close()

        result_lists = [faiss_results, fts_results, bm25_results]

        # Last-resort in-memory keyword fallback: only if every DB/vector
        # retriever came up empty (e.g. embeddings offline AND no DB session),
        # so we still never give up before all methods have failed.
        if not any(result_lists):
            keyword_results = self.fallback_db.similarity_search(expanded.semantic_query, k=fetch_k, user_id=user_id)
            for r in keyword_results:
                r["retriever"] = "keyword_fallback"
            result_lists.append(keyword_results)

        results = _reciprocal_rank_fusion(result_lists)[:k]

        self._log_retrieval_debug(query, expanded, user_id,
                                  faiss_results, fts_results, bm25_results, results)
        return results

    def _log_retrieval_debug(self, query, expanded, user_id, faiss_results,
                             fts_results, bm25_results, results) -> None:
        """
        Structured per-query retrieval trace (embedding model, per-retriever hit
        counts, alias expansions, and the final reranked order with chunk/doc
        ids and scores) — the observability the RAG pipeline needs to explain
        why any given chunk did or didn't surface.
        """
        lines = [
            f"===== RETRIEVAL DEBUG | user_id={user_id} =====",
            f"  query           : {query!r}",
            f"  embedding_model : {self.embedding_model_name}",
        ]
        if expanded.matched_aliases:
            alias_str = "; ".join(f"{m} -> [{', '.join(syn)}]" for m, syn in expanded.matched_aliases)
            lines.append(f"  alias_expansion : {alias_str}")
            lines.append(f"  semantic_query  : {expanded.semantic_query!r}")
        lines.append(f"  lexical_terms   : {expanded.lexical_terms}")
        lines.append(
            f"  retriever_hits  : FAISS={len(faiss_results)} "
            f"postgres_fts={len(fts_results)} bm25={len(bm25_results)}"
        )
        lines.append(f"  reranked_top_{len(results)} (chunk_id = document_id:chunk_index):")
        for rank, r in enumerate(results, start=1):
            meta = r.get("metadata", {})
            doc_id = meta.get("document_id")
            preview = (r.get("page_content") or "").strip().replace("\n", " ")[:90]
            lines.append(
                f"    #{rank:>2} rerank={r.get('rerank_score', 0.0):.5f} "
                f"via={r.get('retriever', '?')} raw_score={r.get('score', 0.0):.4f} "
                f"chunk_id={doc_id}:{meta.get('chunk_index')} "
                f"doc={meta.get('filename', 'Unknown')!r} | {preview!r}"
            )
        logger.info("\n".join(lines))

    def remove_document(self, document_id: str) -> None:
        """
        Removes all chunks belonging to `document_id` from both the FAISS index and
        the fallback text index, and persists the change. Must be called whenever a
        document is deleted, so it stops being a source of truth for retrieval —
        otherwise its chunks silently linger in the index forever.
        """
        removed_fallback = self.fallback_db.remove_by_document_id(document_id)
        if removed_fallback:
            self.fallback_db.save(self.index_dir)
            logger.info(f"Removed {removed_fallback} chunk(s) for document {document_id} from fallback text index.")

        if self.db is not None:
            try:
                matching_ids = [
                    fid for fid, doc in self.db.docstore._dict.items()
                    if doc.metadata.get("document_id") == document_id
                ]
                if matching_ids:
                    self.db.delete(ids=matching_ids)
                    self.db.save_local(self.index_dir)
                    logger.info(f"Removed {len(matching_ids)} chunk(s) for document {document_id} from FAISS index.")
            except Exception as e:
                logger.error(f"Could not remove document {document_id} chunks from FAISS index: {e}")

    def reconcile_with_documents(self, valid_document_ids: Set[str]) -> None:
        """
        Removes any indexed chunks whose document_id is not in `valid_document_ids`
        (e.g. leftover from documents that were deleted before this cleanup existed,
        or residual demo/test data). Called at startup so the index always reflects
        only documents that currently exist in the database — never bundled demo
        content or orphaned data from previous runs.
        """
        removed_fallback = self.fallback_db.reconcile(valid_document_ids)
        if removed_fallback:
            self.fallback_db.save(self.index_dir)
            logger.info(f"Reconciliation removed {removed_fallback} orphaned/stale chunk(s) from fallback text index.")

        if self.db is not None:
            try:
                stale_ids = [
                    fid for fid, doc in self.db.docstore._dict.items()
                    if doc.metadata.get("document_id") not in valid_document_ids
                ]
                if stale_ids:
                    self.db.delete(ids=stale_ids)
                    self.db.save_local(self.index_dir)
                    logger.info(f"Reconciliation removed {len(stale_ids)} orphaned/stale chunk(s) from FAISS index.")
            except Exception as e:
                logger.error(f"Could not reconcile FAISS index against current documents: {e}")


# Singleton instance
vector_store = VectorStoreService()
