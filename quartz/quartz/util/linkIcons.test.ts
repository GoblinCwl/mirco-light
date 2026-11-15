import {test} from 'node:test'
import assert from 'node:assert/strict'
import {linkIconKind,linkIconSVG,articleLinkRoutes} from './linkIcons'
const base='https://goblincwl.site/Memo/note'
const articles=articleLinkRoutes(['Memo/note','about'])
test('internal content and external subdomains use the expected leading icons',()=>{
 for(const [href,kind]of [['/Memo/note','article'],['/about','article'],['/Memo/note.html','article'],['/static/avatar.webp','internal'],['/files/manual.pdf','internal'],['/Repo/code?ref=main','repo'],['/Share/分享/id','share'],['/Video/BV1/','video'],['https://example.com','external'],['//media.goblincwl.site/a','external'],['https://goblincwl.site.evil/note','external']]){
  assert.equal(linkIconKind(href,base,articles),kind)
  const svg=linkIconSVG(href,base,articles)!;assert.ok(svg.startsWith('<svg '));assert.ok(svg.includes(`data-link-icon="${kind}"`));assert.ok(svg.includes('aria-hidden="true"'));assert.ok(!svg.includes('external-icon'))
 }
})
test('in-page anchors and application protocols retain their original behavior',()=>{
 for(const href of ['#heading','mailto:a@example.com','tel:123','obsidian://open?vault=notes','javascript:void(0)',''])assert.equal(linkIconSVG(href,base,articles),undefined)
})

test('functional pages and generated directories use a dedicated internal-navigation icon',()=>{
 for(const href of ['/reading/','/tags/?tag=hello','/Memo/','/Memo/MicroLight/','/Study/Node.js/','/Study/','/Repo/','/Video/','/Share/访客/','/Repo/language/Go','/unknown-page']){
  assert.equal(linkIconKind(href,base,articles),'internal',href)
  const svg=linkIconSVG(href,base,articles)!;assert.ok(svg.includes('data-link-icon="internal"'));assert.ok(!svg.includes('data-link-icon="folder"'))
 }
 assert.equal(linkIconKind('/Memo/landing/',base,articleLinkRoutes(['Memo/landing/index'])),'article')
})
