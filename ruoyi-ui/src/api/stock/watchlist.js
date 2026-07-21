import request from '@/utils/request'

export const listWatchlist = () => request({ url: '/stock/watchlist/list', method: 'get' })
export const addWatchlist = data => request({ url: '/stock/watchlist', method: 'post', data })
export const removeWatchlist = id => request({ url: `/stock/watchlist/${id}`, method: 'delete' })
