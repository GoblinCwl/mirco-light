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

const AgentChat: QuartzComponent = () => (
  <>
    <button class="agent-chat-trigger" type="button" aria-label="星芽"
      aria-haspopup="dialog" aria-controls="agent-chat-dialog" aria-expanded="false">
      <AgentIcon />
    </button>
    <dialog id="agent-chat-dialog" class="activity-details agent-chat-dialog" aria-labelledby="agent-chat-title">
      <div class="activity-details-header">
        <strong id="agent-chat-title">星芽</strong>
        <button data-agent-chat-close type="button" aria-label="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div class="agent-chat-thread" aria-label="对话">
        <div class="agent-chat-intro">
          <svg class="agent-chat-orbits" viewBox="0 0 160 82" fill="none" aria-hidden="true">
            <ellipse cx="82" cy="42" rx="64" ry="22" transform="rotate(-19 82 42)" stroke="currentColor" stroke-opacity=".45" />
            <ellipse cx="82" cy="42" rx="51" ry="16" transform="rotate(19 82 42)" stroke="currentColor" stroke-opacity=".29" stroke-dasharray="2 4" />
            <path d="M106 12c1.4 7.4 3.6 9.6 11 11-7.4 1.4-9.6 3.6-11 11-1.4-7.4-3.6-9.6-11-11 7.4-1.4 9.6-3.6 11-11ZM54 48c.7 3.8 2.2 5.3 6 6-3.8.7-5.3 2.2-6 6-.7-3.8-2.2-5.3-6-6 3.8-.7 5.3-2.2 6-6Z" fill="currentColor" />
            <circle cx="22" cy="58" r="2.2" fill="currentColor" />
            <circle cx="129" cy="55" r="1.7" fill="currentColor" />
          </svg>
          <p>一株诞生于微光集深处的星芽，由知识与记忆孕育而成的宇宙生命。</p>
        </div>
        <div class="agent-chat-message">
          <img class="agent-chat-avatar" src="/static/Starbud_compressed.png" alt="" width={42} height={42} decoding="async" no-view />
          <p>想聊聊微光集里的什么？</p>
        </div>
      </div>
      <div class="agent-chat-composer">
        <div class="agent-chat-input">
          <textarea rows={1} placeholder="问问星芽…" aria-label="输入你的问题" />
          <button type="button" disabled aria-label="发送消息">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 19V5m-5 5 5-5 5 5" />
            </svg>
          </button>
        </div>
      </div>
    </dialog>
  </>
)

AgentChat.css = style
AgentChat.afterDOMLoaded = script

export default (() => AgentChat) satisfies QuartzComponentConstructor
