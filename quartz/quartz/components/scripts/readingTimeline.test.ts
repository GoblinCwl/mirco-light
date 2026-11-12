import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readingMonth,readingYears} from './readingTimeline'
test('reading months use Beijing calendar boundaries',()=>{
 assert.equal(readingMonth('2026-12-31T16:00:00Z'),'2027-01')
 assert.equal(readingMonth('2026-10-31T15:59:59Z'),'2026-10')
 assert.equal(readingMonth('invalid'),null)
})
test('timeline groups unique months by descending year and month',()=>{
 assert.deepEqual(readingYears(['2026-02','2025-12','2026-11','2026-02','2026-99']),[{year:'2026',months:['2026-11','2026-02']},{year:'2025',months:['2025-12']}])
})
