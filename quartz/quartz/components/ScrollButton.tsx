// @ts-ignore
import script from "./scripts/scrollButton.inline"
import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import style from "./styles/scrollButton.scss"

interface ScrollButtonOptions {
  /**
   * Position of the scroll button
   */
  position: "bottom-right"
  /**
   * Show scroll button only on desktop
   */
  showOnlyOnDesktop: boolean
}

const defaultOptions: ScrollButtonOptions = {
  position: "bottom-right",
  showOnlyOnDesktop: true,
}

export default ((opts?: Partial<ScrollButtonOptions>) => {
  const options: ScrollButtonOptions = { ...defaultOptions, ...opts }

  function ScrollButton({ displayClass }: QuartzComponentProps) {
    const showOnlyOnDesktopClass = options.showOnlyOnDesktop ? "desktop-only" : ""
    
    return (
      <div
        class={classNames(
          displayClass,
          "scroll-buttons",
          showOnlyOnDesktopClass
        )}
      >
        {/* 纯净模式下的主题切换按钮，将在客户端JavaScript中控制显示 */}
        <button id="theme-toggle" class="scroll-btn theme-toggle-btn pure-mode-only" aria-label="切换主题" title="切换主题" style={{ display: 'none' }}>
          {/* SVG图标将在JavaScript中根据主题动态设置 */}
          <svg
            id="theme-toggle-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* 默认显示太阳图标 - 在深色模式下显示 */}
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
        </button>
        
        <button id="scroll-top" class="scroll-btn" aria-label="回到顶部" title="回到顶部">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button id="scroll-bottom" class="scroll-btn" aria-label="前往底部" title="前往底部">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
    )
  }

  ScrollButton.css = style
  ScrollButton.afterDOMLoaded = script

  return ScrollButton
}) satisfies QuartzComponentConstructor