#!/usr/bin/env python3
"""Process Zorg MemoryDB semantic work queue.

This worker is intentionally conservative: database triggers only enqueue work;
this script builds additive, rebuildable semantic nodes, weighted edges, recall
hints, and query observations outside hot PostgreSQL write/query paths.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
import socket
from pathlib import Path
from typing import Iterable

import psycopg2
import psycopg2.extras

WORKSPACE = Path(os.environ.get("OPENCLAW_WORKSPACE") or os.environ.get("WORKSPACE_DIR") or (Path.home() / ".openclaw" / "workspace")).expanduser().resolve()
MAP_PATH = Path(os.environ.get("SQL_MEMORY_MAP") or os.environ.get("ZORG_SQL_MEMORY_MAP") or (WORKSPACE / "sql_memory_map.json")).expanduser().resolve()
WORKER_ID = f"semantic-worker@{socket.gethostname()}:{os.getpid()}"

STOPWORDS = {
    "about", "after", "again", "against", "all", "also", "and", "are", "because", "been",
    "before", "being", "between", "but", "can", "cannot", "could", "database", "doing",
    "done", "each", "from", "have", "into", "large", "memory", "more", "must", "need",
    "only", "other", "over", "proper", "query", "recall", "request", "rule", "rules", "semantic",
    "should", "system", "that", "the", "their", "them", "then", "there", "these", "this", "through",
    "using", "when", "where", "which", "while", "with", "without", "your", "zorg", "openclaw",
}

TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9_.:/@-]{2,}")
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
PATH_RE = re.compile(r"(?:/|~/?)[A-Za-z0-9._/:-]{3,}")
CAMEL_RE = re.compile(r"\b[A-Z][A-Za-z0-9_-]{2,}(?:\s+[A-Z][A-Za-z0-9_-]{2,}){0,3}\b")


def load_cfg():
    cfg = json.loads(MAP_PATH.read_text())
    p = cfg["postgres"]
    return {
        "host": p["host"],
        "port": p["port"],
        "dbname": p["database"],
        "user": p["user"],
        "password": p["password"],
    }


def norm_key(kind: str, label: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")[:120]
    if not clean:
        clean = hashlib.sha1(label.encode()).hexdigest()[:16]
    return f"{kind}:{clean}"


def extract_concepts(text: str, payload: dict | None = None, limit: int = 18) -> list[tuple[str, str, float, str]]:
    payload = payload or {}
    candidates: dict[tuple[str, str], tuple[float, str]] = {}

    def add(kind: str, label: str, weight: float, basis: str):
        label = (label or "").strip().strip(".,;:()[]{}<>\"'")
        if len(label) < 3:
            return
        low = label.lower()
        if low in STOPWORDS:
            return
        key = (kind, label)
        old = candidates.get(key)
        if old is None or weight > old[0]:
            candidates[key] = (weight, basis)

    for email in EMAIL_RE.findall(text):
        add("email", email.lower(), 9.0, "email identifier")
        domain = email.split("@", 1)[1].lower()
        add("domain", domain, 7.0, "email domain")
    for ip in IP_RE.findall(text):
        add("host", ip, 8.0, "IP address")
    for path in PATH_RE.findall(text):
        add("path", path, 7.0, "filesystem/path reference")
    for phrase in CAMEL_RE.findall(text):
        add("entity", phrase, 5.5, "capitalized entity phrase")

    # Payload fields are trusted metadata from our own triggers and get stronger weights.
    for k in ("memory_key", "category", "priority", "display_name", "company", "job_title", "intent"):
        v = payload.get(k)
        if v:
            add("metadata", str(v), 6.0, f"trigger payload {k}")

    tokens = [t for t in TOKEN_RE.findall(text) if t.lower() not in STOPWORDS and not t.startswith("http")]
    freq: dict[str, int] = {}
    for token in tokens:
        low = token.lower().strip("._-/:")
        if len(low) >= 4 and low not in STOPWORDS:
            freq[low] = freq.get(low, 0) + 1
    for token, count in sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))[:30]:
        add("concept", token, min(6.0, 2.5 + count), "frequent source token")

    out = [(kind, label, weight, basis) for (kind, label), (weight, basis) in candidates.items()]
    out.sort(key=lambda x: (-x[2], x[0], x[1].lower()))
    return out[:limit]


def claim_jobs(cur, limit: int):
    cur.execute("select public.memory_dynamic_worker_batch_limit(%s)", (limit,))
    row = cur.fetchone()
    effective_limit = int(row[0] if not isinstance(row, dict) else row['memory_dynamic_worker_batch_limit'])
    cur.execute(
        """
        with picked as (
          select id
          from public.memory_semantic_work_queue
          where status='queued' and due_at <= now() and attempts < max_attempts
          order by priority desc, due_at asc, created_at asc
          for update skip locked
          limit %s
        )
        update public.memory_semantic_work_queue q
        set status='running', locked_at=now(), locked_by=%s, attempts=attempts+1, updated_at=now()
        from picked
        where q.id=picked.id
        returning q.*
        """,
        (effective_limit, WORKER_ID),
    )
    return cur.fetchall()


def get_source_text(cur, source_type: str, source_key: str, payload: dict) -> str:
    cur.execute(
        """
        select public.memory_semantic_source_text_v1(%s, %s, %s::jsonb)
        """,
        (source_type, source_key, json.dumps(payload or {})),
    )
    row = cur.fetchone()
    if row:
        if isinstance(row, dict):
            return row.get("memory_semantic_source_text_v1") or ""
        return row[0] or ""
    return "\n".join(str(v) for v in payload.values() if v is not None)


def upsert_node(cur, kind: str, label: str, basis: str, confidence: float):
    node_key = norm_key(kind, label)
    cur.execute(
        """
        insert into public.memory_semantic_nodes(node_key,node_type,canonical_label,aliases,description,llm_hint,source_model,confidence,metadata)
        values (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        on conflict (node_key) do nothing
        returning node_key
        """,
        (
            node_key,
            kind,
            label,
            [label],
            f"Derived semantic {kind}: {label}",
            f"Recall cue extracted from memory/contact/query text; basis: {basis}",
            "semantic-worker-v1",
            confidence,
            psycopg2.extras.Json({"basis": basis}),
        ),
    )
    row = cur.fetchone()
    if row:
        return row["node_key"]
    return node_key


def insert_edge(cur, subject_type: str, subject_key: str, relation: str, object_type: str, object_key: str, weight: float, basis: str, reason: str, evidence_source: str):
    cur.execute(
        """
        select id from public.memory_semantic_edges
        where subject_type=%s and subject_key=%s and relation=%s and object_type=%s and object_key=%s and active=true
        limit 1
        """,
        (subject_type, subject_key, relation, object_type, object_key),
    )
    existing = cur.fetchone()
    if existing:
        cur.execute(
            """
            update public.memory_semantic_edges
            set weight=%s, weight_basis=%s, llm_reason=%s, updated_at=now()
            where id=%s and weight < %s
            """,
            (weight, basis, reason, existing["id"], weight),
        )
    else:
        cur.execute(
            """
            insert into public.memory_semantic_edges(subject_type,subject_key,relation,object_type,object_key,weight,weight_basis,llm_reason,source_model,evidence_source,metadata)
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (subject_type, subject_key, relation, object_type, object_key, weight, basis, reason, "semantic-worker-v1", evidence_source, psycopg2.extras.Json({})),
        )


