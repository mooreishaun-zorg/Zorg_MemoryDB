#!/usr/bin/env python3
"""Verify and auto-heal Zorg DB-only memory recall.

Silent success/repair path:
- Confirms memory_search backend/config is DB-only where locally inspectable.
- Archives any recreated workspace memory/ files into PostgreSQL.
- Removes the retired memory/ directory.
- Records repair/check result in DB only.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import psycopg2
from psycopg2.extras import Json

BASE = Path(os.environ.get('OPENCLAW_WORKSPACE') or os.environ.get('WORKSPACE_DIR') or (Path.home() / '.openclaw' / 'workspace')).expanduser().resolve()
MAP = Path(os.environ.get('SQL_MEMORY_MAP') or os.environ.get('ZORG_SQL_MEMORY_MAP') or (BASE / 'sql_memory_map.json')).expanduser().resolve()
MEMORY_DIR = BASE / 'memory'
PYTHON = Path(os.environ.get('SQLMEM_PYTHON', str(BASE / '.venv-sqlmem/bin/python'))).expanduser()
RETIRED_MEMORY_SUFFIXES = {'.md', '.markdown', '.json', '.jsonl', '.txt'}

ARCHIVE_SCHEMA = '''
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS public.zorg_memory_file_archive (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_path text NOT NULL,
  content_sha256 text NOT NULL,
  byte_size integer NOT NULL,
  line_count integer NOT NULL,
  content text NOT NULL,
  content_json jsonb,
  migrated_at timestamptz DEFAULT now() NOT NULL,
  deleted_from_filesystem boolean DEFAULT false NOT NULL,
  deleted_at timestamptz,
  notes text
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_zorg_memory_file_archive_source_sha
  ON public.zorg_memory_file_archive(source_path, content_sha256);
CREATE INDEX IF NOT EXISTS idx_zorg_memory_file_archive_source_path
  ON public.zorg_memory_file_archive(source_path);
CREATE INDEX IF NOT EXISTS idx_zorg_memory_file_archive_deleted
  ON public.zorg_memory_file_archive(deleted_from_filesystem);
CREATE INDEX IF NOT EXISTS idx_zorg_memory_file_archive_content_trgm
  ON public.zorg_memory_file_archive USING gin (content gin_trgm_ops);
'''


def db_conn(attempts: int = 30, delay: float = 1.0):
    cfg = json.loads(MAP.read_text())['postgres']
    last_error = None
    for _ in range(max(1, attempts)):
        try:
            return psycopg2.connect(
                host=cfg['host'], port=cfg['port'], dbname=cfg['database'],
                user=cfg['user'], password=cfg.get('password', '')
            )
        except psycopg2.OperationalError as exc:
            last_error = exc
            time.sleep(delay)
    raise last_error


def rel(p: Path) -> str:
    return str(p.relative_to(BASE)).replace('\\', '/')


def check_db_recall() -> list[str]:
    issues: list[str] = []
    # Verify local SQL tool can query DB and that built-in memory_search is DB-backed when available via direct tool output is not script-accessible.
    try:
        tool = BASE / 'memory_sql_tool.py'
        if not tool.exists():
            tool = BASE / 'scripts' / 'memory_sql_tool.py'
        out = None
        for _ in range(30):
            out = subprocess.run(
                [str(PYTHON), str(tool), 'search', 'db only memory recall exclusive backend database', '--table', 'all', '--limit', '1'],
                cwd=str(BASE), text=True, capture_output=True, timeout=30, check=False,
            )
            if out.returncode == 0:
                break
            time.sleep(1)
        if out is not None and out.returncode != 0:
            issues.append(f'memory_sql_tool_failed rc={out.returncode} stderr={out.stderr.strip()[:500]}')
    except Exception as exc:
        issues.append(f'memory_sql_tool_exception {type(exc).__name__}: {exc}')

    try:
        data = json.loads(MAP.read_text())
        table_map = data.get('table_map', {})
        forbidden = [k for k in table_map if k.startswith('memory/') or k == 'memory/*.md']
        if forbidden:
            issues.append('forbidden_sql_memory_map_entries=' + ','.join(forbidden))
    except Exception as exc:
        issues.append(f'sql_memory_map_check_exception {type(exc).__name__}: {exc}')
    return issues


def archive_and_remove_memory_dir(cur) -> tuple[int, int, bool]:
    files = sorted([p for p in MEMORY_DIR.rglob('*') if p.is_file()]) if MEMORY_DIR.exists() else []
    archived = 0
    line_rows = 0
    cur.execute(ARCHIVE_SCHEMA)
    for path in files:
        if not path.exists():
            continue
        if path.suffix.lower() not in RETIRED_MEMORY_SUFFIXES:
            continue
        data = path.read_bytes()
        if b'\x00' in data:
            continue
        text = data.decode('utf-8', errors='replace')
        source_path = rel(path)
        sha = hashlib.sha256(data).hexdigest()
        content_json = None
        if path.suffix.lower() == '.json':
            try:
                content_json = json.loads(text)
            except Exception:
                content_json = None
        cur.execute(
            '''
            insert into public.zorg_memory_file_archive
              (source_path, content_sha256, byte_size, line_count, content, content_json, notes)
            values (%s,%s,%s,%s,%s,%s,%s)
            on conflict (source_path) do update
              set content_sha256=excluded.content_sha256,
                  content=excluded.content,
                  byte_size=excluded.byte_size,
                  line_count=excluded.line_count,
                  content_json=excluded.content_json,
                  notes=excluded.notes
            ''',
            (source_path, sha, len(data), text.count('\n') + (1 if text else 0), text, Json(content_json) if content_json is not None else None, 'auto-healed retired memory/ file'),
        )
        archived += 1
        for i, line in enumerate(text.splitlines(), 1):
            stripped = line.strip()
            if not stripped:
                continue
            key = f'migrated-memory-file::{source_path}::{i}'
            cur.execute('update public.zorg_memory set memory_value=%s, memory_category=%s, memory_priority=%s, memory_active=true where memory_key=%s', (stripped, 'legacy_memory_file_line', 'medium', key))
            if cur.rowcount == 0:
                cur.execute(
                    '''insert into public.zorg_memory(chat_session_log,memory_key,memory_value,memory_category,memory_priority,memory_active)
                       values (%s,%s,%s,%s,%s,true)''',
                    (f'Auto-healed retired memory file {source_path}:{i}', key, stripped, 'legacy_memory_file_line', 'medium'),
                )
            line_rows += 1
    if MEMORY_DIR.exists():
        shutil.rmtree(MEMORY_DIR)
    cur.execute("update public.zorg_memory_file_archive set deleted_from_filesystem=true, deleted_at=coalesce(deleted_at, now()) where source_path like 'memory/%'")
    return archived, line_rows, not MEMORY_DIR.exists()


def main() -> int:
    issues = check_db_recall()
    repaired = False
    with db_conn() as conn:
        with conn.cursor() as cur:
            archived, line_rows, removed = archive_and_remove_memory_dir(cur)
            if archived or not removed:
                repaired = True
            if os.environ.get('ZORG_AUTOHEAL_REFRESH_VIEWS') == '1':
                for proc in ['refresh_zorg_memory_search_mv', 'refresh_zorg_memory_search_fast_mv', 'refresh_zorg_master_context']:
                    cur.execute('select to_regprocedure(%s)', (f'public.{proc}()',))
                    if cur.fetchone()[0]:
                        cur.execute(f'select public.{proc}()')
            status = {
                'issues': issues,
                'files_archived': archived,
                'line_rows_upserted': line_rows,
                'memory_dir_absent': removed,
                'repaired': repaired,
            }
            key = 'operational-event::db-only-memory-autoheal::latest'
            cur.execute('update public.zorg_memory set memory_value=%s, memory_category=%s, memory_priority=%s, memory_active=true where memory_key=%s', (json.dumps(status, sort_keys=True), 'memory_ops', 'critical' if issues or repaired else 'normal', key))
            if cur.rowcount == 0:
                cur.execute(
                    '''insert into public.zorg_memory(chat_session_log,memory_key,memory_value,memory_category,memory_priority,memory_active)
                       values (%s,%s,%s,%s,%s,true)''',
                    ('DB-only memory autoheal periodic check', key, json.dumps(status, sort_keys=True), 'memory_ops', 'critical' if issues or repaired else 'normal'),
                )
    if issues:
        print('DB_ONLY_MEMORY_AUTOHEAL_ISSUES ' + json.dumps(issues))
        return 2
    print('DB_ONLY_MEMORY_AUTOHEAL_OK')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
