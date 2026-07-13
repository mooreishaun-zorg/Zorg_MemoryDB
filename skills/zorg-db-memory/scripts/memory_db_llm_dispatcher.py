#!/usr/bin/env python3
"""Dispatch PostgreSQL-owned LLM scheduled jobs through OpenClaw.

PostgreSQL owns timing, prompts, delivery metadata, queue rows, and run records.
This process is intentionally a single listener, not a per-job cron scheduler:
it wakes from LISTEN/NOTIFY and claims due rows from memory_llm_job_queue.
"""
from __future__ import annotations

import json
import os
import select
import socket
import subprocess
import sys
import time
from pathlib import Path

import psycopg2
import psycopg2.extras

WORKSPACE = Path(os.environ.get("OPENCLAW_WORKSPACE") or os.environ.get("WORKSPACE_DIR") or (Path.home() / ".openclaw" / "workspace")).expanduser().resolve()
MAP_PATH = Path(os.environ.get("SQL_MEMORY_MAP") or os.environ.get("ZORG_SQL_MEMORY_MAP") or (WORKSPACE / "sql_memory_map.json")).expanduser().resolve()
OPENCLAW_BIN = os.environ.get("OPENCLAW_BIN", "openclaw")
WORKER_ID = f"llm-db-dispatcher@{socket.gethostname()}:{os.getpid()}"


def load_cfg() -> dict[str, object]:
    cfg = json.loads(MAP_PATH.read_text())
    p = cfg["postgres"]
    return {
        "host": p["host"],
        "port": p["port"],
        "dbname": p["database"],
        "user": p["user"],
        "password": p["password"],
    }


def connect():
    conn = psycopg2.connect(**load_cfg())
    conn.autocommit = True
    return conn


def claim(conn):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("select * from public.memory_llm_claim_job(%s)", (WORKER_ID,))
        return cur.fetchone()


def finish(conn, queue_id, status, summary="", stdout="", stderr="", error=""):
    with conn.cursor() as cur:
        cur.execute(
            "select public.memory_llm_finish_job(%s,%s,%s,%s,%s,%s)",
            (queue_id, status, summary, stdout, stderr, error),
        )


def enqueue_due(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "select public.memory_llm_enqueue_due_jobs_v1(%s)",
            (25,),
        )


def build_agent_command(row: dict) -> list[str]:
    snapshot = row["payload_snapshot"]
    payload = snapshot.get("payload") or {}
    delivery = row["delivery_snapshot"] or {}
    message = str(payload.get("message") or "").strip()
    if not message:
        raise ValueError(f"job {row['job_key']} has empty payload.message")

    cmd = [
        OPENCLAW_BIN,
        "agent",
        "--agent",
        str(snapshot.get("agent_id") or "main"),
        "--message",
        message,
        "--session-key",
        f"db-cron:{row['job_key']}",
        "--json",
    ]

    model = payload.get("model")
    if model:
        cmd.extend(["--model", str(model)])
    thinking = payload.get("thinking")
    if thinking:
        cmd.extend(["--thinking", str(thinking)])
    timeout = payload.get("timeoutSeconds")
    if timeout:
        cmd.extend(["--timeout", str(int(timeout))])

    if delivery.get("mode") == "announce":
        cmd.append("--deliver")
        channel = delivery.get("channel")
        target = delivery.get("to")
        account = delivery.get("accountId")
        if channel:
            cmd.extend(["--reply-channel", str(channel)])
        if target:
            cmd.extend(["--reply-to", str(target)])
        if account:
            cmd.extend(["--reply-account", str(account)])

    return cmd


def build_process_command(row: dict) -> tuple[list[str], str]:
    snapshot = row["payload_snapshot"]
    payload = snapshot.get("payload") or {}
    argv = payload.get("argv")
    if not isinstance(argv, list) or not all(isinstance(item, str) for item in argv) or not argv:
        raise ValueError(f"job {row['job_key']} has invalid command argv")

    cwd = str(payload.get("cwd") or WORKSPACE)
    return argv, cwd


def run_one(conn, row: dict) -> None:
    queue_id = row["queue_id"]
    try:
        snapshot = row["payload_snapshot"]
        payload = snapshot.get("payload") or {}
        payload_kind = payload.get("kind")
        if payload_kind == "command":
            cmd, cwd = build_process_command(row)
        else:
            cmd = build_agent_command(row)
            cwd = str(WORKSPACE)

        timeout = int(payload.get("timeoutSeconds") or payload.get("timeoutS") or 7200)
        proc = subprocess.run(
            cmd,
            cwd=cwd,
            text=True,
            capture_output=True,
            timeout=timeout,
            env={**os.environ, "OPENCLAW_WORKSPACE": str(WORKSPACE)},
        )
        status = "done" if proc.returncode == 0 else "failed"
        runner = "command" if payload_kind == "command" else "openclaw agent"
        summary = f"{runner} run completed" if proc.returncode == 0 else f"{runner} exited {proc.returncode}"
        finish(conn, queue_id, status, summary, proc.stdout, proc.stderr, "" if proc.returncode == 0 else summary)
    except Exception as exc:
        finish(conn, queue_id, "failed", "dispatcher exception", "", "", repr(exc))


def drain(conn) -> int:
    enqueue_due(conn)
    count = 0
    while True:
        row = claim(conn)
        if not row:
            return count
        run_one(conn, row)
        count += 1


def main() -> int:
    while True:
        try:
            conn = connect()
            with conn.cursor() as cur:
                cur.execute("LISTEN memory_llm_job_queue")
            drain(conn)
            while True:
                if select.select([conn], [], [], 60) == ([], [], []):
                    drain(conn)
                    continue
                conn.poll()
                while conn.notifies:
                    conn.notifies.pop(0)
                drain(conn)
        except KeyboardInterrupt:
            return 0
        except Exception as exc:
            print(f"{WORKER_ID} error: {exc!r}", file=sys.stderr, flush=True)
            time.sleep(10)


if __name__ == "__main__":
    raise SystemExit(main())
