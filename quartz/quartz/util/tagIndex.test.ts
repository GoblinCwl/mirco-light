import {test} from 'node:test'
import assert from 'node:assert/strict'
import {collectTagStats,renderTagIndex} from './tagIndex'
test('counts each page once per tag and parent, including merged Drive shares',()=>{
 const notes=collectTagStats([{tags:['技术/部署','技术/脚本','技术/部署']},{tags:['技术']},{tags:[]}])
 assert.equal(notes.pageCount,2)
 assert.equal(notes.counts.find(item=>item.tag==='技术')?.count,2)
 const merged=collectTagStats([{tags:['技术/部署','影视']}],notes)
 assert.equal(merged.pageCount,3)
 assert.equal(merged.counts.find(item=>item.tag==='技术')?.count,3)
 assert.equal(merged.counts.find(item=>item.tag==='技术/部署')?.count,2)
 assert.equal(notes.counts.find(item=>item.tag==='技术')?.count,2)
 assert.deepEqual(collectTagStats([{tags:['技术/部署','影视']}],notes),merged)
})
test('distribution is sorted, capped at ten, links and labels are escaped',()=>{
 const stats=collectTagStats(Array.from({length:12},(_,i)=>({tags:[`标签${i}`]})).concat([{tags:['标签11','<script>"&']}]))
 const html=renderTagIndex(stats)
 assert.equal((html.match(/class="internal tag-ranking-link"/g)||[]).length,10)
 assert.ok(html.indexOf('标签11</span>')<html.indexOf('标签0</span>'))
 assert.ok(html.includes('&lt;script&gt;&quot;&amp;'))
 assert.ok(!html.includes('<script>'))
 assert.ok(html.includes('/tags/%3Cscript%3E%22%26/'))
 assert.ok(html.includes('width:100%'))
 assert.ok(html.includes('<h2>标签分布</h2>'))
 assert.ok(!html.includes('<details'))
})
test('empty index has no meaningless ranking',()=>{
 const html=renderTagIndex(collectTagStats([]))
 assert.ok(html.includes('暂无标签'))
 assert.ok(!html.includes('TOP'))
})
