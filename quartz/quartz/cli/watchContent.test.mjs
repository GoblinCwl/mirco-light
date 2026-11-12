import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm,unlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {watchContent} from './watchContent.mjs'

test('edits during the initial build are buffered, then rebuild from the current hidden note',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'quartz-startup-watch-'))
 let watcher
 try {
  await mkdir(path.join(directory,'Work'))
  const note=path.join(directory,'Work','protected.md')
  await writeFile(note,'old build input')
  let rebuilt,callbacks=0
  const result=new Promise(resolve=>{rebuilt=resolve})
  watcher=await watchContent(directory,()=>false,changes=>{
   callbacks++;rebuilt([...changes]);changes.splice(0)
  })
  // Parsing has already read the old content; the initial build is still busy.
  const parsed=await readFile(note,'utf8')
  await writeFile(note,'current build input')
  await delay(650)
  assert.equal(callbacks,0,'building must buffer events without touching an unfinished content map')
  watcher.activate()
  const changes=await Promise.race([result,delay(3000).then(()=>{throw Error('startup edit was lost')})])
  assert.deepEqual(changes,[{path:'Work/protected.md',type:'change'}])
  assert.equal(parsed,'old build input')
  assert.equal(await readFile(note,'utf8'),'current build input')
  watcher.activate();assert.equal(callbacks,1,'activation must not replay an already-consumed batch')
 } finally {await watcher?.close();await rm(directory,{recursive:true,force:true})}
})

test('startup captures additions and deletions, while ignored files remain ignored',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'quartz-startup-watch-'))
 let watcher
 try {
  const old=path.join(directory,'old.md');await writeFile(old,'old')
  let received
  const result=new Promise(resolve=>{received=resolve})
  watcher=await watchContent(directory,fp=>fp.endsWith('.tmp'),changes=>received([...changes]))
  await writeFile(path.join(directory,'new.md'),'new')
  await writeFile(path.join(directory,'ignored.tmp'),'ignored')
  await unlink(old);await delay(650)
  watcher.activate()
  const changes=await Promise.race([result,delay(3000).then(()=>{throw Error('startup changes were lost')})])
  assert.ok(changes.some(e=>e.path==='new.md'&&e.type==='add'))
  assert.ok(changes.some(e=>e.path==='old.md'&&e.type==='delete'))
  assert.ok(!changes.some(e=>e.path==='ignored.tmp'))
 } finally {await watcher?.close();await rm(directory,{recursive:true,force:true})}
})
