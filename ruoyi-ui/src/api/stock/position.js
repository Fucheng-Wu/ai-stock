import request from '@/utils/request'
export const listPosition=()=>request({url:'/stock/position/list',method:'get'})
export const addPosition=data=>request({url:'/stock/position',method:'post',data})
export const updatePosition=data=>request({url:'/stock/position',method:'put',data})
export const account=()=>request({url:'/stock/position/account',method:'get'})
export const saveAccount=data=>request({url:'/stock/position/account',method:'post',data})
export const analyzePosition=(id,includeAi)=>request({url:`/stock/position/${id}/analyze`,method:'post',data:{includeAi}})
