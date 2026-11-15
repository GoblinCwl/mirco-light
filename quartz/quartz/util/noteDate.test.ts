import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNoteDate } from './noteDate'
import { formatDateWithSeconds } from './formatDate'

test('naive note dates stay in Shanghai time regardless of the build TZ', () => {
 const previous=process.env.TZ
 try {
  for(const zone of ['UTC','America/Los_Angeles','Asia/Shanghai']) {
   process.env.TZ=zone
   for(const value of ['2026-11-15 16:55:43','2026-11-15T16:55:43',' 2026-11-15 16:55:43 ']) {
    const date=parseNoteDate(value)
    assert.equal(date.toISOString(),'2026-11-15T08:55:43.000Z')
    assert.equal(formatDateWithSeconds(date,'zh-CN',true),'2026年11月15日 16:55:43')
   }
   assert.equal(parseNoteDate('2026-11-15').toISOString(),'2026-11-14T16:00:00.000Z')
   assert.equal(parseNoteDate('2026-11-15T16:55').toISOString(),'2026-11-15T08:55:00.000Z')
   assert.equal(parseNoteDate('2026-11-15T16:55:43.123').toISOString(),'2026-11-15T08:55:43.123Z')
  }
 } finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
})
test('explicit zones, Date objects and filesystem epochs keep their absolute instant',()=>{
 for(const value of ['2026-11-15T16:55:43Z','2026-11-15T16:55:43+08:00','2026-11-15T16:55:43-05:00'])assert.equal(parseNoteDate(value).getTime(),Date.parse(value))
 const date=new Date('2026-11-15T08:55:43Z')
 assert.equal(parseNoteDate(date).getTime(),date.getTime())
 assert.equal(parseNoteDate(date.getTime()).getTime(),date.getTime())
 assert.ok(Number.isNaN(parseNoteDate('bad date').getTime()))
})
