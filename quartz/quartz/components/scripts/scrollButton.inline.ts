function setupScrollButtons() {
  const scrollTopBtn = document.getElementById("scroll-top")
  const scrollBottomBtn = document.getElementById("scroll-bottom")
  const themeToggleBtn = document.getElementById("theme-toggle")

  if (scrollTopBtn) {
    scrollTopBtn.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      })
    })
  }

  if (scrollBottomBtn) {
    scrollBottomBtn.addEventListener("click", () => {
      const scrollingElement = document.scrollingElement ?? document.documentElement
      // Use every browser-reported document height. `documentElement.scrollHeight`
      // alone can be stale while a long page is finishing its layout.
      const documentHeight = Math.max(
        document.body?.scrollHeight ?? 0,
        document.documentElement.scrollHeight,
        scrollingElement.scrollHeight,
      )
      window.scrollTo({
        top: documentHeight - window.innerHeight,
        behavior: "smooth"
      })
    })
  }
  
  // 检查是否为纯净模式
  const urlParams = new URLSearchParams(window.location.search)
  const isPureMode = urlParams.get('pure') === 'true'
  
  // 控制主题切换按钮的显示/隐藏
  if (themeToggleBtn) {
    if (isPureMode) {
      // 在纯净模式下显示主题切换按钮
      themeToggleBtn.style.display = 'flex'
      // 更新图标
      updateThemeIcon()
    } else {
      // 不在纯净模式下时隐藏主题切换按钮
      themeToggleBtn.style.display = 'none'
    }
    
    // 仅在纯净模式下添加主题切换功能
    if (isPureMode) {
      // 移除可能存在的旧事件监听器
      themeToggleBtn.onclick = null;
      themeToggleBtn.addEventListener("click", handleThemeToggle);
    }
  }
  
  // 监听主题变化事件，更新图标
  document.addEventListener('themechange', updateThemeIcon)
}

function handleThemeToggle() {
  // 通过模拟点击任意一个现有的暗色模式按钮来触发主题切换
  // 查找页面上的任意暗色模式按钮并模拟点击
  const existingDarkModeButtons = document.querySelectorAll('.darkmode');
  if (existingDarkModeButtons.length > 0) {
    // 如果有现有的暗色模式按钮，直接触发点击
    (existingDarkModeButtons[0] as HTMLElement).click();
  } else {
    // 如果没有现有的暗色模式按钮，手动切换主题
    const currentTheme = document.documentElement.getAttribute("saved-theme")
    const newTheme = currentTheme === "dark" ? "light" : "dark"
    
    // 设置新主题
    document.documentElement.setAttribute("saved-theme", newTheme)
    localStorage.setItem("theme", newTheme)
    
    // 触发主题变更事件，让其他组件可以响应
    const event = new CustomEvent("themechange", {
      detail: { theme: newTheme },
    })
    document.dispatchEvent(event)
  }
}

function updateThemeIcon() {
  const themeToggleIcon = document.getElementById("theme-toggle-icon")
  if (!themeToggleIcon) return
  
  const currentTheme = document.documentElement.getAttribute("saved-theme")
  
  // 根据要求：深色时显示太阳（亮色模式图标），浅色时显示月亮（深色模式图标）
  if (currentTheme === "dark") {
    // 深色模式下显示太阳图标
    (themeToggleIcon as HTMLElement).innerHTML = `
      <circle cx="12" cy="12" r="5" fill="none"></circle>
      <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="1.6"></line>
      <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="1.6"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="1.6"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="1.6"></line>
      <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="1.6"></line>
      <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="1.6"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="1.6"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="1.6"></line>
    `
  } else {
    // 浅色模式下显示月亮图标
    (themeToggleIcon as HTMLElement).innerHTML = `
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="none"></path>
    `
  }
}

// Wait for DOM to be fully loaded before setting up event listeners
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupScrollButtons)
} else {
  setupScrollButtons()
}

// Also listen for navigation events which may re-render the page
document.addEventListener("nav", () => {
  setTimeout(setupScrollButtons, 100) // Small delay to ensure DOM is updated
})
