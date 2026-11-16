import {QuartzComponent,QuartzComponentConstructor} from './types'
import {restoreNavigationSkeleton} from './scripts/navigationSkeleton'
import style from './styles/homeNavigation.scss'

// Homepage navigation is not an article TOC or an OverflowList.
export default (()=>{
 const HomeNavigation:QuartzComponent=({fileData})=>{
  if(fileData.slug!=='index')return null
  return <nav class="home-links-toc" aria-label="寻径">
   <h3 class="home-links-title">寻径</h3>
   <ul class="home-navigation-list" aria-busy="true" aria-label="寻径链接加载中">
    {[3,4].map(width=><li aria-hidden="true"><span class="home-link-icon"><span class="home-navigation-skeleton-icon"/></span><span class="home-navigation-placeholder-label" style={`width:${width}rem`}>{'\u00a0'}</span></li>)}
    <li class="home-registration-divider" aria-hidden="true"/>
    <li aria-hidden="true"><span class="home-navigation-placeholder-label home-navigation-placeholder-icp" style="width:9rem">{'\u00a0'}</span></li>
   </ul>
   <script dangerouslySetInnerHTML={{__html:`(${restoreNavigationSkeleton.toString()})(document.currentScript.previousElementSibling)`}}/>
  </nav>
 }
 HomeNavigation.css=style
 return HomeNavigation
}) satisfies QuartzComponentConstructor
