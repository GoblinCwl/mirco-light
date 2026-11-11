import {mkdir,rename,writeFile,stat,chown} from 'node:fs/promises'
import {join} from 'node:path'
import type {ProcessedContent} from '../plugins/vfile'
import type {GlobalConfiguration} from '../cfg'
import {isListed} from './contentVisibility'
import {getDate} from '../components/Date'
import {simplifySlug} from './path'
import {projectSlug} from './projectReference'
// Export only after a successful full build or hot rebuild. The service imports
// this atomic, private build snapshot; a failed build never replaces the last index.
export async function publishContentSnapshot(content:ProcessedContent[],cfg:GlobalConfiguration){
 const directory=process.env.QUARTZ_JOURNAL_DIR
 if(!directory)return
 const listed=content.filter(([,file])=>isListed(file.data,cfg)),slugs=new Set(listed.map(([,file])=>String(simplifySlug(file.data.slug!))))
 const permissions=content.flatMap(([,file])=>{
  const key=file.data.slug?String(simplifySlug(file.data.slug)):''
  return key?[{key,title:String(file.data.frontmatter?.title||''),adminOnly:file.data.frontmatter?.comment===false}]:[]
 })
 const articles=listed.map(([,file])=>{
  const data=file.data,encrypted=Boolean(cfg.passProtected?.enabled&&data.frontmatter?.passphrase)
  return {sourceId:String(data.slug),slug:String(data.slug),href:'/'+String(simplifySlug(data.slug!)).split('/').map(encodeURIComponent).join('/'),title:String(data.frontmatter?.title||data.slug),content:encrypted?'':data.text||'',description:encrypted?'':data.description||'',tags:data.frontmatter?.tags||[],links:(data.links||[]).filter(link=>link==='/'||slugs.has(String(link))||projectSlug('/'+link)===link),encrypted,publishedAt:data.dates?.created?.toISOString(),updatedAt:getDate(cfg,data)?.toISOString(),extra:{filePath:String(data.relativePath||`${data.slug}.md`)}}
 })
 await mkdir(directory,{recursive:true})
 const target=join(directory,'articles-index.json'),temporary=target+'.tmp'
 await writeFile(temporary,JSON.stringify({articles,permissions}),{mode:0o600})
 if(process.getuid?.()===0){const owner=await stat(directory);await chown(temporary,owner.uid,owner.gid)}
 await rename(temporary,target)
}
