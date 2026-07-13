#!/usr/bin/env python3
import argparse
import json
import os
import sys
from pathlib import Path
from typing import List

BASE = Path(os.environ.get("OPENCLAW_WORKSPACE", Path.home() / ".openclaw" / "workspace"))
VENV_PYTHON = BASE / ".venv-sqlmem" / "bin" / "python"
MAP_PATH = Path(os.environ.get("ZORG_SQL_MEMORY_MAP", BASE / "sql_memory_map.json"))

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ModuleNotFoundError as exc:
    if exc.name != "psycopg2":
        raise
    if VENV_PYTHON.exists() and Path(sys.executable).resolve() != VENV_PYTHON.resolve():
        os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), __file__, *sys.argv[1:]])
    raise SystemExit(
        "psycopg2 is missing from the active Python. "
        f"Use {VENV_PYTHON} or reinstall the SQL memory environment."
    )

from memory_recall_router import ensure_model_query_embedding_cached, search_structured_db


def load_cfg(path: Path = MAP_PATH):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def connect(cfg):
    p = cfg["postgres"]
    return psycopg2.connect(
        host=p["host"],
        port=p["port"],
        dbname=p["database"],
        user=p["user"],
        password=p["password"],
    )


def mapped_tables(cur) -> List[str]:
    cur.execute("select table_name from public.memory_tables_v1()")
    return [row["table_name"] for row in cur.fetchall()]


def search(cur, table: str, q: str, limit: int = 10):
    if table == "all":
        return search_structured_db(q, limit)["structured"]

    if table == "ann":
        ensure_model_query_embedding_cached(q)
    cur.execute(
        "select row_data from public.memory_search_table_v1(%s, %s, %s)",
        (table, q, limit),
    )
    return [row["row_data"] for row in cur.fetchall()]


def get_row(cur, table: str, key: str):
    cur.execute("select public.memory_get_row_v1(%s, %s) as row_data", (table, key))
    row = cur.fetchone()
    return row["row_data"] if row else None


def recent(cur, limit: int = 20):
    cur.execute("select row_data from public.memory_recent_v1(%s)", (limit,))
    return [row["row_data"] for row in cur.fetchall()]


def master(cur, limit: int = 40):
    cur.execute("select row_data from public.memory_master_context_v1(%s)", (limit,))
    return [row["row_data"] for row in cur.fetchall()]


def main():
    ap = argparse.ArgumentParser(description="SQL-backed memory/context tool")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("search")
    sp.add_argument("query")
    sp.add_argument("--table", default="all")
    sp.add_argument("--limit", type=int, default=10)

    gp = sub.add_parser("get")
    gp.add_argument("table")
    gp.add_argument("key", help="uuid id or line_no")

    rp = sub.add_parser("recent")
    rp.add_argument("--limit", type=int, default=20)

    mp = sub.add_parser("master")
    mp.add_argument("--limit", type=int, default=40)

    sub.add_parser("tables")

    args = ap.parse_args()
    cfg = load_cfg()

    with connect(cfg) as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if args.cmd == "tables":
                print("\n".join(mapped_tables(cur)))
                return

            if args.cmd == "search":
                if args.table == "all":
                    out = {"all": search(cur, "all", args.query, args.limit)}
                else:
                    out = {args.table: search(cur, args.table, args.query, args.limit)}
                print(json.dumps(out, default=str, indent=2))
                return

            if args.cmd == "get":
                row = get_row(cur, args.table, args.key)
                print(json.dumps(row, default=str, indent=2))
                return

            if args.cmd == "recent":
                rows = recent(cur, args.limit)
                print(json.dumps(rows, default=str, indent=2))
                return

            if args.cmd == "master":
                rows = master(cur, args.limit)
                print(json.dumps(rows, default=str, indent=2))
                return


if __name__ == "__main__":
    main()
