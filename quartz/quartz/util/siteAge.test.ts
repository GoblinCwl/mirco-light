import {test} from 'node:test'
import assert from 'node:assert/strict'
import {siteAgeDays} from './siteAge'
test('site age changes at Beijing midnight and includes launch day',()=>{
 assert.equal(siteAgeDays('2026-11-13',Date.parse('2026-11-12T16:00:00Z')),1)
 assert.equal(siteAgeDays('2026-11-13',Date.parse('2026-11-13T15:59:59Z')),1)
 assert.equal(siteAgeDays('2026-11-13',Date.parse('2026-11-13T16:00:00Z')),2)
 assert.equal(siteAgeDays('2024-02-28',Date.parse('2024-03-01T00:00:00Z')),3)
 for(const date of ['', '2026-02-30','2027-01-01'])assert.equal(siteAgeDays(date,Date.parse('2026-11-13T00:00:00Z')),null)
})
