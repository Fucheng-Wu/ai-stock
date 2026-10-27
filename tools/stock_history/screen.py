"""Screen a downloaded SQLite snapshot through the project's actual Java 520 engine.

No network, model API, running Spring application, or MySQL connection is needed.
Requires JDK 17+ and the project's cached fastjson2 dependency (or --fastjson-jar).
"""
from __future__ import annotations

import argparse
from collections import Counter
import csv
from datetime import date
import hashlib
from itertools import groupby
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import tempfile
import xml.etree.ElementTree as ET

from download import DEFAULT_DIR, ROOT, emit, now


SIGNALS = {"BUY_GOLDEN_CROSS": "金叉", "BUY_RETRACE": "缩量回踩", "BUY_CONVERGENCE": "粘合发散"}
DOMAIN = ROOT / "ruoyi-system/src/main/java/com/ruoyi/system/domain/stock"
SOURCE_ROOT = ROOT / "ruoyi-system/src/main/java/com/ruoyi/system/service"


def engine_sources() -> list[Path]:
    names = ["AnalysisSignal", "BuyPointStep", "ExitStep", "RuleEvidence", "RuleJudgment",
             "StockKlineData", "StockRealtimeData", "StrategyReport"]
    return [*(DOMAIN / f"{name}.java" for name in names),
            SOURCE_ROOT / "support/StockMovingAverage.java",
            SOURCE_ROOT / "support/StockScreenCalculator.java",
            SOURCE_ROOT / "impl/StockStrategyReportBuilder.java",
            Path(__file__).parent / "java/StockHistoryScreen.java"]


def engine_fingerprint() -> str:
    digest = hashlib.sha256()
    for source in engine_sources():
        digest.update(source.name.encode())
        digest.update(source.read_bytes())
    return digest.hexdigest()


def find_fastjson(explicit: Path | None = None) -> Path:
    if explicit is not None:
        if not explicit.is_file():
            raise FileNotFoundError(f"Missing fastjson2 jar: {explicit}")
        return explicit.resolve()
    pom = ET.parse(ROOT / "pom.xml").getroot()
    version = pom.findtext("{*}properties/{*}fastjson.version")
    repositories = []
    if os.environ.get("MAVEN_REPO_LOCAL"):
        repositories.append(Path(os.environ["MAVEN_REPO_LOCAL"]))
    settings = [Path.home() / ".m2/settings.xml"]
    maven = shutil.which("mvn")
    if maven:
        settings.append(Path(maven).resolve().parents[1] / "conf/settings.xml")
    for setting in settings:
        if setting.is_file():
            repository = ET.parse(setting).getroot().findtext("{*}localRepository")
            if repository and "${" not in repository:
                repositories.append(Path(repository.strip()))
    repositories.append(Path.home() / ".m2/repository")
    for repository in repositories:
        candidate = repository / f"com/alibaba/fastjson2/fastjson2/{version}/fastjson2-{version}.jar"
        if candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError("fastjson2 is not cached; build the Java project or supply --fastjson-jar PATH")


def compile_engine(build_dir: Path, jar: Path) -> str:
    compiler = shutil.which("javac")
    if not compiler or not shutil.which("java"):
        raise RuntimeError("JDK 17+ (java and javac) must be available on PATH")
    build_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run([compiler, "--release", "17", "-encoding", "UTF-8", "-cp", str(jar),
                    "-d", str(build_dir), *(str(path) for path in engine_sources())], check=True)
    return str(build_dir) + os.pathsep + str(jar)


def prepare_security(security: dict, rows: list, trade_date: str, exclude_st: bool) -> tuple[dict | None, dict | None]:
    is_st = bool(re.match(r"^S?\*?ST", security["name"].upper()))
    base = {"symbol": security["symbol"], "name": security["name"], "exchange": security["exchange"],
            "isST": is_st, "tradeDate": trade_date, "lastDate": rows[-1]["trade_date"] if rows else None}
    reason = None
    if not rows or rows[-1]["trade_date"] != trade_date:
        reason = "STALE_OR_MISSING_DATA"
    elif len(rows) < 21:
        reason = "INSUFFICIENT_HISTORY"
    elif rows[-1]["volume_shares"] <= 0:
        reason = "NO_TRADING_VOLUME"
    elif exclude_st and is_st:
        reason = "ST_FILTER"
    if reason:
        return None, {**base, "status": "excluded", "reason": reason}
    bars = [{"date": row["trade_date"], "open": row["qfq_open"], "high": row["qfq_high"],
             "low": row["qfq_low"], "close": row["qfq_close"], "volume": row["volume_shares"]} for row in rows]
    return {**base, "rawClose": rows[-1]["raw_close"], "bars": bars}, None


