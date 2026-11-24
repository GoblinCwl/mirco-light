import {aliasSlugs} from "../plugins/emitters/aliases"
import {mkdir,rename,writeFile,stat,chown} from 'node:fs/promises'
import {join} from 'node:path'
import type {ProcessedContent} from '../plugins/vfile'
import type {GlobalConfiguration} from '../cfg'
import {isListed} from './contentVisibility'
import {getDate} from '../components/Date'
import {simplifySlug,type FullSlug} from './path'
import {projectSlug} from './projectReference'
import type {Root} from 'hast'
import {visit, EXIT, SKIP} from 'unist-util-visit'
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'

const summaryParser = unified().use(remarkParse).use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw)
const imageOrigin = 'https://rss-image.invalid'

function firstImage(tree: Root, href: string): string | undefined {
  let cover: string | undefined
  visit(tree, 'element', element => {
    if (['code', 'pre', 'script', 'style', 'template'].includes(element.tagName)) return SKIP
    const src = element.properties.src
    if (element.tagName !== 'img' || typeof src !== 'string' || !src.trim() || /^[?#]/.test(src.trim())) return
    try {
      const url = new URL(src, imageOrigin + href)
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname === '/') return
      cover = url.origin === imageOrigin ? url.pathname + url.search + url.hash : url.href
      return EXIT
    } catch {
      return
    }
  })
  return cover
}

function articleCover(tree: Root, href: string, summary?: string): string | undefined {
  return firstImage(tree, href) ?? (summary ? firstImage(summaryParser.runSync(summaryParser.parse(summary)), href) : undefined)
}
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
 const articles=listed.map(([tree,file])=>{
  const data=file.data,encrypted=Boolean(cfg.passProtected?.enabled&&data.frontmatter?.passphrase)
  const href = '/' + linkSlug(data.slug!).split('/').filter(Boolean).map(encodeURIComponent).join('/')
  const imageBase = data.slug?.endsWith('/index') ? href + '/' : href
  const rssCover = encrypted ? undefined : articleCover(tree, imageBase, data.frontmatter?.description)
  return {sourceId:String(data.slug),slug:String(data.slug),href,title:String(data.frontmatter?.title||data.slug),content:encrypted?'':data.text||'',description:encrypted?'':data.description||'',tags:data.frontmatter?.tags||[],links:[...new Set((data.links||[]).map(link=>aliases.get(linkSlug(String(link)))||linkSlug(String(link))).filter(link=>link!==linkSlug(data.slug!)&&(link==='/'||slugs.has(link)||projectSlug('/'+link)===link)))],encrypted,publishedAt:data.dates?.created?.toISOString(),updatedAt:getDate(cfg,data)?.toISOString(),extra:{filePath:String(data.relativePath||`${data.slug}.md`),aliases:aliasSlugs(data.slug!,data.aliases).map(alias=>linkSlug(alias)), rssCover}}
 })
 await mkdir(directory,{recursive:true})
 const target=join(directory,'articles-index.json'),temporary=target+'.tmp'
 await writeFile(temporary,JSON.stringify({articles,permissions}),{mode:0o600})
 if(process.getuid?.()===0){const owner=await stat(directory);await chown(temporary,owner.uid,owner.gid)}
 await rename(temporary,target)
}
