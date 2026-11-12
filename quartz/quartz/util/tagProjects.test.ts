import {test} from 'node:test'
import assert from 'node:assert/strict'
import {tagProjects} from './tagProjects'
test('a constellation includes all four project types and child tags, ordered by current date without duplicates',()=>{
 const pages=[
  {id:'article',type:'article',title:'文章',tags:['技术/网络'],updatedAt:'2026-11-01T00:00:00Z'},
  {id:'video',type:'video',title:'视频',tags:['技术'],updatedAt:'2026-11-03T00:00:00Z'},
  {id:'repo',type:'repo',title:'仓库',tags:['技术/Go'],createdAt:'2026-11-04T00:00:00Z'},
  {id:'share',type:'share',title:'加密分享',tags:['技术'],updatedAt:'2026-11-02T00:00:00Z'},
  {id:'unrelated',title:'其他',tags:['日常']},
 ]
 assert.deepEqual(tagProjects([...pages,pages[0]],'技术').map(p=>p.id),['repo','video','share','article'])
 assert.deepEqual(tagProjects(pages,'技术/Go').map(p=>p.id),['repo'])
 assert.equal(tagProjects(pages,'不存在').length,0)
 assert.equal(pages[0].id,'article')
})