def prepare_input(connection, batch_id: str, trade_date: str, exclude_st: bool, target: Path):
    securities = {row["symbol"]: dict(row) for row in connection.execute(
        "SELECT symbol,name,exchange FROM securities WHERE batch_id=? ORDER BY symbol", (batch_id,))}
    rows = connection.execute("""WITH recent AS (
        SELECT symbol,trade_date,qfq_open,qfq_high,qfq_low,qfq_close,raw_close,volume_shares,
            row_number() OVER (PARTITION BY symbol ORDER BY trade_date DESC) AS position
        FROM daily_bars WHERE batch_id=? AND trade_date<=?
    ) SELECT * FROM recent WHERE position<=80 ORDER BY symbol,trade_date""", (batch_id, trade_date))
    eligible, excluded, seen = set(), {}, set()
    with target.open("w", encoding="utf-8", newline="\n") as handle:
        for symbol, grouped in groupby(rows, key=lambda row: row["symbol"]):
            seen.add(symbol)
            request, exclusion = prepare_security(securities[symbol], list(grouped), trade_date, exclude_st)
            if exclusion:
                excluded[symbol] = exclusion
            else:
                eligible.add(symbol)
                handle.write(json.dumps(request, ensure_ascii=False) + "\n")
        for symbol in securities.keys() - seen:
            _, exclusion = prepare_security(securities[symbol], [], trade_date, exclude_st)
            excluded[symbol] = exclusion
    return eligible, excluded


def read_results(path: Path, eligible: set[str]) -> dict:
    results = {}
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            record = json.loads(line)
            symbol = record.get("symbol")
            if symbol not in eligible or symbol in results:
                raise ValueError(f"Unexpected/duplicate engine result: {symbol}")
            if any(signal not in SIGNALS for signal in record["signals"]):
                raise ValueError(f"Unexpected signal for {symbol}")
            results[symbol] = record
    if set(results) != eligible:
        raise ValueError(f"Missing engine results: {len(eligible - results.keys())}")
    return results


def atomic_text(path: Path, content: str, encoding="utf-8"):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(content, encoding=encoding)
    temporary.replace(path)


