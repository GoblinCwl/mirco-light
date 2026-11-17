import {test} from 'node:test'
import assert from 'node:assert/strict'
import {linkIconKind,linkIconSVG,articleLinkRoutes} from './linkIcons'
import {fileNameIcon} from './fileTypeIcons'
const base='https://goblincwl.site/Memo/note'
const articles=articleLinkRoutes(['Memo/note','about'])
test('internal content and external subdomains use the expected leading icons',()=>{
 for(const [href,kind]of [['/Memo/note','article'],['/about','article'],['/Memo/note.html','article'],['/static/avatar.webp','internal'],['/files/manual.pdf','internal'],['/Repo/code?ref=main','repo'],['/Share/分享/id','share'],['/Video/BV1/','video'],['https://example.com','external'],['//media.goblincwl.site/a','external'],['https://goblincwl.site.evil/note','external']]){
  assert.equal(linkIconKind(href,base,articles),kind)
  const svg=linkIconSVG(href,base,articles)!;assert.ok(svg.startsWith('<svg '));assert.ok(svg.includes(`data-link-icon="${kind}"`));assert.ok(svg.includes('aria-hidden="true"'));assert.ok(!svg.includes('external-icon'))
 }
})
test('Repo and Share file links reuse the directory file-type SVGs',()=>{
 for(const [href,name,kind] of [
  ['/Repo/CwlWeb/?path=.WorkSpace%2FMySqlScript%2Fdata%2Fbad_words.sql','bad_words.sql','code'],
  ['/Repo/project/?ref=main&path=README.md','README.md','text'],
  ['/Share/分享/附件/note.md','note.md','text'],
  ['/Share/分享/附件/a%20b.png','a b.png','image'],
  ['/Share/空间/src/main.ts','main.ts','code'],
  ['/Share/访客/report.docx','report.docx','word'],
 ]){
  assert.equal(linkIconKind(href,base,articles),`file-${kind}`)
  const actual=linkIconSVG(href,base,articles)!
  assert.equal(actual.slice(actual.indexOf('>')+1),fileNameIcon(name).slice(fileNameIcon(name).indexOf('>')+1))
 }
 for(const href of ['/Share/分享/附件/docs.md/','/Share/分享/project.md/','/Repo/project/?path=docs/'])assert.ok(!linkIconKind(href,base,articles)?.startsWith('file-'))
 assert.equal(linkIconKind('https://other.site/Repo/project/?path=main.ts',base,articles),'external')
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
