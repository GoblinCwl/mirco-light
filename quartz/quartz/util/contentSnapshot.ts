import {aliasSlugs} from "../plugins/emitters/aliases"
import {mkdir,rename,writeFile,stat,chown} from 'node:fs/promises'
import {join} from 'node:path'
import type {ProcessedContent} from '../plugins/vfile'
import type {GlobalConfiguration} from '../cfg'
import {isListed} from './contentVisibility'
import {getDate} from '../components/Date'
import {simplifySlug,type FullSlug} from './path'
import {projectSlug} from './projectReference'
const linkSlug=(slug:string)=>String(simplifySlug(slug as FullSlug)).replace(/\/+$/g,'')||'/'
// Export only after a successful full build or hot rebuild. The service imports
// this atomic, private build snapshot; a failed build never replaces the last index.
export async function publishContentSnapshot(content:ProcessedContent[],cfg:GlobalConfiguration){
 const directory=process.env.QUARTZ_JOURNAL_DIR
 if(!directory)return
 const listed=content.filter(([,file])=>isListed(file.data,cfg)),slugs=new Set(listed.map(([,file])=>linkSlug(file.data.slug!)))
 const aliases=new Map<string,string>()
 for(const [,file] of listed){const canonical=linkSlug(file.data.slug!);aliases.set(canonical,canonical);for(const alias of aliasSlugs(file.data.slug!,file.data.aliases))aliases.set(linkSlug(alias),canonical)}
 for(const [,file] of listed){const canonical=linkSlug(file.data.slug!);aliases.set(canonical,canonical)}
 const permissions=content.flatMap(([,file])=>{
  const key=file.data.slug?String(simplifySlug(file.data.slug)):''
  return key?[{key,title:String(file.data.frontmatter?.title||''),adminOnly:file.data.frontmatter?.comment===false}]:[]
 })
 const articles=listed.map(([,file])=>{
  const data=file.data,encrypted=Boolean(cfg.passProtected?.enabled&&data.frontmatter?.passphrase)
  return {sourceId:String(data.slug),slug:String(data.slug),href:'/'+linkSlug(data.slug!).split('/').map(encodeURIComponent).join('/'),title:String(data.frontmatter?.title||data.slug),content:encrypted?'':data.text||'',description:encrypted?'':data.description||'',tags:data.frontmatter?.tags||[],links:[...new Set((data.links||[]).map(link=>aliases.get(linkSlug(String(link)))||linkSlug(String(link))).filter(link=>link!==linkSlug(data.slug!)&&(link==='/'||slugs.has(link)||projectSlug('/'+link)===link)))],encrypted,publishedAt:data.dates?.created?.toISOString(),updatedAt:getDate(cfg,data)?.toISOString(),extra:{filePath:String(data.relativePath||`${data.slug}.md`),aliases:aliasSlugs(data.slug!,data.aliases).map(alias=>linkSlug(alias))}}
 })
 await mkdir(directory,{recursive:true})
 const target=join(directory,'articles-index.json'),temporary=target+'.tmp'
 await writeFile(temporary,JSON.stringify({articles,permissions}),{mode:0o600})
 if(process.getuid?.()===0){const owner=await stat(directory);await chown(temporary,owner.uid,owner.gid)}
 await rename(temporary,target)
}
