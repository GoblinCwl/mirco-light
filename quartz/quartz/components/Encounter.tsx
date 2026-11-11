import { QuartzComponent, QuartzComponentConstructor } from "./types"
// @ts-ignore
import script from "./scripts/encounter.inline"
import style from "./styles/encounter.scss"
import previewStyle from "./styles/contentHover.scss"

const Encounter: QuartzComponent = ({ fileData }) => {
  if (fileData.slug !== "index") return null
  return (
    <section class="home-encounter" aria-label="拾遗：随机文章、分享、仓库与视频">
      <div class="home-encounter-header">
        <h3>拾遗</h3>
        <button type="button" data-encounter-next aria-label="换一批内容" title="换一批内容" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7h3c4 0 8 10 12 10h3M17 13l4 4-4 4M3 17h3c1.8 0 3.5-2 5-4M14 8c1.4-1 2.5-1 4-1h3M17 3l4 4-4 4"/></svg>
        </button>
      </div>
      <div class="home-encounter-content" aria-live="polite" aria-busy="true">
        <div class="home-encounter-skeleton" role="status" aria-label="正在加载拾遗">{[0,1,2].map(index=><div class="home-encounter-item home-encounter-placeholder" aria-hidden="true"><div class="home-encounter-skeleton-title"><i style={`width:${[65,80,70][index]}%`}/></div><div class="home-encounter-skeleton-excerpt"><i/><i style={`width:${[85,70,55][index]}%`}/></div></div>)}</div>
      </div>
    </section>
  )
}
Encounter.css = style + "\n" + previewStyle
Encounter.afterDOMLoaded = script
export default (() => Encounter) satisfies QuartzComponentConstructor
