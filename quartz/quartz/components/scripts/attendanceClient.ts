import type {AttendanceDetail} from './attendanceDetails'
import {RequestCache,sharedState} from './sharedRequest'
export type AttendanceMonth={month:string;records:AttendanceDetail[];earliest:string;latest:string;stale:boolean;updatedAt:string}
const state=sharedState('attendance-months:v2',()=>({months:new RequestCache<AttendanceMonth>(60000,24),requests:new RequestCache<AttendanceMonth>(60000,24)}))
export function peekAttendanceMonth(month:string){return state.months.peek(month,true)}
export function readAttendanceMonth(month:string,signal?:AbortSignal){
 if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month))return Promise.reject(Error('无效的星历月份'))
 const cached=state.months.peek(month)
 if(cached)return Promise.resolve(cached)
 return state.requests.read(month,async requestSignal=>{
  const response=await fetch('/api/attendance?'+new URLSearchParams({month}),{signal:AbortSignal.any([requestSignal,AbortSignal.timeout(15000)]),cache:'no-cache'})
  if(!response.ok)throw Error('星历数据暂时不可用')
  const value=await response.json() as AttendanceMonth & {months:AttendanceMonth[]}
  if(value.month!==month||!Array.isArray(value.months)||value.months.length!==3)throw Error('星历月份数据无效')
  const [year,number]=month.split('-').map(Number)
  for(const [index,item] of value.months.entries()){
   const expected=new Date(Date.UTC(year,number-2+index,1)).toISOString().slice(0,7)
   if(item.month!==expected||!Array.isArray(item.records)||item.records.some(record=>typeof record.date!=='string'||!record.date.startsWith(item.month+'-')))throw Error('星历月份数据无效')
  }
  for(const item of value.months)state.months.set(item.month,item)
  return state.months.peek(month)!
 },{signal})
}
