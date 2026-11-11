import { QuartzComponent, QuartzComponentConstructor } from '../types'
import style from '../styles/stellarAdmin.scss'
// @ts-ignore
import script from '../scripts/stellarAdmin.inline'
const StellarAdmin: QuartzComponent = () => <section class="stellar-admin" data-stellar-admin>
  <div class="stellar-admin-loading" data-stellar-loading role="status"><span class="stellar-admin-loading-symbol" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m16 4 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z"/><circle cx="26" cy="6" r="1.5" fill="currentColor" stroke="none"/></svg></span><strong>正在读取配置</strong><span>稍候，即将进入管理工作区</span><button type="button" data-stellar-retry hidden>重新加载</button></div>
  <div data-stellar-settings hidden><div class="stellar-admin-workspace"><nav class="stellar-admin-navigation" data-stellar-modules role="tablist" aria-label="配置模块" aria-orientation="vertical"/><div class="stellar-admin-content" data-stellar-fields/></div></div>
</section>
StellarAdmin.css = style; StellarAdmin.afterDOMLoaded = script
export default (() => StellarAdmin) satisfies QuartzComponentConstructor
