import {domainConstellation} from './domainIcons'
import homeConfig from "./config"
import { homeIcons } from "./icons"

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '\"': "&quot;",
        "'": "&#39;",
      })[character]!,
  )

const homeSkeleton = (kind: "profile" | "activity" | "domains" | "calendar" | "visitors") =>
  `<div class="home-skeleton home-skeleton-${kind}" aria-hidden="true"></div>`

// Trusted project-owned markup. Dynamic configuration values are HTML-escaped.
export const renderHomeMarkup = (explore = homeConfig.explore) => `<div class="home-hitokoto">
  <p data-home-hitokoto></p>
  <span data-home-hitokoto-from></span>
</div>

  <div class="home-tiles">
  <div class="home-profile-card" data-home-pending aria-busy="true">
    ${homeSkeleton("profile")}
    <div class="home-avatar-orbit">
    <img class="home-profile-avatar site-profile-avatar" decoding="async" no-view draggable="false" src="${escape(homeConfig.profile.avatar)}" alt="${escape(homeConfig.profile.name)} 的头像" width="200" height="200" />
    </div>
    <div class="home-profile-content">
      <div class="home-profile-name"><span>${escape(homeConfig.profile.name)}</span><span class="home-profile-contacts"><a style="display:inline-flex;width:20px;height:20px;" class="home-contact-link" data-home-qq-contact data-qq="${escape(homeConfig.profile.qq)}" data-qq-qr-code="${escape(homeConfig.profile.qqQrCode)}" aria-haspopup="dialog" aria-expanded="false" href="${escape(homeConfig.profile.qqLink)}" target="_blank" rel="noopener noreferrer" aria-label="添加 QQ 好友：${escape(homeConfig.profile.qq)}" title="添加 QQ 好友：${escape(homeConfig.profile.qq)}">${homeIcons.qq}<span class="home-qq-status" data-home-qq-status data-state="unknown" role="status" aria-label="QQ 状态未知" title="QQ 状态未知 · ${escape(homeConfig.profile.qq)}"></span></a></span></div>
      <a class="home-profile-email" href="mailto:${escape(homeConfig.profile.email)}">${escape(homeConfig.profile.email)}</a>
      <div class="home-profile-stats">
        <a class="home-profile-stat" href="/reading/" title="前往视界">
          <strong data-home-article-count data-home-stat-pending>—</strong>
          <span>篇章</span>
        </a>
        <a class="home-profile-stat" href="/tags/" title="前往流光">
          <strong data-home-tag-count data-home-stat-pending>—</strong>
          <span>标签</span>
        </a>
        <a class="home-profile-rss" href="/index.xml" type="application/rss+xml" target="_blank" rel="noopener noreferrer" data-no-popover="true" data-router-ignore="true" aria-label="RSS 订阅" title="RSS 订阅">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="5" cy="19" r="2" fill="currentColor"/><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
          <span>RSS</span>
        </a>
      </div>
    </div>
  </div>
  <div class="home-activity-card" data-home-activity data-home-pending aria-busy="true" data-activity-api="/api/activitywatch" aria-label="近七日活动统计">
    ${homeSkeleton("activity")}
    <div class="home-activity-header"><div class="home-activity-title"><button type="button" class="home-activity-monitor home-title-action" title="状态未知" aria-label="查看当前活动详情" aria-haspopup="dialog" aria-expanded="false"><span class="home-title-icon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm3.9 5.4-2.7 7.1-7.1 2.7 2.7-7.1 7.1-2.7Zm-3.1 3.1-2.1.8-.8 2.1 2.1-.8.8-2.1Z"/></svg><span class="home-activity-status-dot" data-home-activity-status data-state="unknown" role="status" aria-label="状态未知"></span></span><strong>罗盘</strong></button></div></div>
    <div class="home-activity-current-status" data-activity-current-status role="status">—</div>
    <div class="home-activity-total"><span data-activity-range>近 7 日 总计</span><strong data-activity-total>—</strong></div>
    <div class="home-activity-bar" data-activity-bar role="group" aria-label="活动分类时间光谱"></div>
    <div class="home-activity-categories" data-activity-categories></div>
    <div class="home-activity-status" data-activity-status role="status" hidden></div>
  </div>
  </div>

<section class="home-star-domains" data-home-pending aria-busy="true" aria-label="星域">
  ${homeSkeleton("domains")}
  <div class="home-star-domains-title"><button type="button" class="home-domain-details-open home-title-action" data-domain-details aria-label="查看星域内容分布" aria-haspopup="dialog" aria-expanded="false" title="查看星域统计">${domainConstellation('overview').replace('home-directory-stars','home-title-constellation')}<strong>星域</strong></button></div>
  <div class="home-explore-grid">
${explore.map(item => `<a class="home-explore-item internal" data-no-popover="true" href="${escape(item.href)}">${domainConstellation(item.label)}<strong>${escape(item.label)}</strong><span>${escape(item.description)}</span></a>`).join("\n")}
</div>
</section>

<div class="home-observatory">
<section class="home-attendance" data-home-attendance data-home-pending aria-busy="true" aria-label="出勤日历">
  ${homeSkeleton("calendar")}
  <div class="home-attendance-header">
    <div class="home-attendance-title"><button type="button" class="home-attendance-details-button home-title-action" data-attendance-details aria-label="查看日期详情" title="查看日期详情" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m13 2 2.7 6.3L22 11l-6.3 2.7L13 20l-2.7-6.3L4 11l6.3-2.7L13 2ZM5 2l1.1 2.9L9 6 6.1 7.1 5 10 3.9 7.1 1 6l2.9-1.1L5 2Zm-1 14 1.4 3.6L9 21l-3.6 1.4L4 26l-1.4-3.6L-1 21l3.6-1.4L4 16Z" transform="translate(1 0) scale(.9)"/></svg><strong>星历</strong></button></div>
    <div class="home-attendance-controls">
      <button type="button" data-attendance-prev aria-label="上个月" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
      <span data-attendance-month></span>
      <button type="button" data-attendance-next aria-label="下个月" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
    </div>
  </div>
  <div class="home-attendance-footer"><span data-attendance-summary role="status"><span class="home-attendance-count work">出勤 <span class="home-attendance-count-number">—</span> 天</span><span class="home-attendance-count rest">休息 <span class="home-attendance-count-number">—</span> 天</span><span class="home-attendance-count leave">请假 <span class="home-attendance-count-number">—</span> 天</span></span><span class="home-attendance-note" data-attendance-note></span></div>
  <div class="home-attendance-weekdays" aria-hidden="true"><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span>日</span></div>
  <div class="home-attendance-days" data-attendance-days></div>
</section>
<section class="home-visitors" data-home-visitors data-home-pending aria-busy="true" aria-label="匿名访客统计">
  ${homeSkeleton("visitors")}
  <div class="home-visitors-header">
  <div class="home-visitors-title"><button type="button" class="home-visitors-open home-title-action" data-visitors-open aria-label="查询来访记录" aria-haspopup="dialog" aria-expanded="false" title="查询来访记录"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 2C16 2.4 9.5 5 5.4 9.8a6 6 0 0 1 7.8 1.1C15.1 7.6 18.2 4.3 22 2Z"/><path d="M22 6c-3.3 1.1-6.1 3.5-7.5 6.7a6 6 0 0 1 .3 2.8C16.4 11.7 18.9 8.5 22 6Z" opacity=".6"/><circle cx="8" cy="16" r="5"/><circle cx="6.6" cy="14.6" r="1.35" fill="var(--light)"/></svg><strong>${escape(homeConfig.visitors.title)}</strong></button></div>
  <div class="home-visitors-controls" aria-label="彗星展示时间范围">
    <button type="button" data-visitors-prev aria-label="缩短展示时间范围"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
    <span data-visitors-range aria-live="polite">近30日</span>
    <button type="button" data-visitors-next aria-label="延长展示时间范围"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
  </div>
  </div>
  <div class="home-visitor-summary"><div class="home-visitor-counts"><span><strong data-visitors-total>—</strong><small>累计来访</small></span><span><strong data-visitors-today>—</strong><small>今日来访</small></span></div>
  <div class="home-visitor-status" data-visitor-status role="status" hidden></div></div>
  <div class="home-visitor-sky" data-visitor-sky></div>
</section>
</div>
`
