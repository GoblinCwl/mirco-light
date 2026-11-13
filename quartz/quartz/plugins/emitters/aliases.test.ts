import {test} from 'node:test'
import assert from 'node:assert/strict'
import {fromHtml} from 'hast-util-from-html'
import {visit} from 'unist-util-visit'
import {aliasPageHTML,aliasSlugs} from './aliases'
import type {FullSlug} from '../../util/path'

test('alias page keeps article identity and resolves resources from the original directory',()=>{
 const html=aliasPageHTML('<!DOCTYPE html><html><head><title>Article</title><script src="../postscript.js"></script></head><body data-slug="Private/article" data-directory-hidden="true"><article><a href="#section">Section</a><a href="./other?q=1#part">Other</a><a href="https://example.com">External</a><img src="../static/a.png"><div data-payload-url="../Private/article.encrypted.json" data-page-key="Private/article"></div></article><script>const text="<tag>";</script></body></html>','Private/article' as FullSlug)
 const nodes:any[]=[];visit(fromHtml(html),'element',node=>{nodes.push(node)})
 assert.equal(nodes.find(x=>x.tagName==='body').properties.dataSlug,'Private/article')
 assert.equal(nodes.find(x=>x.tagName==='body').properties.dataDirectoryHidden,'true')
 assert.equal(nodes.find(x=>x.tagName==='body').properties.dataContentBase,'/Private/article')
 assert.deepEqual(nodes.filter(x=>x.tagName==='a').map(x=>x.properties.href),['#section','/Private/other?q=1#part','https://example.com'])
 assert.equal(nodes.find(x=>x.tagName==='img').properties.src,'/static/a.png')
 assert.equal(nodes.find(x=>x.tagName==='script').properties.src,'/postscript.js')
 assert.equal(nodes.find(x=>x.tagName==='div').properties.dataPayloadUrl,'/Private/article.encrypted.json')
 assert.equal(nodes.find(x=>x.tagName==='div').properties.dataPageKey,'Private/article')
 assert.ok(html.includes('const text="<tag>";'))
 assert.ok(!html.includes('http-equiv="refresh"'))
})
test('aliases preserve existing root and relative semantics without duplicate self pages',()=>{
 assert.deepEqual(aliasSlugs('Private/article' as FullSlug,['about','Private/article','./local','about'] as FullSlug[]),['about','Private/local'])
})
