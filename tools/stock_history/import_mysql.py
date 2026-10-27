"""One-time, resumable migration of completed SQLite history and screening evidence.

Credentials are read from an existing .env (AGENT_DB_* or DB_*), never CLI values.
The original SQLite and snapshot files are read-only and are retained.
"""
from __future__ import annotations
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import sqlite3

import pymysql
from pymysql.constants import CLIENT
from download import DEFAULT_DIR, ROOT, SHANGHAI, emit


def credentials(path):
    allowed = {prefix + key for prefix in ("DB_", "AGENT_DB_") for key in ("HOST", "PORT", "NAME", "USER", "PASSWORD")}
    saved = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if "=" not in line or line.lstrip().startswith("#"): continue
        key, value = line.split("=", 1)
        if key.strip() not in allowed: continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'): value = value[1:-1]
        saved[key.strip()] = value
    saved.update({key: os.environ[key] for key in allowed if key in os.environ})
    def get(key, default=None):
        return saved.get("DB_" + key, saved.get("AGENT_DB_" + key, default))
    if get("PASSWORD") is None: raise ValueError("Missing database password configuration")
    return dict(host=get("HOST", "127.0.0.1"), port=int(get("PORT", "3306")), user=get("USER", "root"),
                password=get("PASSWORD"), database=get("NAME", "ai_stock"), charset="utf8mb4",
                client_flag=CLIENT.MULTI_STATEMENTS, autocommit=False)


def execute_script(cursor, path):
    cursor.execute(path.read_text(encoding="utf-8-sig"))
    while cursor.nextset(): pass


def stamp(value=None):
    return (datetime.fromisoformat(value).astimezone(SHANGHAI) if value else datetime.now(SHANGHAI)).replace(tzinfo=None)


