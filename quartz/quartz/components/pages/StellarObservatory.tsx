import { QuartzComponent, QuartzComponentConstructor } from '../types'
import StellarAdminConstructor from './StellarAdmin'
import FeedbackForm from '../FeedbackForm'
import feedbackStyle from '../styles/feedback.scss'
// @ts-ignore
import feedbackScript from '../scripts/feedback.inline'
import style from '../styles/stellarObservatory.scss'
// @ts-ignore
import script from '../scripts/stellarObservatory.inline'
const Settings = StellarAdminConstructor()
const StellarObservatory: QuartzComponent = props => <section class="stellar-observatory" data-observatory data-observatory-layout-pending="">
  <p class="observatory-status" data-observatory-status hidden role="status" />
  <div data-observatory-content><div class="observatory-placeholder" aria-hidden="true">
    <section class="observatory-hero">
      <div class="observatory-hero-lead"><span class="observatory-loading-mark observatory-skeleton"/><div class="observatory-host-heading"><div class="observatory-eyebrow"><span>微光集 · 运行状态</span><span class="observatory-state observatory-skeleton">运行中</span></div><h2>Cwl-Server</h2><p>这里记录微光集背后的服务器状态。</p></div></div>
      <div class="observatory-uptime"><span>连续运行</span><strong class="observatory-skeleton">00 天 00 小时 00 分</strong></div>
    </section>
    <div class="observatory-summary">{[['CPU 使用率','CPU'],['内存使用率','RAM'],['磁盘使用率','DISK'],['主机温度','TEMP']].map(([label,code])=><section class="observatory-kpi"><div><span>{label}</span><small>{code}</small></div><strong><span class="observatory-skeleton">00.0 %</span></strong><div class="observatory-meter"/></section>)}</div>
    <section class="observatory-trends">
      <div class="observatory-charts">{[
        ['资源使用','CPU、内存与 GPU 的使用变化',['CPU','内存','GPU']],
        ['网络流量','每秒上传与下载的数据量',['上传','下载']],
        ['磁盘使用','使用率（左刻度）与读写速率（右刻度）',['使用率','读取','写入']],
        ['主机温度','处理器、显卡、SSD、内存及无线网卡温度',['温度']],
        ['系统负载','最近 1、5、15 分钟的平均系统负载',['1 分钟','5 分钟','15 分钟']],
        ['访问人数','按月去重统计，历史不足 30 天时按日展示',['访客']],
      ].map(([title,description,legend],index)=><section class="observatory-chart" data-metric={['resources','network','disk','temperature','load','visitors'][index]}><header><h3>{title}</h3><strong class="observatory-skeleton">00.0</strong></header><p class="observatory-chart-description">{description}</p>{title==='磁盘使用'&&<div class="observatory-chart-scale"><span class="observatory-skeleton">使用率 0–100%</span><span class="observatory-skeleton">读写速率</span></div>}<div class="observatory-plot observatory-skeleton"/><div class="observatory-time-axis"><span class="observatory-skeleton">00:00</span><span class="observatory-skeleton">00:00</span></div><div class="observatory-legend">{(legend as string[]).map(label=><button type="button" disabled tabIndex={-1}><i/>{label}</button>)}</div></section>)}</div>
    </section>
  </div></div>
  <div id="observatory-auth-dialog" class="observatory-dialog observatory-auth-dialog" data-observatory-auth role="dialog" hidden tabIndex={-1} aria-labelledby="observatory-auth-title">
    <header class="observatory-auth-header"><h2 id="observatory-auth-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.3 2.3 4.7-4.6"/></svg><span data-observatory-auth-heading>管理员登录</span></h2><button type="button" data-observatory-auth-close aria-label="关闭登录"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <div data-observatory-auth-form>
      <form class="observatory-login-form" autocomplete="off">
        <div class="observatory-login-field"><div class="observatory-login-password" data-observatory-password /></div>
        <button class="observatory-login-submit" type="submit" disabled><span>登录</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button>
      </form>
    </div>
  </div>
  <dialog id="observatory-manage-dialog" class="observatory-dialog observatory-settings-dialog" data-observatory-manage tabIndex={-1} aria-labelledby="observatory-manage-title">
    <header class="observatory-auth-header"><h2 id="observatory-manage-title">星枢管理</h2><div class="observatory-manage-actions"><button type="button" data-observatory-logout class="observatory-manage-logout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 4H5v16h5m4-12 4 4-4 4M9 12h11"/></svg><span>注销登录</span></button><button type="button" class="observatory-manage-close" data-observatory-manage-close aria-label="关闭星枢管理"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></header>
    <Settings {...props} />
  </dialog>
</section>
StellarObservatory.css = [style,feedbackStyle]
StellarObservatory.afterDOMLoaded = [script,feedbackScript]
export default (() => StellarObservatory) satisfies QuartzComponentConstructor
const ObservatoryNavigation = () => <div class="observatory-navigation" data-observatory-navigation>
  <section class="observatory-journal" aria-labelledby="observatory-journal-title">
    <h3 id="observatory-journal-title" class="observatory-module-heading">运行纪事</h3>
    <div data-observatory-journal class="is-loading" aria-busy="true" aria-label="正在读取运行纪事"><ol aria-hidden="true">{Array.from({length:10},(_,index)=><li><span class="observatory-journal-icon"><span class="observatory-journal-skeleton-icon observatory-journal-skeleton-bar"/></span><div class="observatory-journal-copy"><div class="observatory-journal-heading"><strong class="observatory-journal-skeleton-bar">内容更新</strong><time class="observatory-journal-skeleton-bar">刚刚</time></div><p class="observatory-journal-skeleton-detail"><span class="observatory-journal-skeleton-bar" style={`width:${[75,60,85][index%3]}%`}>正在读取更新记录</span></p></div></li>)}</ol></div>
  </section>
  <section class="observatory-public-services" aria-label="服务状态">
    <h3 class="observatory-module-heading">服务</h3>
    <dl data-observatory-services aria-busy="true"><div class="observatory-services-pending">正在读取服务状态…</div></dl>
  </section>
  <section class="observatory-feedback" aria-labelledby="observatory-feedback-title">
    <h3 id="observatory-feedback-title" class="observatory-module-heading">问题反馈</h3>
    <FeedbackForm />
  </section>
</div>
export const ObservatoryTools: QuartzComponent = () => <section class="observatory-tools">
  <button type="button" class="observatory-tools-launch" data-observatory-tools-open aria-label="打开星枢操作" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9Z" stroke-linejoin="round"/><path d="M8 8h8M8 12h5"/></svg><span>操作</span></button>
  <dialog class="observatory-tools-panel" data-observatory-tools-panel open tabIndex={-1} aria-label="星枢操作">
    <div class="observatory-tools-mobile-heading"><h2>问题反馈</h2><button type="button" data-observatory-tools-close aria-label="关闭操作面板"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
    <ObservatoryNavigation />
  </dialog>
</section>
