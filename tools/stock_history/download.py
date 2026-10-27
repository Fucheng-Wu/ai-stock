"""Download public A-share daily bars into a resumable local SQLite snapshot.

Only requests is required. No Java/MySQL credentials or model API keys are used.
Run with --help for options; --status is read-only and works during a download.
"""
from __future__ import annotations

import argparse
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3
import threading
import time

import requests


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIR = ROOT / "data" / "stock-history"
SHANGHAI = timezone(timedelta(hours=8))
SINA_BASE = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
TENCENT_URL = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get"
SYMBOL = re.compile(r"(?:sh6\d{5}|sz[03]\d{5}|bj\d{6})\Z")


def now() -> str:
    return datetime.now(SHANGHAI).isoformat(timespec="seconds")


def emit(event: str, **values) -> None:
    print(json.dumps({"event": event, "time": now(), **values}, ensure_ascii=True), flush=True)


def default_dates() -> tuple[date, date]:
    current = datetime.now(SHANGHAI)
    end = current.date() if current.hour >= 18 else current.date() - timedelta(days=1)
    # The interval spans the last calendar year, ending on a completed day.
    try:
        start = current.date().replace(year=current.year - 1)
    except ValueError:
        start = current.date().replace(year=current.year - 1, day=28)
    return start, end


class RateLimiter:
    def __init__(self, interval: float):
        self.interval = interval
        self.lock = threading.Lock()
        self.last = 0.0

    def acquire(self):
        with self.lock:
            delay = self.interval - (time.monotonic() - self.last)
            if delay > 0:
                time.sleep(delay)
            self.last = time.monotonic()


class PublicClient:
    def __init__(self, interval: float, attempts: int):
        self.limiter = RateLimiter(interval)
        self.attempts = attempts
        self.local = threading.local()

    def get(self, url: str, params: dict):
        if not hasattr(self.local, "session"):
            self.local.session = requests.Session()
        for attempt in range(self.attempts):
            self.limiter.acquire()
            try:
                response = self.local.session.get(url, params=params, timeout=(6, 20))
                response.raise_for_status()
                return response.json(), hashlib.sha256(response.content).hexdigest()
            except (requests.RequestException, ValueError):
                if attempt + 1 == self.attempts:
                    raise
                time.sleep(2 ** attempt)

    def universe(self) -> list[dict]:
        count_raw, _ = self.get(SINA_BASE + "Market_Center.getHQNodeStockCount", {"node": "hs_a"})
        expected = int(count_raw)
        if not 1000 <= expected <= 20000:
            raise ValueError(f"Unexpected A-share universe size: {expected}")
        result = {}
        pages = math.ceil(expected / 80)
        emit("universe_start", expected=expected, pages=pages)
        for page in range(1, pages + 1):
            rows, _ = self.get(SINA_BASE + "Market_Center.getHQNodeData", {
                "page": page, "num": 80, "sort": "symbol", "asc": 1,
                "node": "hs_a", "symbol": "",
            })
            if not isinstance(rows, list) or not rows:
                raise ValueError(f"Missing universe page {page}")
            for row in rows:
                symbol = row.get("symbol", "")
                name = row.get("name", "")
                if not SYMBOL.fullmatch(symbol) or not isinstance(name, str) or not name.strip():
                    raise ValueError(f"Unexpected A-share entry: {symbol!r}")
                if symbol in result:
                    raise ValueError(f"Duplicate universe symbol: {symbol}")
                result[symbol] = {"symbol": symbol, "code": symbol[2:], "exchange": symbol[:2], "name": name}
            if page % 10 == 0 or page == pages:
                emit("universe_progress", page=page, pages=pages, received=len(result))
        if len(result) != expected:
            raise ValueError(f"Incomplete universe: expected {expected}, got {len(result)}")
        return list(result.values())

    def history(self, symbol: str, start: date, end: date) -> tuple[list[tuple], dict]:
        versions = {}
        fingerprints = {}
        for adjustment in ("raw", "qfq"):
            flag = "" if adjustment == "raw" else "qfq"
            payload, digest = self.get(TENCENT_URL, {
                "param": f"{symbol},day,{start.isoformat()},{end.isoformat()},640,{flag}",
            })
            versions[adjustment] = parse_bars(payload, symbol, adjustment, start, end)
            fingerprints[adjustment] = digest
        if set(versions["raw"]) != set(versions["qfq"]):
            raise ValueError("Raw and qfq trading dates do not match")
        bars = []
        for trade_date in sorted(versions["raw"]):
            raw = versions["raw"][trade_date]
            qfq = versions["qfq"][trade_date]
            if raw[4] != qfq[4]:
                raise ValueError(f"Raw and qfq volumes do not match on {trade_date}")
            bars.append((trade_date, *raw[:4], *qfq[:4], raw[4]))
        return bars, fingerprints


