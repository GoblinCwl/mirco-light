import {test} from 'node:test'
import assert from 'node:assert/strict'
import {formatDateWithSeconds,formatDirectoryDate} from './formatDate'
test('static and API page dates use Shanghai time across the UTC day boundary',()=>{
 const date=new Date('2026-11-08T16:05:07Z')
 assert.equal(formatDateWithSeconds(date,'zh-CN',true),'2026年11月9日 00:05:07')
 assert.equal(formatDateWithSeconds(date,'zh-CN'),'2026年11月9日')
 assert.equal(formatDirectoryDate(date),'2026/11/09')
})
