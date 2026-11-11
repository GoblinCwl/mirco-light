import { QuartzComponent, QuartzComponentConstructor } from "./types"
import style from "./styles/driveOperations.scss"
import Graph from "./Graph"
import { homeIcons } from "../home/icons"

export default (() => {
  const ShareGraph = Graph()
  const DriveOperations: QuartzComponent = (props) => <section class="drive-operations" data-drive-operations>
    <button type="button" class="drive-operations-launch" data-drive-operations-launch hidden aria-haspopup="dialog" aria-expanded="false" aria-controls="drive-operations-dialog">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="var(--light)" /><circle cx="16" cy="12" r="2" fill="var(--light)" /><circle cx="10" cy="18" r="2" fill="var(--light)" /></svg>
      <span data-drive-operations-launch-label>操作</span>
    </button>
    <dialog id="drive-operations-dialog" class="drive-operations-dialog" data-drive-operations-dialog open aria-label="Share 操作">
      <div class="drive-operations-inner">
        <div class="drive-operations-mobile-heading"><button type="button" data-drive-operations-close aria-label="关闭操作面板"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
        <section class="drive-share-graph" data-drive-share-graph hidden><ShareGraph {...props} /></section>
        <div class="drive-operation-context" data-drive-operation-context hidden><div class="drive-operation-context-heading"><span data-drive-operation-scope /><button type="button" data-drive-operation-clear hidden>取消选择</button></div><div class="drive-operation-target" data-drive-operation-target /><p data-drive-operation-summary /></div>
        <figure class="drive-media-sidebar-poster" data-drive-media-poster hidden>
          <div class="drive-media-sidebar-artwork drive-media-artwork"><img alt="" decoding="async" referrerPolicy="no-referrer" /></div>
          <figcaption>
            <a class="drive-media-jellyfin" data-drive-media-link data-no-popover="true" target="_blank" rel="noopener noreferrer" hidden><span class="drive-media-brand" aria-hidden="true" dangerouslySetInnerHTML={{ __html: homeIcons.media }}/><span>Jellyfin</span></a>
            <a class="drive-media-tmdb" data-drive-media-tmdb-link data-no-popover="true" target="_blank" rel="noopener noreferrer" hidden><span class="drive-media-brand" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 5v14M17 5v14M3 10h4m-4 4h4M17 10h4m-4 4h4m-6-4 3 2-3 2Z"/></svg></span><span>TMDB</span></a>
          </figcaption>
        </figure>
        <section class="drive-related-collections" data-drive-collections hidden aria-label="同一合集的相关作品"/>
        <section class="drive-episodes" data-drive-episodes hidden>
          <h3 data-drive-episode-heading>选集</h3>
          <nav class="drive-episode-list" data-drive-episode-list aria-label="当前季选集" />
        </section>
        <section class="drive-preview-selector" data-drive-preview-selector hidden>
          <label for="drive-preview-renderer">预览方式</label>
          <select id="drive-preview-renderer" data-drive-preview-renderer aria-label="预览方式" />
        </section>
        <div class="drive-operation-groups" data-drive-operation-groups />
      </div>
    </dialog>
  </section>
  DriveOperations.css = [style, ...(Array.isArray(ShareGraph.css) ? ShareGraph.css : ShareGraph.css ? [ShareGraph.css] : [])]
  DriveOperations.afterDOMLoaded = ShareGraph.afterDOMLoaded
  return DriveOperations
}) satisfies QuartzComponentConstructor