def finite_number(value) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid price") from exc
    if not math.isfinite(result) or result <= 0:
        raise ValueError("Price must be finite and positive")
    return result


def parse_bars(payload, symbol: str, adjustment: str, start: date, end: date) -> dict[str, tuple]:
    if not isinstance(payload, dict) or payload.get("code") != 0:
        raise ValueError("Tencent returned an unsuccessful response")
    security = payload.get("data", {}).get(symbol)
    if not isinstance(security, dict):
        raise ValueError(f"No response for {symbol}")
    # With no corporate actions Tencent may return day instead of qfqday.
    rows = security.get("qfqday", security.get("day")) if adjustment == "qfq" else security.get("day")
    if not isinstance(rows, list):
        raise ValueError(f"Missing {adjustment} bar array for {symbol}")
    result = {}
    for row in rows:
        if not isinstance(row, list) or len(row) < 6:
            raise ValueError("Malformed daily bar")
        trade_date = date.fromisoformat(row[0])
        # The upstream sometimes ignores the requested dates and returns 640 bars.
        if not start <= trade_date <= end:
            continue
        opening, close, high, low = map(finite_number, row[1:5])
        if high + 0.00001 < max(opening, close, low) or low - 0.00001 > min(opening, close, high):
            raise ValueError(f"Invalid OHLC relationship on {trade_date}")
        try:
            # Tencent daily volume is in lots (100 shares); persist integer shares.
            volume = Decimal(str(row[5])) * 100
            if not volume.is_finite() or volume < 0 or volume != volume.to_integral_value():
                raise ValueError("Invalid volume in lots")
            volume_shares = int(volume)
            if volume_shares > 2**63 - 1:
                raise ValueError("Volume exceeds SQLite integer range")
        except InvalidOperation as exc:
            raise ValueError("Invalid volume") from exc
        key = trade_date.isoformat()
        value = (opening, high, low, close, volume_shares)
        if key in result and result[key] != value:
            raise ValueError(f"Conflicting daily bars on {key}")
        result[key] = value
    # Do not classify empty responses as a successful download or guess suspension.
    if not result:
        raise ValueError(f"No {adjustment} bars within requested dates")
    return result


