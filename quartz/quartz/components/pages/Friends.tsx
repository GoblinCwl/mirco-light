import { QuartzComponent, QuartzComponentConstructor } from '../types'
import style from '../styles/friends.scss'
import homeConfig from '../../home/config'
// @ts-ignore
import script from '../scripts/friends.inline'
const Friends: QuartzComponent = () => <section class="friends-page" data-friends-page>
  <div class="friends-deep-space" data-friends-deep-space aria-hidden="true"/>
  <div class="friends-postbag" data-friends-list aria-label="友链来信" aria-busy="true"><div class="friend-loading"><div class="friends-thread-loading" role="status" aria-label="正在读取友链"><svg viewBox="0 0 144 74" fill="none" aria-hidden="true"><path class="friends-loading-cord" d="M5 14Q36 31 72 16T139 14"/><g class="friends-loading-note"><rect x="23" y="22" width="24" height="32" rx="1.5"/><path d="M29 43h12M29 47h8"/><circle cx="35" cy="24" r="1.5"/></g><g class="friends-loading-note"><rect x="60" y="14" width="24" height="32" rx="1.5"/><path d="M66 35h12M66 39h8"/><circle cx="72" cy="16" r="1.5"/></g><g class="friends-loading-note"><rect x="97" y="6" width="24" height="32" rx="1.5"/><path d="M103 27h12M103 31h8"/><circle cx="109" cy="8" r="1.5"/></g></svg></div></div></div>
</section>
Friends.css = style
Friends.afterDOMLoaded = script
export default (() => Friends) satisfies QuartzComponentConstructor

export const FriendsApply: QuartzComponent = ({ cfg }) => {
  const origin = `https://${cfg.baseUrl || 'goblincwl.site'}`
  const avatar = `${origin}/static/Profile_compressed.png`
  const description = homeConfig.description
  return <section class="friends-tools">
    <button class="friends-panel-launch" type="button" data-friends-panel-open aria-haspopup="dialog" aria-controls="friends-panel" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2"/><path d="M17 20h6m-3-3v6"/></svg><span>申请友链</span></button>
    <dialog id="friends-panel" class="friends-sidebar" data-friends-panel open tabIndex={-1} aria-label="本站信息与申请友链">
    <button type="button" class="friends-panel-close" data-friends-panel-close aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    <section class="friends-sidebar-group" aria-label="本站信息">
      <div class="friends-site-identity"><button type="button" class="friends-site-avatar" data-friends-copy={avatar} data-copy-label="头像地址" title="复制头像地址" aria-label="复制本站头像地址"><img src={avatar} alt="" width="42" height="42"/></button><div><strong>{cfg.pageTitle}</strong><a href={origin} data-no-popover="true">{cfg.baseUrl || 'goblincwl.site'}</a></div><button type="button" class="friends-site-copy" data-friends-info-open aria-haspopup="dialog" aria-controls="friends-site-info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg><span>复制</span></button></div>
      <p class="friends-site-description">{description}</p>
      <span class="friends-form-status" data-friends-copy-status role="status" aria-live="polite"/>
    </section>
    <section class="friends-sidebar-group" aria-label="申请友链">
      <form class="friends-form-fields" data-friends-apply-form noValidate>
        <label class="friends-form-field"><span>网站名称</span><input name="name" placeholder="你的站点名称" maxLength={80}/></label>
        <label class="friends-form-field"><span>网站地址</span><input name="url" type="url" inputMode="url" placeholder="https://" spellcheck={false}/></label>
        <label class="friends-form-field"><span>包含本站友链的页面地址</span><input name="backlinkUrl" type="url" inputMode="url" placeholder="https://example.com/friends" required maxLength={1500} spellcheck={false}/></label>
        <label class="friends-form-field"><span>RSS 地址（排序依据）</span><input name="rssUrl" type="url" inputMode="url" placeholder="https://example.com/feed.xml" maxLength={1500} spellcheck={false}/></label>
        <label class="friends-form-field"><span>头像地址</span><input name="avatar" type="url" inputMode="url" placeholder="https://…（头像图片链接）" spellcheck={false}/></label>
        <label class="friends-form-field"><span>网站简介<output data-friends-description-count aria-live="polite">0 / 40</output></span><textarea name="description" rows={3} placeholder="简单介绍一下你的网站（最多40字）" maxLength={80} data-friends-description aria-label="网站简介，最多40个字符"/></label>
        <button class="friends-form-submit" type="submit" data-friends-apply disabled title="生成申请卡片预览"><span>申请友链</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/></svg></button>
      </form>
    </section>
    </dialog>
    <dialog id="friends-site-info" class="friends-confirm friends-info-dialog" data-friends-info-dialog tabIndex={-1} aria-labelledby="friends-info-heading">
      <header><h2 id="friends-info-heading">本站信息</h2></header>
      <form class="friends-info-fields" >
        {[{key:"name",label:"名称",value:cfg.pageTitle},{key:"url",label:"地址",value:origin},{key:"avatar",label:"头像地址",value:avatar},{key:"description",label:"简介",value:description}].map(field => (
          <label><span>{field.label}</span>{field.key === "description" ? <textarea data-friends-info-field={field.key} value={field.value} rows={3} readOnly /> : <input data-friends-info-field={field.key} value={field.value} readOnly />}</label>
        ))}
      </form>
      <footer><button type="button" data-friends-info-close>关闭</button><button type="button" data-friends-info-copy>复制</button></footer>
    </dialog>
    <dialog class="friends-confirm" data-friends-application-preview tabIndex={-1} aria-labelledby="friends-confirm-heading">
      <header><h2 id="friends-confirm-heading">友链申请</h2><button type="button" data-friends-confirm-cancel aria-label="关闭友链申请"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
      <div class="friends-confirm-art"><svg class="friends-confirm-cord" viewBox="0 0 400 60" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M-10 8Q100 40 200 32Q300 24 410 8"/></svg><div class="friends-page friends-preview-stage" data-friends-preview-card/><div class="friend-letter-tooltip friend-mobile-bubble friends-confirm-description" data-placement="right" data-friends-preview-description/></div>
      <div class="friends-confirm-notice"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/></svg><div><p><strong>检测到贵站友链地址存在本站后将自动审核通过</strong></p><p data-friends-review-notice hidden/><p>连续7日无法访问时将会被移出纽带。</p></div></div>
      <footer><button type="button" data-friends-confirm-cancel>取消</button><button type="button" data-friends-confirm-submit>提交</button></footer>
    </dialog>
  </section>
}
