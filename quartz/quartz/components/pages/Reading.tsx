import ReadingBlackHole from './ReadingBlackHole'
import {graphPalette} from '../../util/graphPalette'
import {QuartzComponent,QuartzComponentConstructor} from '../types'
import style from '../styles/reading.scss'
// @ts-ignore
import script from '../scripts/reading.inline'
const ReadingLoading=()=> <svg class="reading-book-loading" viewBox="0 0 160 100" fill="none" aria-hidden="true"><path class="reading-loader-orbit" d="M12 58Q80 6 148 58M28 80Q80 47 132 80"/><g class="reading-loader-book"><path d="M80 42c-13-10-27-12-43-8v43c16-4 30-2 43 8 13-10 27-12 43-8V34c-16-4-30-2-43 8Zm0 0v43"/><path class="reading-loader-page" d="M80 43c-7-13-16-20-29-22v44c13 2 22 8 29 19V43Z"/><path d="m49 46 19 6m-19 6 19 6m24-12 19-6m-19 18 19-6"/></g><path class="reading-loader-star" d="m80 8 2.2 8 8 2.2-8 2.2-2.2 8-2.2-8-8-2.2 8-2.2Z"/><circle class="reading-loader-spark" cx="28" cy="40" r="1.5"/><circle class="reading-loader-spark" cx="135" cy="30" r="1.5"/></svg>
const paletteStyle=Object.entries(graphPalette).filter(([kind])=>kind!=='tag').map(([kind,colors])=>`--reading-${kind}-light:${colors.light};--reading-${kind}-dark:${colors.dark}`).join(';')
const Reading:QuartzComponent=()=> <section class="reading-page" style={paletteStyle} data-reading-page aria-label="视界">
 <span class="reading-space" aria-hidden="true"/>
 <ReadingBlackHole/>
 <div class="reading-workspace"><div class="reading-main">
 <div class="reading-initial-loading" data-reading-initial role="status" aria-label="正在展开内容"><ReadingLoading/></div>
 <div class="reading-grid" data-reading-list aria-live="polite" aria-busy="true"/>
 <div class="reading-scroll-status" data-reading-status role="status" aria-label="正在读取更多内容" hidden><ReadingLoading/></div>
 <div class="reading-sentinel" data-reading-sentinel aria-hidden="true"/>
 </div><nav class="reading-timeline" data-reading-timeline aria-label="按年月浏览内容"/></div>
 </section>
Reading.css=style
Reading.afterDOMLoaded=script
export default (()=>Reading) satisfies QuartzComponentConstructor