def connect(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS batches (
            id TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            state TEXT NOT NULL, universe_source TEXT NOT NULL, universe_count INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS securities (
            batch_id TEXT NOT NULL REFERENCES batches(id), symbol TEXT NOT NULL,
            code TEXT NOT NULL, exchange TEXT NOT NULL, name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending', row_count INTEGER NOT NULL DEFAULT 0,
            first_date TEXT, last_date TEXT, fetched_at TEXT, error TEXT,
            raw_sha256 TEXT, qfq_sha256 TEXT,
            PRIMARY KEY(batch_id, symbol)
        );
        CREATE TABLE IF NOT EXISTS daily_bars (
            batch_id TEXT NOT NULL, symbol TEXT NOT NULL, trade_date TEXT NOT NULL,
            raw_open REAL NOT NULL, raw_high REAL NOT NULL, raw_low REAL NOT NULL, raw_close REAL NOT NULL,
            qfq_open REAL NOT NULL, qfq_high REAL NOT NULL, qfq_low REAL NOT NULL, qfq_close REAL NOT NULL,
            volume_shares INTEGER NOT NULL,
            PRIMARY KEY(batch_id, symbol, trade_date),
            FOREIGN KEY(batch_id, symbol) REFERENCES securities(batch_id, symbol)
        );
        CREATE INDEX IF NOT EXISTS daily_bars_date ON daily_bars(batch_id, trade_date);
    """)
    return connection


@contextmanager
def exclusive_download(directory: Path):
    # OS releases this lock on process exit, so crashes do not leave stale locks.
    handle = (directory / "download.lock").open("a+b")
    try:
        handle.seek(0)
        if handle.read(1) == b"":
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            if __import__("os").name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise RuntimeError("Another stock-history download is already running") from exc
        yield
    finally:
        handle.close()


def save_security(connection, batch_id, symbol, bars, fingerprints):
    stamp = now()
    # Both price series and their completion marker are committed together.
    with connection:
        connection.execute("DELETE FROM daily_bars WHERE batch_id=? AND symbol=?", (batch_id, symbol))
        connection.executemany("INSERT INTO daily_bars VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                               [(batch_id, symbol, *bar) for bar in bars])
        connection.execute("""UPDATE securities SET status='complete', row_count=?, first_date=?, last_date=?,
            fetched_at=?, error=NULL, raw_sha256=?, qfq_sha256=? WHERE batch_id=? AND symbol=?""",
            (len(bars), bars[0][0], bars[-1][0], stamp, fingerprints["raw"], fingerprints["qfq"], batch_id, symbol))


def summary(connection, batch_id: str) -> dict:
    batch = connection.execute("SELECT * FROM batches WHERE id=?", (batch_id,)).fetchone()
    counts = {row["status"]: row["n"] for row in connection.execute(
        "SELECT status, count(*) AS n FROM securities WHERE batch_id=? GROUP BY status", (batch_id,))}
    totals = connection.execute("""SELECT coalesce(sum(row_count),0) AS bars,
        min(first_date) AS first_date, max(last_date) AS last_date FROM securities WHERE batch_id=?""", (batch_id,)).fetchone()
    exchanges = [dict(row) for row in connection.execute("""SELECT exchange, count(*) AS total,
        sum(CASE WHEN status='complete' THEN 1 ELSE 0 END) AS complete
        FROM securities WHERE batch_id=? GROUP BY exchange""", (batch_id,))]
    return {**dict(batch), "counts": {key: counts.get(key, 0) for key in ("pending", "complete", "error")},
            **dict(totals), "exchanges": exchanges}


def write_report(connection, batch_id: str, directory: Path):
    report = summary(connection, batch_id)
    report["database"] = str(directory / "history.sqlite3")
    report["volume_unit"] = "shares"
    report["price_source"] = TENCENT_URL
    report["errors"] = [dict(row) for row in connection.execute(
        "SELECT symbol,name,error FROM securities WHERE batch_id=? AND status='error' ORDER BY symbol", (batch_id,))]
    target = directory / f"report-{batch_id}.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(target)
    return report


def download(args, directory: Path) -> int:
    start, end = args.start, args.end
    batch_id = f"{start}_{end}"
    client = PublicClient(args.interval, args.attempts)
    with exclusive_download(directory), connect(directory / "history.sqlite3") as connection:
        batch = connection.execute("SELECT * FROM batches WHERE id=?", (batch_id,)).fetchone()
        if batch is None:
            universe = client.universe()
            with connection:
                connection.execute("INSERT INTO batches VALUES (?,?,?,?,?,?,?,?)",
                    (batch_id, str(start), str(end), now(), now(), "pending", "sina:hs_a", len(universe)))
                connection.executemany("INSERT INTO securities(batch_id,symbol,code,exchange,name) VALUES (?,?,?,?,?)",
                    [(batch_id, row["symbol"], row["code"], row["exchange"], row["name"]) for row in universe])
            emit("universe_saved", batch_id=batch_id, total=len(universe))
        symbols = args.symbols.split(",") if args.symbols else None
        if symbols:
            available = {row[0] for row in connection.execute("SELECT symbol FROM securities WHERE batch_id=?", (batch_id,))}
            if set(symbols) - available:
                raise ValueError(f"Symbols absent from saved universe: {sorted(set(symbols) - available)}")
        targets = [row[0] for row in connection.execute(
            "SELECT symbol FROM securities WHERE batch_id=? AND status!='complete' ORDER BY symbol", (batch_id,))
            if symbols is None or row[0] in symbols]
        if args.limit:
            targets = targets[:args.limit]
        with connection:
            connection.execute("UPDATE batches SET state='running',updated_at=? WHERE id=?", (now(), batch_id))
        emit("download_start", batch_id=batch_id, selected=len(targets), **summary(connection, batch_id)["counts"])
        failures = 0
        completed = 0
        interrupted = False
        fatal_error = None
        iterator = iter(targets)
        executor = ThreadPoolExecutor(max_workers=args.workers)
        futures = {}

        def submit_next():
            symbol = next(iterator, None)
            if symbol:
                futures[executor.submit(client.history, symbol, start, end)] = symbol

        try:
            for _ in range(args.workers):
                submit_next()
            while futures:
                done, _ = wait(futures, timeout=2, return_when=FIRST_COMPLETED)
                for future in done:
                    symbol = futures.pop(future)
                    try:
                        bars, fingerprints = future.result()
                    except Exception as exc:
                        failures += 1
                        with connection:
                            connection.execute("UPDATE securities SET status='error',error=?,fetched_at=? WHERE batch_id=? AND symbol=?",
                                               (f"{type(exc).__name__}: {exc}"[:1000], now(), batch_id, symbol))
                        emit("symbol_error", symbol=symbol, error_type=type(exc).__name__, message=str(exc)[:240])
                    else:
                        # Storage failures are fatal; do not mislabel a full disk as bad market data.
                        save_security(connection, batch_id, symbol, bars, fingerprints)
                        failures = 0
                    completed += 1
                    if completed % 10 == 0:
                        with connection:
                            connection.execute("UPDATE batches SET updated_at=? WHERE id=?", (now(), batch_id))
                        progress = write_report(connection, batch_id, directory)
                        emit("progress", processed=completed, counts=progress["counts"], bars=progress["bars"])
                    if failures >= 8:
                        interrupted = True
                        emit("source_unavailable", message="Eight consecutive failures; stopped to avoid repeated requests")
                        break
                    submit_next()
                if interrupted:
                    break
        except KeyboardInterrupt:
            interrupted = True
            emit("interrupted", message="Committed stocks are retained; rerun to resume")
        except Exception as exc:
            interrupted = True
            fatal_error = exc
        finally:
            for future in futures:
                future.cancel()
            executor.shutdown(wait=True, cancel_futures=True)
            counts = summary(connection, batch_id)["counts"]
            state = "interrupted" if interrupted else "complete" if not counts["pending"] and not counts["error"] else "partial"
            with connection:
                connection.execute("UPDATE batches SET state=?,updated_at=? WHERE id=?", (state, now(), batch_id))
            report = write_report(connection, batch_id, directory)
            emit("download_end", state=state, counts=report["counts"], bars=report["bars"], database=report["database"])
        if fatal_error:
            raise fatal_error
        return 2 if interrupted or report["counts"]["error"] else 0


def main() -> int:
    start, end = default_dates()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DIR)
    parser.add_argument("--start", type=date.fromisoformat, default=start)
    parser.add_argument("--end", type=date.fromisoformat, default=end)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--interval", type=float, default=0.5, help="Minimum seconds between requests globally")
    parser.add_argument("--attempts", type=int, default=3)
    parser.add_argument("--symbols", help="Comma-separated prefixed symbols for a sample run")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--status", action="store_true", help="Show latest batch; never starts a download")
    parser.add_argument("--resume", action="store_true", help="Resume the most recently created batch, retaining its dates")
    args = parser.parse_args()
    directory = args.data_dir.resolve()
    if args.status:
        path = directory / "history.sqlite3"
        if not path.exists():
            emit("status", state="not_started", database=str(path))
            return 0
        with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=10) as connection:
            connection.row_factory = sqlite3.Row
            latest = connection.execute("SELECT id FROM batches ORDER BY created_at DESC LIMIT 1").fetchone()
            emit("status", **summary(connection, latest[0])) if latest else emit("status", state="initializing")
        return 0
    if args.resume:
        path = directory / "history.sqlite3"
        if not path.exists():
            parser.error("No database to resume")
        with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as connection:
            latest = connection.execute("SELECT start_date,end_date FROM batches ORDER BY created_at DESC LIMIT 1").fetchone()
        if latest is None:
            parser.error("No saved batch to resume")
        args.start, args.end = map(date.fromisoformat, latest)
    if args.start > args.end or (args.end - args.start).days > 400:
        parser.error("Date range must be ordered and at most 400 days; this downloader is for a one-year snapshot")
    if args.end >= datetime.now(SHANGHAI).date() and datetime.now(SHANGHAI).hour < 18:
        parser.error("Before 18:00 Asia/Shanghai, use an end date before today")
    if args.end > datetime.now(SHANGHAI).date():
        parser.error("End date cannot be in the future")
    if not 1 <= args.workers <= 4 or args.interval < 0.25 or not 1 <= args.attempts <= 5:
        parser.error("Use 1-4 workers, interval >=0.25, and 1-5 attempts")
    if args.limit is not None and args.limit < 1:
        parser.error("Limit must be positive")
    directory.mkdir(parents=True, exist_ok=True)
    return download(args, directory)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        emit("fatal", error_type=type(error).__name__, message=str(error)[:500])
        raise SystemExit(1)
