const STOCK_ANALYZER_SESSION_KEY = 'stock-analyzer:last-result'

function saveAnalysisSession(storage, stockCode, result, savedAt = Date.now()) {
  try {
    storage.setItem(STOCK_ANALYZER_SESSION_KEY, JSON.stringify({
      stockCode,
      result,
      savedAt
    }))
    return true
  } catch (error) {
    return false
  }
}

function loadAnalysisSession(storage) {
  try {
    const value = storage.getItem(STOCK_ANALYZER_SESSION_KEY)
    if (value === null) {
      return null
    }

    const cached = JSON.parse(value)
    if (
      !cached ||
      typeof cached !== 'object' ||
      typeof cached.stockCode !== 'string' ||
      !cached.stockCode.trim() ||
      !cached.result ||
      typeof cached.result !== 'object' ||
      Array.isArray(cached.result) ||
      !cached.result.stock ||
      typeof cached.result.stock !== 'object' ||
      Array.isArray(cached.result.stock) ||
      typeof cached.savedAt !== 'number' ||
      !Number.isFinite(cached.savedAt) ||
      !Number.isInteger(cached.savedAt) ||
      cached.savedAt <= 0
    ) {
      return null
    }

    return cached
  } catch (error) {
    return null
  }
}

module.exports = {
  STOCK_ANALYZER_SESSION_KEY,
  saveAnalysisSession,
  loadAnalysisSession
}
