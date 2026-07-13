#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

BASE = Path(os.environ.get('OPENCLAW_WORKSPACE', Path.home() / '.openclaw' / 'workspace'))
SQL_CFG = Path(os.environ.get('ZORG_SQL_MEMORY_MAP', BASE / 'sql_memory_map.json'))
VENV_PYTHON = BASE / '.venv-sqlmem' / 'bin' / 'python'
ANN_QUERY_CACHE_TIMEOUT_MS = int(os.environ.get('ZORG_RECALL_ANN_QUERY_CACHE_TIMEOUT_MS', '12000'))
ANN_QUERY_CACHE_SCRIPT = Path(os.environ.get('ZORG_RECALL_ANN_QUERY_CACHE_SCRIPT', BASE / 'scripts' / 'cache_model_query_embedding.mjs'))
ANN_ENABLED = os.environ.get('ZORG_RECALL_ANN_ENABLED', '1').lower() not in {'0', 'false', 'no', 'off'}

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ModuleNotFoundError as exc:
    if exc.name != 'psycopg2':
        raise
    if VENV_PYTHON.exists() and Path(sys.executable).resolve() != VENV_PYTHON.resolve():
        os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), __file__, *sys.argv[1:]])
    raise SystemExit(
        'psycopg2 is missing from the active Python. '
        f'Use {VENV_PYTHON} or reinstall the SQL memory environment.'
    )


def load_sql_cfg():
    return json.loads(SQL_CFG.read_text(encoding='utf-8'))


def db_connect():
    cfg = load_sql_cfg()
    p = cfg['postgres']
    return psycopg2.connect(
        host=p['host'],
        port=p['port'],
        dbname=p['database'],
        user=p['user'],
        password=p['password'],
    )


def query_embedding_cached(query: str) -> bool:
    with db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select public.memory_query_embedding_cache_exists_v1(
                  %s, 'local', 'nomic-embed-text:latest'
                )
                """,
                (query,),
            )
            return bool(cur.fetchone()[0])


def ensure_model_query_embedding_cached(query: str) -> bool:
    """Python only handles the external model call; DB procedures own recall SQL."""
    if not ANN_ENABLED or not ANN_QUERY_CACHE_SCRIPT.exists():
        return False
    if query_embedding_cached(query):
        return True
    try:
        result = subprocess.run(
            ['node', str(ANN_QUERY_CACHE_SCRIPT)],
            input=query or '',
            text=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=max(1, ANN_QUERY_CACHE_TIMEOUT_MS / 1000),
            cwd=str(BASE),
            check=False,
        )
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def _row_to_structured(row):
    return {
        'source_type': row['source_type'],
        'source_id': row['source_id'],
        'path': row['path'],
        'line_start': row['line_start'],
        'line_end': row['line_end'],
        'priority': row['priority'] or 'medium',
        'content': row['content'],
    }


def search_structured_db(query: str, limit: int):
    requested_limit = max(1, int(limit or 10))
    ann_query_cached = ensure_model_query_embedding_cached(query)
    context = {
        'caller': 'memory_recall_router.py',
        'ann_enabled': ANN_ENABLED,
        'embedding_provider': 'local',
        'embedding_model': 'nomic-embed-text:latest',
    }

    with db_connect() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('set local statement_timeout = %s', (int(os.environ.get('ZORG_RECALL_PRIMARY_TIMEOUT_MS', '30000')),))
            cur.execute(
                """
                select source_type, source_id, path, line_start, line_end, priority,
                       content, recall_mode, rank, score, score_reason, metadata
                from public.memory_recall_v2(%s, %s, %s::jsonb)
                order by rank
                """,
                (query, requested_limit, json.dumps(context)),
            )
            rows = cur.fetchall()

    mode = 'database-stored-procedure'
    if rows:
        mode = rows[0].get('recall_mode') or mode
    return {
        'mode': mode,
        'requested_limit': requested_limit,
        'effective_limit': requested_limit,
        'fallback_error': None,
        'structured': [_row_to_structured(row) for row in rows],
        'procedure': 'public.memory_recall_v2',
        'ann_query_cached': ann_query_cached,
    }


def main():
    ap = argparse.ArgumentParser(description='DB stored-procedure recall router')
    ap.add_argument('query')
    ap.add_argument('--limit', type=int, default=10)
    args = ap.parse_args()

    try:
        print(json.dumps(search_structured_db(args.query, args.limit), indent=2, default=str))
    except Exception as e:
        print(json.dumps({
            'mode': 'database-unavailable',
            'error': str(e),
            'structured': [],
            'procedure': 'public.memory_recall_v2',
        }, indent=2))


if __name__ == '__main__':
    main()