def insert_hint(cur, source_type: str, source_key: str, text: str, related: Iterable[str], weight: float):
    cur.execute(
        """
        select id from public.memory_recall_hints
        where source_type=%s and source_key=%s and hint_kind='semantic_worker_v1' and hint_text=%s and active=true
        limit 1
        """,
        (source_type, source_key, text),
    )
    existing = cur.fetchone()
    if existing:
        cur.execute("update public.memory_recall_hints set weight=greatest(weight,%s), related_keys=%s, updated_at=now() where id=%s", (weight, list(related), existing["id"]))
    else:
        cur.execute(
            """
            insert into public.memory_recall_hints(source_type,source_key,hint_kind,hint_text,related_keys,weight,source_model,metadata)
            values (%s,%s,'semantic_worker_v1',%s,%s,%s,'semantic-worker-v1',%s)
            """,
            (source_type, source_key, text, list(related), weight, psycopg2.extras.Json({})),
        )


def process_job(cur, job) -> dict:
    payload = job["payload"] or {}
    source_type = job["source_type"]
    source_key = job["source_key"]
    text = get_source_text(cur, source_type, source_key, payload)
    concepts = extract_concepts(text, payload)
    node_keys = []
    for kind, label, weight, basis in concepts:
        node_key = upsert_node(cur, kind, label, basis, min(0.99, weight / 10.0))
        node_keys.append(node_key)
        if source_type == "query":
            insert_edge(cur, "query", source_key, "mentions", "node", node_key, weight, basis, f"Query text mentions {label}", str(job["id"]))
        elif source_type == "success_query":
            insert_edge(cur, "success_query", source_key, "proved_by", "node", node_key, weight + 1.5, basis, f"Successful query associated with {label}", str(job["id"]))
        else:
            insert_edge(cur, source_type, source_key, "has_semantic_cue", "node", node_key, weight, basis, f"Source has semantic cue {label}", str(job["id"]))

    if source_type not in {"query"} and concepts:
        labels = ", ".join(label for _, label, _, _ in concepts[:8])
        insert_hint(
            cur,
            source_type,
            source_key,
            f"Semantic cues for recall: {labels}",
            node_keys[:12],
            max(weight for _, _, weight, _ in concepts[:8]),
        )

    if source_type == "query":
        # Store query observation placeholders. Future LLM/user feedback can mark useful candidates.
        for node_key in node_keys[:10]:
            cur.execute(
                """
                insert into public.memory_query_observations(query_text,query_intent,source_type,source_key,rank_seen,was_useful,usefulness_score,feedback_basis,metadata)
                values (%s,'semantic_query_cue','node',%s,null,null,0.25,'query detected by weighted recall; candidate cue for future LLM scoring',%s)
                """,
                (payload.get("query_text", text), node_key, psycopg2.extras.Json({"job_id": str(job["id"])})),
            )

    return {"concept_count": len(concepts), "node_count": len(node_keys)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=25)
    ap.add_argument("--once", action="store_true", help="process one batch and exit")
    ap.add_argument(
        "--skip-refresh",
        action="store_true",
        help="skip per-batch search refresh; intended for controlled catch-up runs that refresh once afterward",
    )
    args = ap.parse_args()

    processed = 0
    batch_started = time.time()
    with psycopg2.connect(**load_cfg()) as conn:
        conn.autocommit = False
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            jobs = claim_jobs(cur, args.limit)
            for job in jobs:
                try:
                    stats = process_job(cur, job)
                    cur.execute(
                        """
                        update public.memory_semantic_work_queue
                        set status='done', completed_at=now(), locked_at=null, locked_by=null, updated_at=now(), payload=payload || %s::jsonb
                        where id=%s
                        """,
                        (json.dumps({"worker_stats": stats}), job["id"]),
                    )
                    processed += 1
                except Exception as exc:  # keep queue robust; one bad row must not stop future work
                    cur.execute(
                        """
                        update public.memory_semantic_work_queue
                        set status=case when attempts >= max_attempts then 'error' else 'queued' end,
                            locked_at=null, locked_by=null, last_error=%s, updated_at=now(), due_at=now() + public.memory_dynamic_defer_interval(priority)
                        where id=%s
                        """,
                        (str(exc)[:2000], job["id"]),
                    )
            batch_duration_ms = (time.time() - batch_started) * 1000
            cur.execute(
                """
                select public.memory_record_runtime_timing(
                  'semantic_worker_batch', %s, %s, null, %s,
                  (select count(*)::int from public.memory_semantic_work_queue where status in ('queued','running')),
                  %s::jsonb
                )
                """,
                (WORKER_ID, batch_duration_ms, processed, json.dumps({"claimed": len(jobs)})),
            )
            if processed and not args.skip_refresh:
                try:
                    cur.execute("savepoint semantic_refresh_attempt")
                    cur.execute("set local lock_timeout = '1000ms'")
                    cur.execute("set local statement_timeout = '5000ms'")
                    cur.execute("select public.zorg_refresh_memory_search()")
                    cur.execute("release savepoint semantic_refresh_attempt")
                except Exception:
                    cur.execute("rollback to savepoint semantic_refresh_attempt")
                    pass
            cur.execute("select extract(epoch from public.memory_dynamic_defer_interval(50))")
            row = cur.fetchone()
            recommended_delay_seconds = float(row[0] if not isinstance(row, dict) else row['extract'])
            conn.commit()
    print(json.dumps({"worker": WORKER_ID, "claimed": len(jobs), "processed": processed, "batch_duration_ms": round(batch_duration_ms, 2), "recommended_delay_seconds": round(recommended_delay_seconds, 2), "search_refresh_skipped": bool(args.skip_refresh)}, indent=2))


if __name__ == "__main__":
    main()
