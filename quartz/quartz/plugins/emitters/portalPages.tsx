import { QuartzEmitterPlugin } from '../types'
import { ProcessedContent, defaultProcessedContent } from '../vfile'
import { FullPageLayout } from '../../cfg'
import { QuartzComponentProps } from '../../components/types'
import StellarAdmin from '../../components/pages/StellarAdmin'
import Friends, { FriendsApply } from '../../components/pages/Friends'
import StellarObservatory, { ObservatoryTools } from '../../components/pages/StellarObservatory'
import Header from '../../components/Header'
import Body from '../../components/Body'
import { pageResources, renderPage } from '../../components/renderPage'
import { FullSlug, RelativeURL } from '../../util/path'
import { BuildCtx } from '../../util/ctx'
import { StaticResources } from '../../util/resources'
import { defaultListPageLayout, sharedPageComponents } from '../../../quartz.layout'
import { write } from './helpers'
import { escapeHTML, unescapeHTML } from '../../util/escape'
export const PortalPages: QuartzEmitterPlugin = () => {
  const pages = [
    {slug:'observatory/index',title:'星枢',body:StellarObservatory(),right:[ObservatoryTools]},
    {slug:'friends/index',title:'友链',body:Friends(),right:[FriendsApply]},
  ]
  const layouts = pages.map(page => ({...sharedPageComponents,...defaultListPageLayout,beforeBody:[],afterBody:[],right:page.right,pageBody:page.body} as FullPageLayout))
  async function* emit(ctx:BuildCtx,content:ProcessedContent[],resources:StaticResources){
    for(let i=0;i<pages.length;i++){
      const page=pages[i],slug=page.slug as FullSlug,layout=layouts[i]
      const [tree,file]=defaultProcessedContent({slug,frontmatter:{title:page.title,tags:[]}})
      const externalResources=pageResources('/' as RelativeURL,resources)
      const props:QuartzComponentProps={ctx,fileData:file.data,externalResources,cfg:ctx.cfg.configuration,children:[],tree,allFiles:content.map(([,page])=>page.data)}
      const html=(await renderPage(props.cfg,slug,props,layout,externalResources)).replace(/\b(href|src)="(\.{1,2}(?:\/[^\"]*)?)"/g,(_,attr,value)=>{const url=new URL(unescapeHTML(value),'https://quartz.invalid/'+page.slug.replace(/index$/,''));return `${attr}="${escapeHTML(url.pathname+url.search+url.hash)}"`})
      yield write({ctx,content:html,slug,ext:'.html'})
    }
  }
  return{name:'PortalPages',getQuartzComponents(){return [StellarAdmin(), ...layouts.flatMap(l=>[l.head,Header(),Body(),...l.header,...l.beforeBody,l.pageBody,...l.left,...l.right,l.footer])]},emit,partialEmit:emit}
}
