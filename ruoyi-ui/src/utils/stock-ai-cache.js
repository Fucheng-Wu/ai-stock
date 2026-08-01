export function hasAiAnalysis(result) {
  return Boolean(result && result.aiAdvice)
}

export function hasSameKline(previous, current) {
  const previousKline = previous && Array.isArray(previous.klineData) ? previous.klineData : []
  const currentKline = current && Array.isArray(current.klineData) ? current.klineData : []
  if (!previousKline.length || previousKline.length !== currentKline.length) return false
  return JSON.stringify(previousKline) === JSON.stringify(currentKline)
}

export function reuseAiAnalysis(current, previous) {
  return Object.assign({}, current, {
    aiAdvice: previous.aiAdvice,
    aiReason: previous.aiReason,
    riskLevel: previous.riskLevel
  })
}
