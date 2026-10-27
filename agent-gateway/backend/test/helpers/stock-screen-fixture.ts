import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeScreenFixture(root: string, hash = "a", tradeDate = "2026-10-26") {
  const id = `2025-10-27_2026-10-26_${tradeDate}_${hash.repeat(10)}_all`;
  const make = (symbol: string, name: string, signals: string[], isST = false) => ({
    symbol, name, exchange: symbol.slice(0, 2), isST, status: "analyzed", tradeDate,
    rawClose: 10, qfqClose: 10, ma5: 10, ma20: 9.9, ma20Prev: 9.8, ma20ChangePct: 1, distanceMa20Pct: 1, volumeShares: 10000,
    signals, strategyReport: { trendStep: { code: "TREND_MA20", status: "SATISFIED", conclusion: "UP" },
      buyPointStep: { items: ["BUY_GOLDEN_CROSS", "BUY_RETRACE", "BUY_CONVERGENCE"].map(code => ({
        code, status: signals.includes(code) ? "SATISFIED" : "NOT_SATISFIED", reason: "fixture evidence", evidence: [{ label: "MA20", value: 9.9 }],
      })) } },
  });
  const records = [make("bj920000", "北交样本", ["BUY_RETRACE"]), make("sh600519", "沪市样本", ["BUY_GOLDEN_CROSS", "BUY_CONVERGENCE"]),
    make("sz000001", "*ST样本", ["BUY_GOLDEN_CROSS"], true), make("sz000002", "未命中样本", []),
    { symbol: "sz000003", name: "数据过旧样本", exchange: "sz", isST: false, status: "excluded", tradeDate, lastDate: "2026-10-23", reason: "STALE_OR_MISSING_DATA" }];
  const candidates = records.filter(row => "signals" in row && row.signals!.length);
  const report = { snapshotId: id, state: "complete", createdAt: `${tradeDate}T18:00:00+08:00`, tradeDate, batchId: "fixture",
    engineSha256: hash.repeat(64), adjustment: "qfq", maPrecision: 2, volumeUnit: "shares", excludeST: false,
    universeCount: 5, analyzedCount: 4, excludedCount: 1, matchedStocks: 3, matchedSTStocks: 1, uptrendCount: 4,
    exclusionCounts: { STALE_OR_MISSING_DATA: 1 }, signalCounts: { BUY_GOLDEN_CROSS: 2, BUY_RETRACE: 1, BUY_CONVERGENCE: 1 },
    database: "PRIVATE_DATABASE_PATH", outputDirectory: "PRIVATE_OUTPUT_PATH" };
  const directory = join(root, id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "report.json"), JSON.stringify(report));
  await writeFile(join(directory, "candidates.json"), JSON.stringify(candidates));
  await writeFile(join(directory, "analysis.jsonl"), records.map(row => JSON.stringify(row)).join("\n") + "\n");
  await writeFile(join(root, "latest.json"), JSON.stringify(report));
  return { id, directory, report, records, candidates };
}
