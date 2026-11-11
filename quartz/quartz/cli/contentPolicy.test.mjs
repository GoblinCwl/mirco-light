import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parsePatterns,normalizePolicy,defaultIgnorePatterns} from './contentPolicy.mjs'
test('glob settings preserve syntax and normalize lines',()=>{
 assert.deepEqual(parsePatterns(' Work/**\r\n**/!(*.md)\nWork/**\n'),['Work/**','**/!(*.md)'])
 assert.deepEqual(normalizePolicy({ignorePatterns:defaultIgnorePatterns.join('\n'),unlistedPatterns:''}).unlistedPatterns,[])
})
test('reject invalid policy paths and overlarge input',()=>{
 for(const value of ['/etc/**','../**','notes/../**','!Work/**','Work\\**','Work/\0','x'.repeat(16001)])assert.throws(()=>parsePatterns(value))
 assert.throws(()=>normalizePolicy({ignorePatterns:[],unlistedPatterns:''}))
})
