#!/usr/bin/env python3
import json
import os
import statistics
import time
from pathlib import Path

import psycopg2

BASE = Path(os.environ.get('OPENCLAW_WORKSPACE') or os.environ.get('WORKSPACE_DIR') or (Path.home() / '.openclaw' / 'workspace')).expanduser().resolve()
MAP = Path(os.environ.get('SQL_MEMORY_MAP') or os.environ.get('ZORG_SQL_MEMORY_MAP') or (BASE / 'sql_memory_map.json')).expanduser().resolve()
CORPUS = BASE / 'db_benchmark_queries.json'

DEFAULT_QUERIES = [
    'vcenter',
    'OpenClaw',
    'Stefan',
    'backup',
    'directive',
]

RUNS = int(os.environ.get('MEMORY_SPEED_RUNS', '5'))
QUERY_STATEMENT_TIMEOUT_MS = int(os.environ.get('MEMORY_SPEED_STATEMENT_TIMEOUT_MS', '30000'))
MAINTENANCE_STATEMENT_TIMEOUT_MS = int(os.environ.get('MEMORY_SPEED_MAINTENANCE_TIMEOUT_MS', '180000'))
REFRESH_BEFORE_TEST = os.environ.get('MEMORY_SPEED_REFRESH', '').lower() in {'1', 'true', 'yes'}


def load_cfg():
    with open(MAP, 'r', encoding='utf-8') as f:
        return json.load(f)['postgres']


def load_queries():
    try:
        data = json.loads(CORPUS.read_text(encoding='utf-8'))
        queries = data.get('queries', data if isinstance(data, list) else [])
        return [str(q) for q in queries if str(q).strip()] or DEFAULT_QUERIES
    except Exception:
        return DEFAULT_QUERIES


def db_search_count(cur, query: str) -> int:
    cur.execute(
        "select public.memory_search_count_v1(%s)",
        (query,),
    )
    return cur.fetchone()[0]


def timed(fn, *args):
    t0 = time.perf_counter()
    out = fn(*args)
    dt = (time.perf_counter() - t0) * 1000
    return out, dt


def main():
    queries = load_queries()
    cfg = load_cfg()
    conn = psycopg2.connect(
        host=cfg['host'],
        port=cfg['port'],
        dbname=cfg['database'],
        user=cfg['user'],
        password=cfg.get('password', ''),
    )

    results = {}
    with conn:
        with conn.cursor() as cur:
            cur.execute('set statement_timeout = %s', (MAINTENANCE_STATEMENT_TIMEOUT_MS,))
            if REFRESH_BEFORE_TEST:
                cur.execute('select public.refresh_zorg_memory_search_fast_mv()')
            cur.execute('select public.memory_search_analyze_v1()')
            cur.execute('set statement_timeout = %s', (QUERY_STATEMENT_TIMEOUT_MS,))
            for q in queries:
                db_times = []
                db_count = None

                for _ in range(RUNS):
                    c2, t2 = timed(db_search_count, cur, q)
                    db_times.append(t2)
                    db_count = c2

                results[q] = {
                    'db_count': db_count,
                    'db_ms_avg': round(statistics.mean(db_times), 3),
                    'db_ms_p95': round(sorted(db_times)[int(RUNS * 0.95) - 1], 3),
                }

    conn.close()

    print(json.dumps({
        'runs_per_query': RUNS,
        'query_count': len(queries),
        'query_statement_timeout_ms': QUERY_STATEMENT_TIMEOUT_MS,
        'maintenance_statement_timeout_ms': MAINTENANCE_STATEMENT_TIMEOUT_MS,
        'refresh_before_test': REFRESH_BEFORE_TEST,
        'results': results
    }, indent=2))


if __name__ == '__main__':
    main()