def publish(output: Path, report: dict, records: dict):
    candidates = [record for record in records.values() if record.get("signals")]
    candidates.sort(key=lambda record: record["symbol"])
    exclusions = [record for record in records.values() if record["status"] == "excluded"]
    atomic_text(output / "analysis.jsonl", "".join(json.dumps(records[symbol], ensure_ascii=False) + "\n" for symbol in sorted(records)))
    # Bounded candidate snapshot for gateway queries; full universe evidence stays in JSONL.
    atomic_text(output / "candidates.json", json.dumps(candidates, ensure_ascii=False))
    temporary = output / "candidates.csv.tmp"
    with temporary.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["股票代码", "名称", "交易所", "行情日期", "命中买点", "不复权收盘价", "前复权收盘价",
                         "MA5(前复权)", "MA20(前复权)", "MA20单日变化率(%)", "距MA20(%)", "成交量(股)", "ST标记", "规则原因"])
        for record in candidates:
            hit_rules = [rule for rule in record["strategyReport"]["buyPointStep"]["items"] if rule["status"] == "SATISFIED"]
            writer.writerow([record["symbol"], record["name"], record["exchange"], record["tradeDate"],
                "/".join(SIGNALS[signal] for signal in record["signals"]), record["rawClose"], record["qfqClose"],
                record["ma5"], record["ma20"], round(record["ma20ChangePct"], 4), round(record["distanceMa20Pct"], 4),
                record["volumeShares"], "是" if record["isST"] else "否", "; ".join(rule["reason"] for rule in hit_rules)])
    temporary.replace(output / "candidates.csv")
    atomic_text(output / "excluded.json", json.dumps(sorted(exclusions, key=lambda row: row["symbol"]), ensure_ascii=False, indent=2))
    lines = [f"# 520 全市场筛选：{report['tradeDate']}", "",
        f"股票范围：{report['universeCount']} 只；完成规则分析：{report['analyzedCount']} 只；排除：{report['excludedCount']} 只。",
        f"趋势向上：{report['uptrendCount']} 只；命中至少一个买点：{report['matchedStocks']} 只。", "",
        "买点数量（同一股票可能命中多个）：" + "，".join(f"{SIGNALS[key]} {value}" for key, value in report["signalCounts"].items()) + "。", "",
        "使用下载快照的前复权日线及项目 Java 规则，均线沿用两位小数。按股票代码排序，不表示推荐优先级或上涨概率。",
        "本结果的行情日期以上述日期为准，不代表当前盘中信号。", "",
        "全部候选见同目录 candidates.csv，完整规则证据见 analysis.jsonl，排除原因见 excluded.json。", "",
        "|代码|名称|买点|不复权收盘价|MA20（前复权）|ST|", "|---|---|---|---:|---:|---|"]
    for record in candidates[:50]:
        name = record["name"].replace("|", "\\|").replace("\n", " ")
        signals = "/".join(SIGNALS[signal] for signal in record["signals"])
        lines.append(f"|{record['symbol']}|{name}|{signals}|{record['rawClose']}|{record['ma20']}|{'是' if record['isST'] else ''}|")
    if len(candidates) > 50:
        lines.extend(["", f"此处预览前 50 只，CSV 包含全部 {len(candidates)} 只。"])
    lines.extend(["", "排除统计：" + json.dumps(report["exclusionCounts"], ensure_ascii=False), ""])
    atomic_text(output / "summary.md", "\n".join(lines))
    # Publish metadata last so it never reports success ahead of the result files.
    atomic_text(output / "report.json", json.dumps(report, ensure_ascii=False, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=DEFAULT_DIR / "history.sqlite3")
    parser.add_argument("--batch", help="Downloaded batch ID; defaults to latest complete snapshot")
    parser.add_argument("--date", type=date.fromisoformat, help="As-of date; defaults to the latest date present in the batch")
    parser.add_argument("--exclude-st", action="store_true", help="Explicit optional filter; default includes and marks ST stocks")
    parser.add_argument("--fastjson-jar", type=Path)
    args = parser.parse_args()
    database = args.database.resolve()
    if not database.is_file():
        parser.error(f"Missing database: {database}")
    fingerprint = engine_fingerprint()
    jar = find_fastjson(args.fastjson_jar)
    output_root = database.parent / "screens"
    output_root.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=30) as connection:
        connection.row_factory = sqlite3.Row
        if args.batch:
            batch = connection.execute("SELECT * FROM batches WHERE id=?", (args.batch,)).fetchone()
        else:
            batch = connection.execute("SELECT * FROM batches WHERE state='complete' ORDER BY created_at DESC LIMIT 1").fetchone()
        if batch is None or batch["state"] != "complete":
            raise ValueError("Screening requires a complete download batch")
        counts = dict(connection.execute("SELECT status,count(*) FROM securities WHERE batch_id=? GROUP BY status", (batch["id"],)))
        if counts != {"complete": batch["universe_count"]}:
            raise ValueError("Saved download counts disagree with batch metadata")
        requested_date = str(args.date or batch["end_date"])
        if not batch["start_date"] <= requested_date <= batch["end_date"]:
            raise ValueError("Requested date lies outside the downloaded snapshot")
        trade_date = connection.execute("SELECT max(trade_date) FROM daily_bars WHERE batch_id=? AND trade_date<=?",
                                        (batch["id"], requested_date)).fetchone()[0]
        if trade_date is None:
            raise ValueError("No bars on or before requested date")
        output = output_root / f"{batch['id']}_{trade_date}_{fingerprint[:10]}_{'no-st' if args.exclude_st else 'all'}"
        output.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="screen-", dir=output_root) as temporary:
            work = Path(temporary)
            eligible, excluded = prepare_input(connection, batch["id"], trade_date, args.exclude_st, work / "input.jsonl")
            emit("screen_start", batch=batch["id"], trade_date=trade_date, eligible=len(eligible), excluded=len(excluded))
            classpath = compile_engine(work / "classes", jar)
            with (work / "input.jsonl").open("rb") as source, (work / "output.jsonl").open("wb") as destination:
                subprocess.run([shutil.which("java"), "-Xmx384m", "-cp", classpath, "StockHistoryScreen"],
                               stdin=source, stdout=destination, check=True)
            results = read_results(work / "output.jsonl", eligible)
            matched = [record for record in results.values() if record["signals"]]
            signal_counts = Counter(signal for record in matched for signal in record["signals"])
            report = {"createdAt": now(), "state": "complete", "snapshotId": output.name, "database": str(database), "batchId": batch["id"],
                "snapshotCreatedAt": batch["created_at"], "requestedDate": requested_date, "tradeDate": trade_date,
                "engineSha256": fingerprint, "engine": "StockStrategyReportBuilder", "adjustment": "qfq",
                "maPrecision": 2, "volumeUnit": "shares", "excludeST": args.exclude_st,
                "universeCount": batch["universe_count"], "analyzedCount": len(results), "excludedCount": len(excluded),
                "exclusionCounts": dict(Counter(record["reason"] for record in excluded.values())),
                "uptrendCount": sum(record["strategyReport"]["trendStep"]["conclusion"] == "UP" for record in results.values()),
                "matchedStocks": len(matched), "matchedSTStocks": sum(record["isST"] for record in matched),
                "signalCounts": {key: signal_counts[key] for key in SIGNALS}, "outputDirectory": str(output)}
            publish(output, report, {**excluded, **results})
    atomic_text(output_root / "latest.json", json.dumps(report, ensure_ascii=False, indent=2))
    emit("screen_end", **report)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        emit("fatal", error_type=type(exc).__name__, message=str(exc)[:500])
        raise SystemExit(1)
