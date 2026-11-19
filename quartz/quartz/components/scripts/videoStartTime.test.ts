import {test} from 'node:test'
import assert from 'node:assert/strict'
import {videoStartTime} from './videoStartTime'
test('video link positions accept seconds and clock values, including explicit zero',()=>{
 for(const [value,expected] of [['90',90],['1.5',1.5],['01:30',90],['1:02:03',3723],['0',0]] as const)
  assert.equal(videoStartTime(new URL('https://site.test/Share/file?t='+value)),expected)
 for(const value of ['', '-1','Infinity','abc','1:99','1:2','1e3'])
  assert.equal(videoStartTime(new URL('https://site.test/Share/file?t='+value)),undefined)
})
