import { QuartzComponent, QuartzComponentConstructor } from "../types"
import style from "../styles/openlist.scss"
import PasswordGate from "../PasswordGate"
// @ts-ignore
import script from "../scripts/openlist.inline"
// @ts-ignore Bundled separately so the isolated player has normal module imports.
import jellyfinPlayerScript from '../scripts/jellyfin/player.inline'

const LoginStarDrive = () => <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <path fill="currentColor" fill-rule="evenodd" d="M20 10h24a6 6 0 0 1 5.8 4.5L56 36v13a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6V36l6.2-21.5A6 6 0 0 1 20 10Zm0 4a2 2 0 0 0-1.9 1.5L12.6 35h38.8l-5.5-19.5A2 2 0 0 0 44 14H20Zm-2 29a1.5 1.5 0 0 0 0 3h12a1.5 1.5 0 0 0 0-3H18Zm29 1.5a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" />
  <path d="m32 17 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="currentColor" />
</svg>
export default (() => {
  const OpenList: QuartzComponent = () => <section class="drive-page" data-openlist>
    <header class="drive-heading" data-drive-heading>
      <p class="drive-context" data-drive-context />
    </header>
    <div class="drive-stage">
      <span class="drive-loading-overlay" data-drive-page-loading role="status" aria-label="正在读取 Share"><span class="drive-loading-badge"><span class="drive-loading" aria-hidden="true"><svg class="drive-loading-progress" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" pathLength="100" /></svg><i /></span></span></span>
      <div data-drive-boot />
      <section class="drive-gate" data-drive-auth hidden aria-labelledby="drive-auth-title">
        <div class="lock-header"><div class="lock-icon"><LoginStarDrive /></div><h2 id="drive-auth-title">登录以访问空间</h2></div>
        <p>空间仅供管理员使用，请通过星枢登录。</p>
        <a class="internal" href="/observatory/" data-no-popover="true">前往星枢</a>
      </section>
      <article class="drive-unlock-content" data-drive-unlock hidden>
        <PasswordGate prefix="drive-unlock" message="此分享需要提取码" placeholder="输入提取码" submitLabel="解锁" inputName="password" />
      </article>
      <section data-drive-content hidden>
        <section class="drive-metadata" data-drive-header hidden />
        <p class="drive-message" data-drive-message aria-live="polite" />
        <div class="drive-listing" data-drive-listing hidden>
          <div class="share-home" data-drive-home hidden />
          <div class="drive-list-caption"><h2 class="share-home-files-title" data-drive-home-files-title hidden>访客文件</h2><p data-drive-count /><span data-drive-selection aria-live="polite" /></div>
          <table class="drive-file-table" aria-label="文件列表">
            <thead><tr>
              <th class="drive-select-cell"><input type="checkbox" data-drive-select-all aria-label="全选已加载" /></th>
              <th class="drive-kind-cell">类型</th>
              <th class="drive-name-cell" data-drive-column="name" aria-sort="ascending"><button type="button" data-drive-sort="name" title="按名称排序，Shift+点击添加次级排序"><span>名称</span><span class="drive-sort-indicator" aria-hidden="true" /></button></th>
              <th class="drive-tags-cell"><span class="directory-column-label">标签</span></th>
              <th class="drive-size-cell" data-drive-column="size"><button type="button" data-drive-sort="size" title="按大小排序，Shift+点击添加次级排序"><span>大小</span><span class="drive-sort-indicator" aria-hidden="true" /></button></th>
              <th class="drive-modified-cell" data-drive-column="modified"><button type="button" data-drive-sort="modified" title="按修改时间排序，Shift+点击添加次级排序"><span>修改时间</span><span class="drive-sort-indicator" aria-hidden="true" /></button></th>
            </tr></thead>
            <tbody class="drive-list" data-drive-list aria-busy="false" />
          </table>
          <div class="drive-image-view" data-drive-images hidden>
            <label class="drive-image-select-all"><input type="checkbox" data-drive-image-select-all aria-label="全选已加载" /><span>全选已加载</span></label>
            <div data-drive-image-items />
          </div>
        </div>
        <section class="drive-file-page" data-drive-preview hidden><div class="drive-preview-body" data-drive-preview-body /></section>
        <footer class="infinite-scroll-trigger" data-drive-pagination hidden aria-label="继续加载文件" />
        <section class="drive-metadata drive-readme" data-drive-readme hidden />
      </section>
    </div>
  </section>
  OpenList.css = style
  OpenList.afterDOMLoaded = [`window.__quartzJellyfinScript=${JSON.stringify(jellyfinPlayerScript)};`,script]
  return OpenList
}) satisfies QuartzComponentConstructor
