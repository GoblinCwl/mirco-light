import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { VFile } from 'vfile'
import { visit } from 'unist-util-visit'
import type { Root, Element } from 'hast'
import type { BuildCtx } from '../../util/ctx'
import { CrawlLinks } from './links'

const ctx = { cfg: { configuration: { baseUrl: 'goblincwl.site' } }, allSlugs: ['Memo/source', 'Memo/target'] } as BuildCtx

test('Markdown website project links become internal references without changing labels or article/external links', async () => {
  const file = new VFile()
  file.data.slug = 'Memo/source' as typeof file.data.slug
  const processor = unified().use(remarkParse).use(remarkRehype).use(CrawlLinks().htmlPlugins!(ctx))
  const tree = await processor.run(processor.parse(`
[仓库名称](https://goblincwl.site/Repo/CwlWeb/?tab=code#readme)
[重复引用](https://goblincwl.site/Repo/CwlWeb)
[视频标题](https://goblincwl.site/Video/BV1ua4W6XEJd/)
[分享资料](https://goblincwl.site/Share/分享/资料/)
[外部](https://github.com/GoblinCwl/CwlWeb)
[原有笔记](Memo/target.md)
`), file) as Root
  const links: Element[] = []
  visit(tree, 'element', node => { if (node.tagName === 'a') links.push(node) })
  assert.deepEqual(file.data.links, ['Repo/CwlWeb', 'Video/BV1ua4W6XEJd', 'Share/分享/资料', 'Memo/target'])
  assert.equal(links[0].properties.href, '/Repo/CwlWeb?tab=code#readme')
  assert.equal(links[0].properties['data-repo-hover'], 'true')
  const label=links[0].children.filter(child=>child.type==='text')
  assert.deepEqual(label, [{ type: 'text', value: '仓库名称', position: label[0].position }])
  assert.equal((links[0].children[0] as Element).properties['dataLinkIcon'],'repo')
  assert.equal((links[4].children[0] as Element).properties['dataLinkIcon'],'external')
  assert.ok(!JSON.stringify(links).includes('external-icon'))
  assert.deepEqual(links[0].properties.className, ['internal'])
  assert.equal(links[2].properties['data-video-reference'], 'BV1ua4W6XEJd')
  assert.equal(links[3].properties.href, '/Share/%E5%88%86%E4%BA%AB/%E8%B5%84%E6%96%99')
  assert.ok((links[4].properties.className as string[]).includes('external'))
  assert.ok((links[5].properties.className as string[]).includes('internal'))
})

test('tag galaxy query links bypass Markdown path slugification', async () => {
 const file=new VFile();file.data.slug='Memo/source' as typeof file.data.slug
 const processor=unified().use(remarkParse).use(remarkRehype).use(CrawlLinks().htmlPlugins!(ctx))
 const href='/tags/?tag=%E6%8A%80%E6%9C%AF%2FC%2B%2B'
 const tree=await processor.run(processor.parse(`[标签](${href})`),file) as Root
 let link:Element|undefined
 visit(tree,'element',node=>{if(node.tagName==='a')link=node})
 assert.equal(link?.properties.href,href)
 assert.equal(link?.properties['data-no-popover'],'true')
 assert.deepEqual(file.data.links,[])
})

test('absolute article and alias links are indexed; external and navigation links are excluded',()=>{
 const plugin=CrawlLinks({openLinksInNewTab:true})
 const ctx={cfg:{configuration:{baseUrl:'goblincwl.site'}},allSlugs:['Memo/note','about','reading','Memo/source']} as unknown as BuildCtx
 const factory=plugin.htmlPlugins!(ctx)[0] as ()=>Function
 const tree={type:'root',children:['https://goblincwl.site/Memo/note?x=1#heading','https://goblincwl.site/about','/reading/','https://evil.test/Memo/note'].map(href=>({type:'element',tagName:'a',properties:{href},children:[{type:'text',value:'link'}]}))}
 const file={data:{slug:'Memo/source'}} as {data:{slug:string;links?:string[]}}
 factory()(tree,file)
 assert.deepEqual(file.data.links,['Memo/note','about'])
 assert.equal((tree.children[2].properties as Record<string,unknown>)['data-no-popover'],'true')
})

test('leading icons stay with nested link labels rather than creating a separate card row',()=>{
 const plugin=CrawlLinks(),factory=plugin.htmlPlugins!(ctx)[0] as ()=>Function
 const title={type:'element',tagName:'strong',properties:{},children:[{type:'text',value:'项目标题'}]}
 const anchor={type:'element',tagName:'a',properties:{href:'https://goblincwl.site/Repo/code'},children:[title]}
 factory()({type:'root',children:[anchor]},{data:{slug:'Memo/source'}})
 assert.equal(anchor.children[0],title)
 assert.equal(title.children.length,2)
 assert.equal((title.children[0] as unknown as Element).tagName,'svg')
 assert.equal(title.children[1].value,'项目标题')
})

test('homepage navigation never receives body link icons at build time', async () => {
  const file = new VFile()
  file.data.slug = 'index' as typeof file.data.slug
  const processor = unified().use(remarkParse).use(remarkRehype).use(CrawlLinks().htmlPlugins!(ctx))
  const tree = await processor.run(processor.parse('[篇章](/reading/) [标签](/tags/) [仓库](/Repo/CwlWeb) [外链](https://example.com)'), file)
  assert.ok(!JSON.stringify(tree).includes('dataLinkIcon'))
})
