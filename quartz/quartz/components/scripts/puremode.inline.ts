(function checkPureMode() {
  function applyPureMode() {
    const urlParams = new URLSearchParams(window.location.search)
    const isHome = document.body.dataset.slug === 'index'
    if (isHome && urlParams.has('pure')) {
      const url = new URL(window.location.href)
      url.searchParams.delete('pure')
      window.history.replaceState(window.history.state, '', url)
    }
    const isPureMode = !isHome && urlParams.get('pure') === 'true'
    
    if (isPureMode) {
      // 添加纯净模式类
      document.documentElement.classList.add('pure-mode')
      document.body.classList.add('pure-mode')
      
      // 更新页脚内容
      updateFooterForPureMode()
    } else {
      // 如果不是纯净模式，移除相关类
      document.documentElement.classList.remove('pure-mode')
      document.body.classList.remove('pure-mode')
    }
  }
  
  function updateFooterForPureMode() {
    // 获取当前URL但移除pure参数
    const currentUrl = new URL(window.location.href)
    currentUrl.searchParams.delete('pure')
    
    // 获取页面标题或路径作为显示文本
    const pageTitle = document.title || currentUrl.pathname.split('/').pop() || 'Page'
    
    // Only replace the site footer, not footers embedded in article content.
    const footers = document.querySelectorAll('#quartz-body > footer')
    footers.forEach(footer => {
      // 创建新的纯净模式页脚内容
      const footerDiv = document.createElement('div')
      footerDiv.className = 'pure-mode-footer'
      // Leaving pure mode must not be swallowed by an in-progress SPA navigation.
      // Use a native page load so this link is always responsive.
      const link = document.createElement('a')
      link.href = currentUrl.href
      link.setAttribute('data-router-ignore', '')
      link.textContent = pageTitle
      footerDiv.append('pure mode from ', link)
      
      // 替换页脚内容
      footer.innerHTML = ''
      footer.appendChild(footerDiv)
    })
  }
  
  // 初始执行
  applyPureMode()
  
  // 监听浏览器前进/后退事件
  window.addEventListener('popstate', applyPureMode)
  
  // 监听Quartz SPA自定义事件（如果存在）
  if (typeof document !== 'undefined') {
    document.addEventListener('nav', applyPureMode)
  }
})();
