import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'

test('Nginx error documents include all presentation resources and distinct icons without site scripts or network assets',async()=>{
 const cache=path.join(process.cwd(),'.quartz-cache');await mkdir(cache,{recursive:true})
 const directory=await mkdtemp(path.join(cache,'standalone-error-'))
 try{
  const outfile=path.join(directory,'error.mjs')
  await build({entryPoints:['quartz/util/standaloneError.tsx'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',jsxImportSource:'preact',loader:{'.scss':'text'}})
  const {renderStandaloneError}=await import(pathToFileURL(outfile).href)
  const light={light:'#faf8f8',dark:'#2b2b2b',darkgray:'#4e4e4e',secondary:'#284b63'}
  const dark={light:'#161618',dark:'#ebebec',darkgray:'#d4d4d4',secondary:'#7b97aa'}
  const cfg={locale:'zh-CN',pageTitle:'微光集',theme:{colors:{lightMode:light,darkMode:dark}}}
  for(const code of [403,404]){
   const html=renderStandaloneError(code,cfg,'data:image/x-icon;base64,AA==')
   assert.ok(html.startsWith('<!DOCTYPE html>'))
   assert.match(html,/<style>/)
   assert.match(html,/prefers-color-scheme: ?dark/)
   assert.match(html,/prefers-reduced-motion: ?reduce/)
   assert.match(html,/@keyframes error-notice-arrival/)
   assert.ok(html.includes(`class="error-notice-code">${code}</span>`))
   assert.ok(!/<script\b|<iframe\b|<button\b|<a\s|@font-face|rel="stylesheet"/.test(html))
   assert.deepEqual([...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match=>match[1]),['data:image/x-icon;base64,AA=='])
   assert.ok(!html.includes('sidebar'))
   assert.ok(!html.includes('quartz-root'))
   assert.ok(!html.includes('。'))
   if(code===403){assert.ok(html.includes('class="error-notice-barrier"'));assert.ok(html.includes('光锥之外'));assert.ok(html.includes('class="error-notice-blocked-point"'));assert.match(html,/@keyframes error-notice-blocked/);assert.match(html,/translateX\(18.6px\)/);assert.ok(html.includes('星海无垠，所见终有边界'));assert.ok(!html.includes('error-notice-orbit"'))}
   else{assert.ok(html.includes('error-notice-orbit"'));assert.ok(html.includes('迷失星海'));assert.ok(html.includes('星图之外，未必是虚无'));assert.ok(!html.includes('class="error-notice-barrier"'))}
  }
 }finally{await rm(directory,{recursive:true,force:true})}
})
