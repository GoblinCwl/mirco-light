import type { QuartzComponent, QuartzComponentConstructor } from "./types"
import style from "./styles/agentChat.scss"
// @ts-ignore
import script from "./scripts/agentChat.inline"

function AgentIcon() {
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true" fill="none" stroke="currentColor"
      stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <g transform="translate(2 2)">
        <rect x="5" y="10" width="22" height="18" rx="7" />
        <path d="M16 10V6" />
        <path d="M16 6Q9 7 8 1Q15 0 16 6Z M16 6Q23 7 24 1Q17 0 16 6Z" fill="currentColor" stroke="none" />
        <circle cx="11.5" cy="18" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="20.5" cy="18" r="1.6" fill="currentColor" stroke="none" />
        <path d="M5 17C-8 27 6 31 19 27 C31 23 38 15 27 15" />
        <path class="agent-chat-spark" d="M28 2Q29 6 33 7Q29 8 28 12 Q27 8 23 7Q27 6 28 2Z" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}

const AgentChat: QuartzComponent = ({ cfg, fileData }) => (
  <>
    <button class="agent-chat-trigger" type="button" aria-label="星芽"
      aria-haspopup="dialog" aria-controls="agent-chat-dialog" aria-expanded="false">
      <AgentIcon />
    </button>
    <dialog id="agent-chat-dialog" class="activity-details agent-chat-dialog" aria-labelledby="agent-chat-title" aria-describedby="agent-chat-description">
      <div class="activity-details-header">
        <h2 class="agent-chat-heading">
          <strong id="agent-chat-title"><AgentIcon /><span>星芽</span></strong>
          <span id="agent-chat-description" class="agent-chat-description">诞生于微光集深处，由知识与记忆孕育而成的生命。</span>
        </h2>
        <button data-agent-chat-clear type="button" aria-label="清空历史" title="清空历史" aria-haspopup="dialog" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14M10 10v6m4-6v6" />
          </svg>
        </button>
        <button data-agent-chat-close type="button" aria-label="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div class="agent-chat-thread" aria-label="对话">
        <div class="activity-details-loading agent-chat-history-loading" role="status" aria-label="正在加载聊天记录">
          <span class="activity-details-spinner" aria-hidden="true" />
        </div>
        <div class="agent-chat-message">
          <img class="agent-chat-avatar agent-chat-avatar--starbud" src="/static/Starbud_transparent.webp" alt="" width={42} height={42} decoding="async" no-view />
          <p class="agent-chat-bubble">你好，旅人。我是星芽，诞生于微光集深处的一缕意识。</p>
        </div>
        <div class="agent-chat-history" role="log" aria-label="聊天记录"></div>
      </div>
      <form class="agent-chat-composer">
        <div class="agent-chat-page-context" data-title-suffix={cfg.pageTitleSuffix ?? ""} data-article={fileData.relativePath?.endsWith(".md") ? "" : undefined}>
          <span class="agent-chat-page-icon" aria-hidden="true" />
          <span class="agent-chat-page-name" />
        </div>
        <div class="agent-chat-input">
          <span class="agent-chat-quota-control">
            <span class="agent-chat-quota" role="progressbar" tabindex={0} aria-label="今日对话额度" aria-valuetext="正在读取今日对话额度">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="3.25" aria-hidden="true">
                <circle class="agent-chat-quota-track" cx="12" cy="12" r="9" />
                <circle class="agent-chat-quota-fill" cx="12" cy="12" r="9" pathLength="100"
                  stroke-dasharray="100 100" stroke-dashoffset="100" stroke-linecap="round" transform="rotate(-90 12 12)" />
              </svg>
            </span>
            <span class="agent-chat-quota-tooltip" aria-hidden="true">正在读取今日对话额度</span>
          </span>
          <div class="agent-chat-entry" data-empty="">
            <textarea rows={1} maxlength={2000} aria-placeholder="问问星芽…" aria-label="输入你的问题" />
            <span class="agent-chat-placeholder" aria-hidden="true">问问星芽…</span>
          </div>
          <button type="submit" disabled aria-label="发送消息">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 19V5m-5 5 5-5 5 5" />
            </svg>
          </button>
        </div>
      </form>
    </dialog>
  </>
)

AgentChat.css = style
AgentChat.afterDOMLoaded = script

export default (() => AgentChat) satisfies QuartzComponentConstructor
