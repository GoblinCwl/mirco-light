import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {publishContentSnapshot} from './contentSnapshot'
import type {GlobalConfiguration} from '../cfg'
import type {ProcessedContent} from '../plugins/vfile'

test('successful article snapshot preserves original paths and excludes unlisted/private bodies',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'quartz-content-snapshot-')),previous=process.env.QUARTZ_JOURNAL_DIR
 process.env.QUARTZ_JOURNAL_DIR=directory
 const item=(path:string,slug:string,passphrase?:string)=>[{}, {data:{relativePath:path,slug,links:['Repo/CwlWeb','Video/BV1ua4W6XEJd','Share/分享/未同步项目','Work/hidden','Share/空间/secret','Unknown/missing'],text:'private text',description:'private summary',frontmatter:{title:'标题',tags:['标签'],passphrase},dates:{created:new Date('2026-11-10T00:00:00Z'),modified:new Date('2026-11-10T00:00:00Z')}}}] as unknown as ProcessedContent
 try{
  await publishContentSnapshot([item('Study/HTTP Client/note.md','Study/HTTP-Client/note','secret'),item('Work/hidden.md','Work/hidden')],{unlistedPatterns:['Work/**'],passProtected:{enabled:true},defaultDateType:'modified'} as GlobalConfiguration)
  const value=JSON.parse(await readFile(join(directory,'articles-index.json'),'utf8'))
  assert.equal(value.articles.length,1);assert.equal(value.articles[0].extra.filePath,'Study/HTTP Client/note.md')
  assert.equal(value.articles[0].content,'');assert.equal(value.articles[0].description,'')
  assert.equal(value.permissions.length,2)
  assert.deepEqual(value.articles[0].links,['Repo/CwlWeb','Video/BV1ua4W6XEJd','Share/分享/未同步项目'])
 }finally{if(previous===undefined)delete process.env.QUARTZ_JOURNAL_DIR;else process.env.QUARTZ_JOURNAL_DIR=previous;await rm(directory,{recursive:true,force:true})}
})
