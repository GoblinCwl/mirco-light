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
  assert.deepEqual(links[0].children, [{ type: 'text', value: '仓库名称', position: links[0].children[0].position }])
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
