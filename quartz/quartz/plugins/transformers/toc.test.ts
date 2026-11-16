import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import { visit } from 'unist-util-visit'
import { VFile } from 'vfile'
import type { BuildCtx } from '../../util/ctx'
import { TableOfContents } from './toc'

test('TOC strips raw HTML markup and keeps anchors aligned with rendered headings', async () => {
 const ctx = {} as BuildCtx
 const processor = unified().use(remarkParse).use(TableOfContents().markdownPlugins!(ctx))
  .use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw).use(rehypeSlug)
 const file = new VFile({ value: '# <span class="title">标题</span><br>说明\n\n## <em>标题</em>\n\n## <em>标题</em>\n\n## `Vec<T>` 与 **粗体**' })
 const tree = await processor.run(processor.parse(file), file)
 const ids: string[] = []
 visit(tree, 'element', node => { if (/^h[1-6]$/.test(node.tagName)) ids.push(String(node.properties.id)) })
 assert.ok(file.data.toc)
 assert.deepEqual(file.data.toc.map(entry => entry.text), ['标题说明', '标题', '标题', 'Vec<T> 与 粗体'])
 assert.deepEqual(file.data.toc.map(entry => entry.slug), ids)
})
