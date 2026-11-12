import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readingOpening,readingDestination} from './readingView'

test('reading excerpts display prose instead of markdown formatting',()=>{
 assert.equal(readingOpening('# 标题\n\n**正文** [链接](https://example.com) ![图片](a.png)\n```js\nsecret code\n```'),'标题 正文 链接')
})
test('reading links stay within the site and preserve content routes',()=>{
 assert.equal(readingDestination('/Memo/hello?a=1#section'),'/Memo/hello?a=1#section')
 for(const href of ['javascript:alert(1)','//evil.example','https://evil.example','/\\evil.example'])assert.equal(readingDestination(href),'#')
})

test('reading folder links retain the parent path and decode folder labels',async()=>{
 const {readingFolder}=await import('./readingView')
 assert.deepEqual(readingFolder('/Memo/HTTP%20Client/note'),{label:'Memo / HTTP Client',href:'/Memo/HTTP%20Client/'})
 assert.deepEqual(readingFolder('/Repo/project/?ref=main'),{label:'Repo',href:'/Repo/'})
 assert.deepEqual(readingFolder('/note'),{label:'首页',href:'/'})
 assert.equal(readingFolder('https://evil.example/note'),null)
})

test('reading block spans round up to contain content and its inter-block spacing',async()=>{
 const {readingGridSpan}=await import('./readingView')
 for(const height of [190,320,401.5,570])for(const gap of [12,16]){
  const span=readingGridSpan(height,8,gap)
  assert.ok(span*8+(span-1)*gap>=height)
  assert.ok((span-1)*8+(span-2)*gap<height)
 }
})

test('upstream truncation keeps an ellipsis even after Markdown removal shortens the preview',async()=>{
 const {readingPreview}=await import('./readingView')
 assert.equal(readingPreview('a'.repeat(400),true),'a'.repeat(400)+'…')
 const markdown='**'+ '文'.repeat(396)+'**'
 assert.equal(readingPreview(markdown,true),'文'.repeat(396)+'…')
 assert.equal(readingPreview('完整短文。'),'完整短文。')
 assert.equal(readingPreview('文'.repeat(2400)),'文'.repeat(2400)+'…')
 assert.equal(readingPreview('文'.repeat(400),false),'文'.repeat(400))
 assert.equal(readingPreview('文'.repeat(399)+'…'),'文'.repeat(399)+'…')
 assert.equal(readingPreview(''),'')
})

test('body line budgets consume free card space without overrunning the footer',async()=>{
 const {readingFillLineCount}=await import('./readingView')
 assert.equal(readingFillLineCount(300,30),10)
 assert.equal(readingFillLineCount(319,30),10)
 assert.equal(readingFillLineCount(30*4+180,30),10)
 assert.equal(readingFillLineCount(120,0),0)
})
