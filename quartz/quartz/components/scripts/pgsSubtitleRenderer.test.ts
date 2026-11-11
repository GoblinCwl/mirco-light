import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPgsSubtitleRenderer} from './pgsSubtitleRenderer'
import {readFileSync} from 'node:fs'
import {transformSync} from 'esbuild'
class Renderer {
  implementation={worker:new EventTarget()}
  disposed=0;url=''
  loadFromUrl(url:string){this.url=url}
  dispose(){this.disposed++}
}
const library={PgsRenderer:Renderer}
test('production PGS adapter serializes into the opaque iframe without module dependencies',async()=>{
 const module={exports:{} as {createPgsSubtitleRenderer:typeof createPgsSubtitleRenderer}}
 const source=readFileSync(new URL('./pgsSubtitleRenderer.ts',import.meta.url),'utf8')
 const compiled=transformSync(source,{loader:'ts',format:'cjs',minify:true}).code
 Function('module','exports',compiled)(module,module.exports)
 const isolated=Function(`return (${module.exports.createPgsSubtitleRenderer.toString()})`)() as typeof createPgsSubtitleRenderer
 const handle=isolated(library,{subUrl:'authorized.sup'})
 handle.renderer.implementation.worker.dispatchEvent(new MessageEvent('message',{data:{op:'updateTimestamps'}}))
 await handle.ready;handle.dispose()
})
test('PGS progress releases readiness while subsequent worker failure still triggers burn-in fallback',async()=>{
 let failures=0
 const handle=createPgsSubtitleRenderer(library,{subUrl:'authorized.sup'},()=>failures++)
 assert.equal(handle.renderer.url,'authorized.sup')
 handle.renderer.implementation.worker.dispatchEvent(new MessageEvent('message',{data:{op:'updateTimestamps',updateTimestamps:[0,1]}}))
 await handle.ready
 handle.renderer.implementation.worker.dispatchEvent(new Event('error'))
 assert.equal(failures,1)
 handle.dispose();handle.dispose();assert.equal(handle.renderer.disposed,1)
})
test('PGS extraction/decoder rejection and timeout reject readiness for Jellyfin fallback',async()=>{
 const failed=createPgsSubtitleRenderer(library,{subUrl:'bad.sup'})
 failed.renderer.implementation.worker.dispatchEvent(new MessageEvent('message',{data:{op:'quartzPgsError'}}))
 await assert.rejects(failed.ready,/PGS/);failed.dispose()
 const timed=createPgsSubtitleRenderer(library,{subUrl:'slow.sup'},undefined,5)
 await assert.rejects(timed.ready,/PGS/);timed.dispose()
})
test('changing subtitles cancels the previous decoder without requesting fallback',async()=>{
 let failures=0
 const handle=createPgsSubtitleRenderer(library,{subUrl:'old.sup'},()=>failures++)
 handle.dispose()
 await assert.rejects(handle.ready,{name:'AbortError'})
 handle.renderer.implementation.worker.dispatchEvent(new Event('error'))
 assert.equal(failures,0)
})
