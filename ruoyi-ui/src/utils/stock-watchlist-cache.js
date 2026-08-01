const WATCHLIST_ANALYSIS_CACHE_KEY = 'stock-watchlist:analysis-results'
const WATCHLIST_ANALYSIS_CACHE_TTL = 5 * 60 * 1000

function normalizeStockCode(stockCode) {
  return String(stockCode || '').trim().toLowerCase()
}

function readCache(storage) {
  try {
    const value = storage.getItem(WATCHLIST_ANALYSIS_CACHE_KEY)
    if (!value) return {}
    const cache = JSON.parse(value)
    return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {}
  } catch (error) {
    return {}
  }
}

function writeCache(storage, cache) {
  try {
    storage.setItem(WATCHLIST_ANALYSIS_CACHE_KEY, JSON.stringify(cache))
    return true
  } catch (error) {
    return false
  }
}

function saveWatchlistAnalysisCache(storage, stockCode, result, savedAt = Date.now()) {
  const code = normalizeStockCode(stockCode)
  if (!code || !result || typeof result !== 'object' || Array.isArray(result)) return false
  const cache = readCache(storage)
  cache[code] = { result, savedAt }
  return writeCache(storage, cache)
}

function removeWatchlistAnalysisCache(storage, stockCode) {
  const code = normalizeStockCode(stockCode)
  if (!code) return false
  const cache = readCache(storage)
  if (!Object.prototype.hasOwnProperty.call(cache, code)) return true
  delete cache[code]
  return writeCache(storage, cache)
}

function loadWatchlistAnalysisCache(
  storage,
  stockCode,
  now = Date.now(),
  ttl = WATCHLIST_ANALYSIS_CACHE_TTL
) {
  const code = normalizeStockCode(stockCode)
  if (!code) return null
  const cache = readCache(storage)
  const entry = cache[code]
  const valid = entry &&
    typeof entry === 'object' &&
    entry.result &&
    typeof entry.result === 'object' &&
    !Array.isArray(entry.result) &&
    typeof entry.savedAt === 'number' &&
    Number.isFinite(entry.savedAt) &&
    entry.savedAt > 0

  if (!valid || now - entry.savedAt >= ttl) {
    if (entry) {
      delete cache[code]
      writeCache(storage, cache)
    }
    return null
  }
  return entry
}

module.exports = {
  WATCHLIST_ANALYSIS_CACHE_KEY,
  WATCHLIST_ANALYSIS_CACHE_TTL,
  saveWatchlistAnalysisCache,
  loadWatchlistAnalysisCache,
  removeWatchlistAnalysisCache
}
