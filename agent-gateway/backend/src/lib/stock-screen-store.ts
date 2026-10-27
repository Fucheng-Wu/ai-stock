import { createReadStream } from "node:fs";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const SNAPSHOT_ID = /^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}-[0-9]{2}-[0-9]{2}_[a-f0-9]{10}_(?:all|no-st)$/;
export const SCREEN_SIGNALS = ["BUY_GOLDEN_CROSS", "BUY_RETRACE", "BUY_CONVERGENCE"] as const;
type Signal = typeof SCREEN_SIGNALS[number];
type Exchange = "sh" | "sz" | "bj";
export interface ScreenSelection { snapshotId?: string; tradeDate?: string }
export interface ScreenQuery extends ScreenSelection {
  signal?: "ALL" | "GOLDEN_CROSS" | "RETRACE" | "CONVERGENCE";
  exchange?: "ALL" | Exchange;
  keyword?: string;
  excludeST?: boolean;
  page?: number;
  pageSize?: number;
}
interface Judgment { code: string; status: string; conclusion?: string; [key: string]: unknown }
export interface ScreenRecord {
  symbol: string; name: string; exchange: Exchange; tradeDate: string; isST: boolean;
  status: "analyzed" | "excluded"; signals?: Signal[];
  strategyReport?: { trendStep: Judgment; buyPointStep: { items: Judgment[] }; [key: string]: unknown };
  [key: string]: unknown;
}
interface ScreenReport {
  snapshotId: string; state: string; createdAt: string; tradeDate: string; batchId: string;
  engineSha256: string; adjustment: string; maPrecision: number; volumeUnit: string;
  universeCount: number; analyzedCount: number; excludedCount: number;
  matchedStocks: number; matchedSTStocks: number; uptrendCount: number;
  exclusionCounts: Record<string, number>; signalCounts: Record<string, number>;
  excludeST: boolean;
}
interface Snapshot { directory: string; report: ScreenReport; candidates: ScreenRecord[] }

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function inside(root: string, candidate: string): boolean {
  const suffix = relative(root, candidate);
  return suffix !== "" && suffix !== ".." && !suffix.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(suffix);
}
function validateRecord(value: unknown, report: ScreenReport): asserts value is ScreenRecord {
  if (!object(value) || typeof value.symbol !== "string" || !/^(?:sh6\d{5}|sz[03]\d{5}|bj\d{6})$/.test(value.symbol)
      || typeof value.name !== "string" || value.name.length > 80 || value.exchange !== value.symbol.slice(0, 2)
      || value.tradeDate !== report.tradeDate || typeof value.isST !== "boolean"
      || !["analyzed", "excluded"].includes(String(value.status))) throw new Error("筛选明细格式无效。");
  if (value.status === "analyzed") {
    if (!Array.isArray(value.signals) || new Set(value.signals).size !== value.signals.length
        || value.signals.some(signal => !SCREEN_SIGNALS.includes(signal as Signal))
        || !object(value.strategyReport) || !object(value.strategyReport.trendStep)
        || !object(value.strategyReport.buyPointStep) || !Array.isArray(value.strategyReport.buyPointStep.items)) {
      throw new Error("筛选规则证据无效。");
    }
    const signals = value.signals;
    const hits = value.strategyReport.buyPointStep.items.filter((rule: unknown) => object(rule) && rule.status === "SATISFIED") as Judgment[];
    if ((signals.length > 0 && value.strategyReport.trendStep.conclusion !== "UP")
        || hits.length !== signals.length || hits.some(rule => !signals.includes(rule.code))) {
      throw new Error("筛选买点与规则证据不一致。");
    }
    for (const key of ["rawClose", "qfqClose", "ma5", "ma20", "ma20ChangePct", "distanceMa20Pct", "volumeShares"]) {
      if (typeof value[key] !== "number" || !Number.isFinite(value[key])) throw new Error("筛选行情数值无效。");
    }
  } else if (typeof value.reason !== "string") throw new Error("缺少筛选排除原因。");
}

