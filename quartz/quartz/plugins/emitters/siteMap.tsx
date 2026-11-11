import { getDate } from "../../components/Date"
import { FullSlug, joinSegments, simplifySlug } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import { write } from "./helpers"

interface Options { enableSiteMap: boolean; enableRSS: boolean }

// Content discovery comes from the server index. This emitter only produces
// the build-time sitemap and the RSS discovery link.
export const SiteMap: QuartzEmitterPlugin<Partial<Options>> = (options) => {
 const opts={enableSiteMap:true,enableRSS:true,...options}
 return {
  name:"SiteMap",discoveryOnly:true,
  async *emit(ctx,content){
   if(!opts.enableSiteMap)return
   const urls=new Map<string,Date|undefined>()
   for(const [,file]of content)urls.set(simplifySlug(file.data.slug!),getDate(ctx.cfg.configuration,file.data)??new Date())
   if(ctx.cfg.plugins.emitters.some(plugin=>plugin.name==="HomePage"))urls.set("/",undefined)
   const xml=Array.from(urls,([slug,date])=>`<url><loc>https://${joinSegments(ctx.cfg.configuration.baseUrl??"",encodeURI(slug))}</loc>${date?`<lastmod>${date.toISOString()}</lastmod>`:""}</url>`).join("")
   yield write({ctx,content:`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${xml}</urlset>`,slug:"sitemap" as FullSlug,ext:".xml"})
  },
  externalResources:ctx=>opts.enableRSS?{additionalHead:[<link rel="alternate" type="application/rss+xml" title="RSS Feed" href={`https://${ctx.cfg.configuration.baseUrl}/index.xml`}/>]}:undefined,
 }
}
