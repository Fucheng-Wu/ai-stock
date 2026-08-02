import request from '@/utils/request'

export const listWatchlist = () => request({ url: '/stock/watchlist/list', method: 'get' })
export const addWatchlist = data => request({ url: '/stock/watchlist', method: 'post', data })
export const removeWatchlist = id => request({ url: `/stock/watchlist/${id}`, method: 'delete' })
export const getWatchlistAnalysis = id => request({ url: `/stock/watchlist/${id}/analysis`, method: 'get' })
export const analyzeWatchlist = (id, includeAi) => request({
  url: `/stock/watchlist/${id}/analyze`,
  method: 'post',
  data: { includeAi }
})