/** Server-only fixed snapshot reader. Model arguments can never specify a filesystem path. */
export class StockScreenStore {
  private readonly root: string;
  private readonly cache = new Map<string, { signature: string; value: Snapshot }>();
  constructor(directory = process.env.STOCK_SCREEN_DATA_DIR || resolve(dirname(fileURLToPath(import.meta.url)), "../../../../data/stock-history/screens")) {
    this.root = resolve(directory);
  }

  private async child(root: string, name: string): Promise<string> {
    const canonicalRoot = await realpath(root);
    const target = await realpath(join(canonicalRoot, name));
    if (!inside(canonicalRoot, target)) throw new Error("筛选数据超出允许范围。");
    return target;
  }
  private async json(path: string, maximum: number, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const information = await stat(path);
    if (!information.isFile() || information.size > maximum) throw new Error("筛选数据大小无效。");
    return JSON.parse(await readFile(path, { encoding: "utf8", signal }));
  }

  private validateReport(value: unknown, id: string): asserts value is ScreenReport {
    if (!object(value) || value.snapshotId !== id || value.state !== "complete" || !validDate(value.tradeDate)
        || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))
        || typeof value.engineSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.engineSha256)
        || value.adjustment !== "qfq" || value.volumeUnit !== "shares" || value.maPrecision !== 2
        || typeof value.excludeST !== "boolean" || typeof value.batchId !== "string") throw new Error("筛选快照元数据无效。");
    for (const key of ["universeCount", "analyzedCount", "excludedCount", "matchedStocks", "matchedSTStocks", "uptrendCount"]) {
      if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0 || Number(value[key]) > 20000) throw new Error("筛选覆盖数量无效。");
    }
    if (Number(value.analyzedCount) + Number(value.excludedCount) !== value.universeCount
        || Number(value.matchedStocks) > Number(value.analyzedCount) || !object(value.signalCounts)
        || !object(value.exclusionCounts)) throw new Error("筛选覆盖数量不一致。");
    const exclusions = Object.values(value.exclusionCounts);
    if (exclusions.some(count => !Number.isSafeInteger(count) || Number(count) < 0)
        || exclusions.reduce<number>((sum, count) => sum + Number(count), 0) !== value.excludedCount
        || Number(value.uptrendCount) > Number(value.analyzedCount)
        || Number(value.matchedSTStocks) > Number(value.matchedStocks)) throw new Error("筛选覆盖统计无效。");
  }

  private async selectedId(selection: ScreenSelection, signal?: AbortSignal): Promise<string> {
    if (selection.tradeDate !== undefined && !validDate(selection.tradeDate)) throw new Error("行情日期必须为有效的 YYYY-MM-DD。");
    if (selection.snapshotId !== undefined) {
      if (!SNAPSHOT_ID.test(selection.snapshotId)) throw new Error("snapshotId 格式无效。");
      return selection.snapshotId;
    }
    const latest = await this.json(await this.child(this.root, "latest.json"), 65536, signal);
    if (!object(latest) || typeof latest.snapshotId !== "string" || !SNAPSHOT_ID.test(latest.snapshotId)) {
      throw new Error("筛选数据需要更新，请先重新运行本地筛选脚本。");
    }
    if (!selection.tradeDate || latest.tradeDate === selection.tradeDate) return latest.snapshotId;
    // Selecting a historical business date never accepts arbitrary paths from a model.
    const available = await readdir(this.root, { withFileTypes: true });
    const reports: ScreenReport[] = [];
    for (const entry of available) {
      signal?.throwIfAborted();
      if (!entry.isDirectory() || !SNAPSHOT_ID.test(entry.name) || !entry.name.includes(`_${selection.tradeDate}_`)) continue;
      const directory = await this.child(this.root, entry.name);
      const report = await this.json(await this.child(directory, "report.json"), 65536, signal);
      this.validateReport(report, entry.name);
      if (report.tradeDate === selection.tradeDate) reports.push(report);
    }
    reports.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    if (!reports.length) throw new Error(`没有 ${selection.tradeDate} 的已完成筛选快照；最新快照行情日期为 ${String(latest.tradeDate)}。不能用旧数据冒充指定日期。`);
    return reports[0].snapshotId;
  }

  private async load(selection: ScreenSelection, signal?: AbortSignal): Promise<Snapshot> {
    try {
      const id = await this.selectedId(selection, signal);
      const directory = await this.child(this.root, id);
      const reportPath = await this.child(directory, "report.json");
      const candidatesPath = await this.child(directory, "candidates.json");
      const [reportStat, candidateStat] = await Promise.all([stat(reportPath), stat(candidatesPath)]);
      const signature = `${reportStat.mtimeMs}:${reportStat.size}:${candidateStat.mtimeMs}:${candidateStat.size}`;
      let snapshot = this.cache.get(id)?.signature === signature ? this.cache.get(id)!.value : undefined;
      if (!snapshot) {
        const report = await this.json(reportPath, 65536, signal);
        this.validateReport(report, id);
        const records = await this.json(candidatesPath, 64 * 1024 * 1024, signal);
        if (!Array.isArray(records) || records.length !== report.matchedStocks) throw new Error("筛选候选数量不一致。");
        const symbols = new Set<string>();
        const signalCounts = Object.fromEntries(SCREEN_SIGNALS.map(code => [code, 0]));
        for (const record of records) {
          validateRecord(record, report);
          if (!record.signals?.length || symbols.has(record.symbol)) throw new Error("筛选候选重复或未命中规则。");
          symbols.add(record.symbol);
          for (const code of record.signals) signalCounts[code]++;
        }
        if (SCREEN_SIGNALS.some(code => signalCounts[code] !== report.signalCounts[code])) throw new Error("筛选买点统计不一致。");
        if (records.filter(record => record.isST).length !== report.matchedSTStocks) throw new Error("筛选ST统计不一致。");
        snapshot = { directory, report, candidates: records as ScreenRecord[] };
        if (this.cache.size >= 3) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(id, { signature, value: snapshot });
      }
      if (selection.tradeDate && snapshot.report.tradeDate !== selection.tradeDate) throw new Error("snapshotId 与指定行情日期不一致。");
      signal?.throwIfAborted();
      return snapshot;
    } catch (error) {
      if (signal?.aborted) throw new Error("筛选查询已取消。");
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        throw new Error("筛选数据尚未准备好，请先在网关所在机器运行筛选脚本或配置 STOCK_SCREEN_DATA_DIR。");
      }
      if (error instanceof SyntaxError) throw new Error("筛选数据格式损坏，不能据此判断买点。");
      if ((error as NodeJS.ErrnoException).code) throw new Error("无法读取筛选数据，请检查服务端数据配置。");
      throw error;
    }
  }

  private metadata(snapshot: Snapshot) {
    const report = snapshot.report;
    // Deliberately omit database/output paths and all server configuration.
    return {
      snapshotId: report.snapshotId, tradeDate: report.tradeDate, generatedAt: report.createdAt,
      source: "新浪A股清单、腾讯前复权日线；工作台Java 520规则引擎",
      isRealtime: false, adjustment: report.adjustment, maPrecision: report.maPrecision, volumeUnit: report.volumeUnit,
      snapshotExcludesST: report.excludeST,
      coverage: { universe: report.universeCount, analyzed: report.analyzedCount, excluded: report.excludedCount,
        exclusions: report.exclusionCounts, uptrend: report.uptrendCount, matched: report.matchedStocks,
        matchedST: report.matchedSTStocks, signals: report.signalCounts },
      note: "结果仅对应所标注交易日的日线快照，不代表今天盘中仍符合买点；按代码排序，不代表收益或胜率。",
    };
  }

  async query(query: ScreenQuery = {}, signal?: AbortSignal) {
    const page = query.page ?? 1, pageSize = query.pageSize ?? 10;
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      throw new Error("page 必须为1到10000，pageSize 必须为1到50的整数。");
    }
    if (query.signal !== undefined && !["ALL", "GOLDEN_CROSS", "RETRACE", "CONVERGENCE"].includes(query.signal)) throw new Error("不支持的买点类型。");
    if (query.exchange !== undefined && !["ALL", "sh", "sz", "bj"].includes(query.exchange)) throw new Error("不支持的交易所。");
    if (query.excludeST !== undefined && typeof query.excludeST !== "boolean") throw new Error("excludeST 必须为布尔值。");
    if (query.keyword !== undefined && (typeof query.keyword !== "string" || !query.keyword.trim() || query.keyword.length > 40)) throw new Error("keyword 必须为1到40个字符。");
    const snapshot = await this.load(query, signal);
    const keyword = query.keyword?.trim().toLowerCase();
    const filtered = snapshot.candidates.filter(row => (!query.signal || query.signal === "ALL" || row.signals!.includes(`BUY_${query.signal}` as Signal))
      && (!query.exchange || query.exchange === "ALL" || row.exchange === query.exchange)
      && (!query.excludeST || !row.isST)
      && (!keyword || row.symbol.includes(keyword) || row.name.toLowerCase().includes(keyword)))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
    const rows = filtered.slice((page - 1) * pageSize, page * pageSize).map(record => ({
      stockCode: record.symbol, name: record.name, exchange: record.exchange, isST: record.isST, signals: record.signals,
      rawClose: record.rawClose, qfqClose: record.qfqClose, ma5: record.ma5, ma20: record.ma20,
      ma20ChangePct: record.ma20ChangePct, distanceMa20Pct: record.distanceMa20Pct, volumeShares: record.volumeShares,
    }));
    return { ...this.metadata(snapshot), filters: { signal: query.signal ?? "ALL", exchange: query.exchange ?? "ALL",
      excludeST: query.excludeST ?? false, keyword: query.keyword?.trim() ?? "" },
      total: filtered.length, page, pageSize, hasNextPage: page * pageSize < filtered.length, rows };
  }

  async detail(stockCode: string, selection: ScreenSelection = {}, signal?: AbortSignal) {
    if (typeof stockCode !== "string" || !/^(?:(?:sh|sz|bj))?\d{6}$/i.test(stockCode.trim())) throw new Error("请提供六位A股代码或sh/sz/bj前缀代码。");
    const code = stockCode.trim().toLowerCase();
    const snapshot = await this.load(selection, signal);
    const matches = (record: ScreenRecord) => record.symbol === code || record.symbol.slice(2) === code;
    let records = snapshot.candidates.filter(matches);
    // Prefixed candidate IDs are unique. Plain codes and noncandidates resolve against the full saved universe.
    if (!(code.length === 8 && records.length === 1)) {
      records = [];
      let input;
      let lines;
      try {
        const path = await this.child(snapshot.directory, "analysis.jsonl");
        if ((await stat(path)).size > 512 * 1024 * 1024) throw new Error("筛选明细大小无效。");
        input = createReadStream(path, { encoding: "utf8", signal });
        lines = createInterface({ input, crlfDelay: Infinity });
        for await (const line of lines) {
          signal?.throwIfAborted();
          if (line.length > 262144) throw new Error("筛选明细记录过大。");
          const record: unknown = JSON.parse(line);
          if (!object(record) || typeof record.symbol !== "string") throw new Error("筛选明细格式无效。");
          if (record.symbol !== code && record.symbol.slice(2) !== code) continue;
          validateRecord(record, snapshot.report);
          records.push(record);
        }
      } catch (error) {
        if (signal?.aborted) throw new Error("筛选查询已取消。");
        if (error instanceof SyntaxError) throw new Error("筛选明细格式损坏。");
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("该快照的完整筛选明细尚未准备好。");
        if ((error as NodeJS.ErrnoException).code) throw new Error("无法读取筛选明细，请检查服务端数据配置。");
        throw error;
      } finally {
        lines?.close();
        input?.destroy();
      }
    }
    if (records.length > 1) return { ...this.metadata(snapshot), found: false, requiresSelection: true,
      matches: records.map(row => ({ stockCode: row.symbol, name: row.name })) };
    const record = records[0];
    return { ...this.metadata(snapshot), found: !!record, requiresSelection: false, stockCode: code,
      record: record ?? null, reason: record ? undefined : "该代码不在这份快照的股票范围中，不能据此判断是否符合买点。" };
  }
}
