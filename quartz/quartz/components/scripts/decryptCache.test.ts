import {test} from 'node:test'
import assert from 'node:assert/strict'
import {webcrypto} from 'node:crypto'
import {readFile,mkdir,mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {getEncryptedPayload} from '../../util/_encrypt'

// Run the real client crypto functions against an in-memory storage. This
// reproduces a password change while the old auto-unlock key still exists.
test('typed passwords override cached keys; empty input can still auto-unlock',async()=>{
 const cache=path.join(process.cwd(),'.quartz-cache')
 await mkdir(cache,{recursive:true})
 const directory=await mkdtemp(path.join(cache,'decrypt-cache-'))
 const globals=globalThis as any,previousWindow=globals.window,previousDocument=globals.document
 const storage=()=>{const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}}
 const previousLocal=globals.localStorage,previousSession=globals.sessionStorage
 globals.window={crypto:webcrypto};globals.document={addEventListener(){}}
 globals.localStorage=storage();globals.sessionStorage=storage()
 try {
  const outfile=path.join(directory,'client.mjs')
  await build({stdin:{contents:await readFile('quartz/components/scripts/_decrypt.inline.ts','utf8')+'\nexport {decryptFile,decryptFile_toc}\n',resolveDir:path.join(process.cwd(),'quartz/components/scripts'),loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',packages:'external'})
  const client=await import(pathToFileURL(outfile).href)
  for(const kind of ['content','toc'] as const){
   const decrypt=kind==='content'?client.decryptFile:client.decryptFile_toc
   const split=(payload:string)=>{
    const data=new Uint8Array(Buffer.from(payload,'base64'))
    return kind==='content'?{salt:data.slice(0,32),iv:data.slice(32,48),ciphertext:data.slice(48),iterations:10}:{salt_toc:data.slice(0,32),iv_toc:data.slice(32,48),ciphertext_toc:data.slice(48),iterations_toc:10}
   }
   const old=split(await getEncryptedPayload('old fixture','old-password',10,'fixture:'+kind))
   const updated=split(await getEncryptedPayload('new fixture','new-password',10,'fixture:'+kind))
   assert.equal(await decrypt(old,'old-password'),'old fixture')
   assert.equal(await decrypt(updated,'new-password'),'new fixture','a stale cached key must not override an explicitly entered password')
   await assert.rejects(decrypt(updated,'wrong-password'),{name:'OperationError'})
   assert.equal(await decrypt(updated,''),'new fixture','cached automatic unlock should remain available')
  }
 }finally{
  if(previousWindow===undefined)delete globals.window;else globals.window=previousWindow
  if(previousDocument===undefined)delete globals.document;else globals.document=previousDocument
  if(previousLocal===undefined)delete globals.localStorage;else globals.localStorage=previousLocal
  if(previousSession===undefined)delete globals.sessionStorage;else globals.sessionStorage=previousSession
  await rm(directory,{recursive:true,force:true})
 }
})
