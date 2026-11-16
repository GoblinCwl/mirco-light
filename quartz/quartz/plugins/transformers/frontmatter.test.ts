import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { VFile } from 'vfile'
import type { Root } from 'mdast'
import type { BuildCtx } from '../../util/ctx'
import { FrontMatter } from './frontmatter'

async function parse(metadata:string,body='## 原始标题\n\n原始正文。') {
 const ctx={cfg:{configuration:{locale:'zh-CN'}},allSlugs:[]} as unknown as BuildCtx
 const processor=unified().use(remarkParse).use(FrontMatter().markdownPlugins!(ctx))
 const file=new VFile({path:'note.md',value:`---\ntitle: 测试\n${metadata}\n---\n\n${body}`})
 const tree=await processor.run(processor.parse(file),file) as Root
 return {file,tree,visible:tree.children.filter(node=>node.type!=='yaml')}
}
test('deprecated boolean prepends an ordinary WARNING callout and retains the original body',async()=>{
 const {file,visible}=await parse('deprecated: true')
 assert.equal(file.data.frontmatter?.deprecated,true)
 assert.equal(visible[0].type,'blockquote')
 if(visible[0].type!=='blockquote')return
 assert.deepEqual(visible[0].children,[
  {type:'paragraph',children:[{type:'text',value:'[!WARNING] 本文已弃用'}]},
  {type:'paragraph',children:[{type:'text',value:'本文内容已不再维护，部分信息可能已经过时或不再适用，仅供历史参考。请勿直接依照本文进行操作。'}]},
 ])
 assert.equal(visible[1].type,'heading');assert.equal(visible[2].type,'paragraph')
 assert.ok(!String(file.value).includes('本文已弃用'),'the source Markdown is unchanged')
})
test('missing and disabled deprecated metadata do not insert warnings',async()=>{
 for(const value of ['', 'deprecated: false','deprecated: "false"','deprecated: 1']){
  const {file,visible}=await parse(value)
  assert.notEqual(file.data.frontmatter?.deprecated,true)
  assert.equal(visible[0].type,'heading',value)
 }
})
test('existing identical warning is not duplicated and an empty article can still show its warning',async()=>{
 const existing=await parse('deprecated: true','> [!WARNING] 本文已弃用\n>\n> 本文内容已不再维护。\n\n原始正文。')
 assert.equal(existing.visible.filter(node=>node.type==='blockquote').length,1)
 const empty=await parse('deprecated: true','')
 assert.equal(empty.visible.length,1);assert.equal(empty.visible[0].type,'blockquote')
})

 test('Obsidian text properties containing true are normalized to a boolean',async()=>{
  for(const value of ['deprecated: "true"','deprecated: " TRUE "']){
   const {file,visible}=await parse(value)
   assert.equal(file.data.frontmatter?.deprecated,true)
   assert.equal(visible[0].type,'blockquote')
  }
 })
