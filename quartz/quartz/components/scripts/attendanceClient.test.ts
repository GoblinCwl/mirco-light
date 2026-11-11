import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readAttendanceMonth} from './attendanceClient'
test('calendar and details share one bounded three-month request',async context=>{
 let calls=0
 context.mock.method(globalThis,'fetch',async(input:any)=>{calls++;const month=new URL(String(input),'https://site.test').searchParams.get('month');const center=new Date(month+'-01T00:00:00Z');const months=[-1,0,1].map(offset=>{const date=new Date(center);date.setUTCMonth(date.getUTCMonth()+offset);const key=date.toISOString().slice(0,7);return {month:key,records:[{date:key+'-01',status:'work'}],earliest:'2026-07',latest:'2026-11'}});return Response.json({...months[1],months})})
 const [a,b]=await Promise.all([readAttendanceMonth('2026-10'),readAttendanceMonth('2026-10')]);assert.deepEqual(a,b);assert.equal(calls,1)
 await readAttendanceMonth('2026-11');assert.equal(calls,1)
 await readAttendanceMonth('2026-09');assert.equal(calls,1)
 await readAttendanceMonth('2026-08');assert.equal(calls,2)
 await readAttendanceMonth('2026-10');assert.equal(calls,2)
})
test('invalid months and cross-month payloads are rejected',async context=>{
 await assert.rejects(readAttendanceMonth('2026-13'))
 context.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({month:'2025-09',months:[{month:'2025-09',records:[{date:'2025-10-01'}]},{month:'2025-08',records:[]},{month:'2025-10',records:[]}]})))
 await assert.rejects(readAttendanceMonth('2025-09'),/月份数据无效/)
})
