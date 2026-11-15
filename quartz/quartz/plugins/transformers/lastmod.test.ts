import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { VFile } from 'vfile'
import type { BuildCtx } from '../../util/ctx'
import type { FilePath } from '../../util/path'
import { FrontMatter } from './frontmatter'
import { CreatedModifiedDate } from './lastmod'
import { formatDateWithSeconds } from '../../util/formatDate'

test('YAML modified timestamp reaches page rendering without an extra UTC conversion',async()=>{
 const ctx={cfg:{configuration:{locale:'zh-CN'}},allSlugs:[]} as unknown as BuildCtx
 const file=new VFile({path:'fixture.md',value:'---\ncreated: 2026-11-15\nmodified: 2026-11-15 16:55:43\npublished: 2026-11-15T08:55:43Z\n---\n正文'})
 file.data.relativePath='fixture.md' as FilePath
 const processor=unified().use(remarkParse).use(FrontMatter().markdownPlugins!(ctx)).use(CreatedModifiedDate({priority:['frontmatter']}).markdownPlugins!(ctx))
 await processor.run(processor.parse(file),file)
 assert.equal(file.data.dates?.modified.toISOString(),'2026-11-15T08:55:43.000Z')
 assert.equal(formatDateWithSeconds(file.data.dates!.modified,'zh-CN',true),'2026年11月15日 16:55:43')
 assert.equal(file.data.dates?.created.toISOString(),'2026-11-14T16:00:00.000Z')
 assert.equal(file.data.dates?.published.toISOString(),'2026-11-15T08:55:43.000Z')
})
