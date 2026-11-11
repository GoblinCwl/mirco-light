import type { GlobalConfiguration } from "../cfg"
import {createHash} from 'node:crypto'
import {readFile,writeFile,rename,mkdir,stat,chown} from 'node:fs/promises'
import {join} from 'node:path'
import {globby} from 'globby'
import {ProcessedContent} from '../plugins/vfile'
const journalDirectory=process.env.QUARTZ_JOURNAL_DIR||'/run/quartz-chronicle'

type Source={hash:string;mtime:number;size:number}
type Baseline={sources:Record<string,Source>;completedAt:string}
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex')
// Keep only the last successful snapshot. It is current state, not an event log.
export async function publishBuildSnapshot(_content:ProcessedContent[], _cfg: GlobalConfiguration){
  if(!process.env.QUARTZ_JOURNAL_DIR)return []
  try{
   await mkdir(journalDirectory,{recursive:true})
   const filename=join(journalDirectory,'build-state.json')
   let before:Baseline|undefined
   try{before=JSON.parse(await readFile(filename,'utf8'))}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
   const paths=await globby(['quartz/**/*.{ts,tsx,js,mjs,scss,css}','quartz/static/**/*','quartz.config.ts','quartz.layout.ts','package.json','package-lock.json'],{onlyFiles:true,ignore:['**/.quartz-cache/**','**/node_modules/**','**/*.test.*']})
   const sources:Record<string,Source>={}
   await Promise.all(paths.map(async path=>{const info=await stat(path),old=before?.sources[path];sources[path]=old&&old.mtime===info.mtimeMs&&old.size===info.size?old:{mtime:info.mtimeMs,size:info.size,hash:hash(await readFile(path))}}))
   const completedAt=new Date().toISOString()
   await writeFile(filename+'.tmp',JSON.stringify({sources,completedAt}),{mode:0o600})
   if(process.getuid?.()===0){const owner=await stat(journalDirectory);await chown(filename+'.tmp',owner.uid,owner.gid)}
   await rename(filename+'.tmp',filename)
  }catch(error){console.warn('构建快照写入失败：',error instanceof Error?error.message:String(error))}
}

