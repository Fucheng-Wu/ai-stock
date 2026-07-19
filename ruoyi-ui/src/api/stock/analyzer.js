import request from '@/utils/request'

export function analyzeStock(data) {
  return request({
    url: '/stock/analyzer/analyze',
    method: 'post',
    data: data
  })
}