def migrate(args):
    path = args.sqlite.resolve()
    with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as source, pymysql.connect(**credentials(args.env_file)) as db:
        source.row_factory = sqlite3.Row
        batch = source.execute("SELECT * FROM batches WHERE state='complete' ORDER BY created_at DESC LIMIT 1").fetchone()
        if batch is None: raise ValueError("No complete SQLite batch")
        counts = dict(source.execute("SELECT status,count(*) FROM securities WHERE batch_id=? GROUP BY status", (batch["id"],)))
        if counts != {"complete": batch["universe_count"]}: raise ValueError("SQLite coverage does not match metadata")
        with db.cursor() as cursor:
            if args.apply_schema:
                execute_script(cursor, ROOT / "sql/stock_market.sql")
                db.commit()
            if args.register_jobs:
                execute_script(cursor, ROOT / "sql/stock_market_jobs.sql")
                db.commit()
            lock_name = "stock-market:" + db.db.decode() if isinstance(db.db, bytes) else "stock-market:" + db.db
            lock_name = lock_name[:64]
            cursor.execute("SELECT GET_LOCK(%s,0)", (lock_name,))
            if cursor.fetchone()[0] != 1: raise RuntimeError("Market sync/screen is running; retry migration later")
            try:
                sync_id = "sqlite-" + hashlib.sha256(batch["id"].encode()).hexdigest()[:32]
                cursor.execute("SELECT status FROM stock_market_sync_run WHERE run_id=%s", (sync_id,))
                existing = cursor.fetchone()
                if not existing or existing[0] != "COMPLETE":
                    cursor.execute("SELECT MAX(trade_date) FROM stock_market_sync_run")
                    latest = cursor.fetchone()[0]
                    if latest and str(latest) > batch["end_date"]: raise ValueError("Newer market data exists; cannot overwrite its adjustment basis")
                    cursor.execute("""INSERT INTO stock_market_sync_run(run_id,trade_date,status,expected_count,source,started_at)
                        VALUES (%s,%s,'RUNNING',%s,'SQLite historical migration',%s)
                        ON DUPLICATE KEY UPDATE status='RUNNING',finished_at=NULL,error_message=NULL""",
                        (sync_id, batch["end_date"], batch["universe_count"], stamp()))
                    securities = list(source.execute("SELECT * FROM securities WHERE batch_id=? ORDER BY symbol", (batch["id"],)))
                    fetched_times = {row["symbol"]: stamp(row["fetched_at"]) for row in securities}
                    cursor.executemany("""INSERT INTO stock_market_security(symbol,code,exchange,name,first_seen_date,last_seen_date,updated_at)
                        VALUES (%s,%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE name=VALUES(name),active=1,last_seen_date=VALUES(last_seen_date),updated_at=VALUES(updated_at)""",
                        [(r["symbol"], r["code"], r["exchange"], r["name"], batch["end_date"], batch["end_date"], stamp()) for r in securities])
                    cursor.executemany("""INSERT INTO stock_market_sync_item(run_id,symbol,name,exchange,status,row_count,last_bar_date)
                        VALUES (%s,%s,%s,%s,'COMPLETE',%s,%s) ON DUPLICATE KEY UPDATE status='COMPLETE',row_count=VALUES(row_count),last_bar_date=VALUES(last_bar_date)""",
                        [(sync_id, r["symbol"], r["name"], r["exchange"], r["row_count"], r["last_date"]) for r in securities])
                    db.commit()
                    rows = source.execute("SELECT * FROM daily_bars WHERE batch_id=? ORDER BY symbol,trade_date", (batch["id"],))
                    processed = 0
                    while chunk := rows.fetchmany(2000):
                        cursor.executemany("""INSERT INTO stock_market_daily(symbol,trade_date,raw_open,raw_high,raw_low,raw_close,qfq_open,qfq_high,qfq_low,qfq_close,volume_shares,qfq_as_of_date,last_sync_id,fetched_at)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                            ON DUPLICATE KEY UPDATE raw_open=VALUES(raw_open),raw_high=VALUES(raw_high),raw_low=VALUES(raw_low),raw_close=VALUES(raw_close),
                            qfq_open=VALUES(qfq_open),qfq_high=VALUES(qfq_high),qfq_low=VALUES(qfq_low),qfq_close=VALUES(qfq_close),volume_shares=VALUES(volume_shares),
                            qfq_as_of_date=VALUES(qfq_as_of_date),last_sync_id=VALUES(last_sync_id),fetched_at=VALUES(fetched_at)""",
                            [(r["symbol"], r["trade_date"], r["raw_open"], r["raw_high"], r["raw_low"], r["raw_close"], r["qfq_open"], r["qfq_high"], r["qfq_low"], r["qfq_close"], r["volume_shares"], batch["end_date"], sync_id, fetched_times[r["symbol"]]) for r in chunk])
                        db.commit(); processed += len(chunk)
                        if processed % 100000 == 0: emit("mysql_import_progress", bars=processed)
                    cursor.execute("SELECT COUNT(*) FROM stock_market_daily WHERE last_sync_id=%s", (sync_id,))
                    if cursor.fetchone()[0] != processed: raise ValueError("MySQL row count does not match imported rows")
                    cursor.execute("UPDATE stock_market_sync_run SET status='COMPLETE',completed_count=expected_count,failed_count=0,finished_at=%s WHERE run_id=%s", (stamp(), sync_id))
                    db.commit(); emit("mysql_history_imported", securities=len(securities), bars=processed)
                else: emit("mysql_history_already_imported", sync_id=sync_id)
                if args.screen_dir:
                    latest = json.loads((args.screen_dir / "latest.json").read_text(encoding="utf-8"))
                    identifier = latest["snapshotId"]
                    import re
                    if not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", identifier): raise ValueError("Invalid snapshot ID")
                    folder = args.screen_dir / identifier
                    report = json.loads((folder / "report.json").read_text(encoding="utf-8"))
                    if report["batchId"] != batch["id"] or report["state"] != "complete": raise ValueError("Screen snapshot does not match SQLite batch")
                    cursor.execute("SELECT status FROM stock_screen_run WHERE snapshot_id=%s", (identifier,))
                    found = cursor.fetchone()
                    if found and found[0] == "COMPLETE": emit("mysql_screen_already_imported", snapshot_id=identifier)
                    else:
                        cursor.execute("""INSERT INTO stock_screen_run(snapshot_id,sync_run_id,trade_date,status,engine_sha256,universe_count,exclusion_counts,created_at)
                            VALUES (%s,%s,%s,'RUNNING',%s,%s,'{}',%s) ON DUPLICATE KEY UPDATE status='RUNNING',error_message=NULL""",
                            (identifier, sync_id, report["tradeDate"], report["engineSha256"], report["universeCount"], stamp(report["createdAt"])))
                        db.commit()
                        records = [json.loads(line) for line in (folder / "analysis.jsonl").open(encoding="utf-8")]
                        if len(records) != batch["universe_count"] or len({r["symbol"] for r in records}) != len(records): raise ValueError("Screen coverage mismatch")
                        matched = [r for r in records if r.get("signals")]
                        if len(matched) != report["matchedStocks"]: raise ValueError("Screen candidate count mismatch")
                        for offset in range(0, len(records), 100):
                            cursor.executemany("""INSERT INTO stock_screen_result(snapshot_id,symbol,name,exchange,is_st,result_status,reason_code,golden_cross,retrace,convergence,result_json)
                                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE result_json=VALUES(result_json),result_status=VALUES(result_status),
                                reason_code=VALUES(reason_code),golden_cross=VALUES(golden_cross),retrace=VALUES(retrace),convergence=VALUES(convergence)""",
                                [(identifier, r["symbol"], r["name"], r["exchange"], r["isST"], r["status"], r.get("reason"),
                                  "BUY_GOLDEN_CROSS" in r.get("signals", []), "BUY_RETRACE" in r.get("signals", []), "BUY_CONVERGENCE" in r.get("signals", []), json.dumps(r, ensure_ascii=False)) for r in records[offset:offset+100]])
                            db.commit()
                        signal_counts = report["signalCounts"]
                        cursor.execute("""UPDATE stock_screen_run SET status='COMPLETE',analyzed_count=%s,excluded_count=%s,uptrend_count=%s,matched_count=%s,matched_st_count=%s,
                            golden_count=%s,retrace_count=%s,convergence_count=%s,exclusion_counts=%s,finished_at=%s WHERE snapshot_id=%s""",
                            (report["analyzedCount"], report["excludedCount"], report["uptrendCount"], report["matchedStocks"], report["matchedSTStocks"], signal_counts["BUY_GOLDEN_CROSS"],
                             signal_counts["BUY_RETRACE"], signal_counts["BUY_CONVERGENCE"], json.dumps(report["exclusionCounts"]), stamp(report["createdAt"]), identifier))
                        db.commit(); emit("mysql_screen_imported", stocks=len(records), candidates=len(matched), snapshot_id=identifier)
            finally:
                cursor.execute("SELECT RELEASE_LOCK(%s)", (lock_name,)); db.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, default=DEFAULT_DIR / "history.sqlite3")
    parser.add_argument("--screen-dir", type=Path, default=DEFAULT_DIR / "screens")
    parser.add_argument("--env-file", type=Path, default=ROOT / "agent-gateway/.env")
    parser.add_argument("--apply-schema", action="store_true")
    parser.add_argument("--register-jobs", action="store_true")
    try: migrate(parser.parse_args())
    except Exception as exc:
        emit("mysql_import_failed", error_type=type(exc).__name__, message="Migration failed; check connectivity/schema and retry. No credentials are printed.")
        raise SystemExit(1)
