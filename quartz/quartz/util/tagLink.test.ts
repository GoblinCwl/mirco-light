import {test} from 'node:test'
import assert from 'node:assert/strict'
import {tagHref} from './tagLink'
test('tag deep links preserve nested and punctuation names as one query value',()=>{
 for(const tag of ['技术/网络','Yu-Gi-Oh!','C++','A&B # 标记','日本語']){
  const url=new URL(tagHref(tag),'https://example.com')
  assert.equal(url.pathname,'/tags/')
  assert.equal(url.searchParams.get('tag'),tag)
  assert.equal(url.hash,'')
 }
})
