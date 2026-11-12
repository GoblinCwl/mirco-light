import SiteNotFound from '../../components/pages/SiteNotFound'
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import type {QuartzEmitterPlugin} from '../types'
import BodyConstructor from '../../components/Body'
import {pageResources,renderPage} from '../../components/renderPage'
import type {FullPageLayout} from '../../cfg'
import {QUARTZ,type FullSlug} from '../../util/path'
import {defaultListPageLayout,sharedPageComponents} from '../../../quartz.layout'
import {defaultProcessedContent} from '../vfile'
import {write} from './helpers'
import {renderStandaloneError} from '../../util/standaloneError'

export const NotFoundPage:QuartzEmitterPlugin=()=>{
 const siteOpts:FullPageLayout={...sharedPageComponents,pageBody:SiteNotFound(),beforeBody:[],afterBody:[],left:defaultListPageLayout.left,right:[]}
 return {
  name:'404Page',
  getQuartzComponents(){return [siteOpts.head,BodyConstructor(),siteOpts.pageBody,siteOpts.footer,...siteOpts.left]},
  async *emit(ctx,content,resources){
   const cfg=ctx.cfg.configuration
   const favicon='data:image/x-icon;base64,'+(await readFile(join(QUARTZ,'static','icon.ico'))).toString('base64')
   for(const code of [404,403] as const){
    const html=renderStandaloneError(code,cfg,favicon)
    yield write({ctx,slug:String(code) as FullSlug,ext:'.html',content:html})
    yield write({ctx,slug:`static/errors/${code}` as FullSlug,ext:'.html',content:html})
    // This persistent mount is shared with the front Nginx and survives builds.
    const directory=process.env.QUARTZ_ERROR_PAGES_DIR
    if(directory){
     await mkdir(directory,{recursive:true})
     const target=join(directory,`${code}.html`)
     await writeFile(`${target}.tmp`,html)
     await rename(`${target}.tmp`,target)
    }
   }
   const [tree,file]=defaultProcessedContent({slug:'site-404' as FullSlug,frontmatter:{title:'迷失星海',tags:[]}})
   const pageAssets=pageResources('/' as FullSlug,resources)
   pageAssets.additionalHead=[...(pageAssets.additionalHead||[]),<meta name="robots" content="noindex, nofollow"/>]
   const html=await renderPage(cfg,'site-404' as FullSlug,{ctx,cfg,tree,fileData:file.data,externalResources:pageAssets,children:[],allFiles:content.map(([,file])=>file.data)},siteOpts,pageAssets)
   yield write({ctx,slug:'static/site-404' as FullSlug,ext:'.html',content:html.replace('<head>','<head><base href="/">')})
  },
  async *partialEmit(){},
 }
}
