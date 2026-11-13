import {readSiteSettings} from './siteSettings'
import { syncArtalkNotificationTheme } from "./artalkNotificationTheme"
import { commentAvatar, observeArtalkIdenticons } from "./identicon"
import { alignCommentLayout } from "./commentLayout"
import { observeArtalkAdminLogout, syncArtalkAdminSession, useSiteArtalkAdminVerifier } from "./artalkAdminSession"

// Keep labels consistent after Artalk renders, paginates or updates a vote.
function observeCommentLabels(root: HTMLElement) {
  const update = () => {
    if (root.dataset.adminOnly === "true") for (const notice of root.querySelectorAll(".atk-comment-closed")) notice.remove()
    // Draft restoration stays enabled; its informational toast is unnecessary.
    for (const content of root.querySelectorAll<HTMLElement>(".atk-notify-wrap .atk-notify-content")) {
      if (["内容已自动恢复", "Content has been restored", "內容已自動恢復"].includes(content.textContent?.trim() || "")) content.closest(".atk-notify")?.remove()
    }
    for (const input of root.querySelectorAll<HTMLInputElement>('.atk-main-editor input[name="link"]')) {
      input.value = ""
      input.disabled = true
    }
    for (const link of root.querySelectorAll<HTMLAnchorElement>(".atk-avatar a, .atk-nick a")) {
      link.removeAttribute("href")
      link.removeAttribute("target")
      link.removeAttribute("tabindex")
    }
    for (const label of root.querySelectorAll<HTMLElement>(".atk-collapsed .atk-text")) {
      if (label.textContent?.trim() === "该评论已被系统或管理员折叠") {
        label.textContent = "此消息已被拾光者引入页隙"
      }
    }
    for (const badge of root.querySelectorAll<HTMLElement>(".atk-header .atk-badge")) {
      const admin = ["管理员", "拾光者"].includes(badge.textContent?.trim() || "")
      badge.closest(".atk-header")?.querySelector(".atk-nick")?.classList.toggle("comment-admin-name", admin)
    }
    const adminNames = new Set([...root.querySelectorAll<HTMLElement>(".atk-header > .atk-nick.comment-admin-name")]
      .map(nick => nick.textContent?.trim()).filter(Boolean))
    for (const nick of root.querySelectorAll<HTMLElement>(".atk-reply-at .atk-nick, .atk-reply-to .atk-nick")) {
      nick.classList.toggle("comment-admin-name", adminNames.has(nick.textContent?.trim()))
    }
    for (const action of root.querySelectorAll<HTMLElement>(".atk-actions")) {
      const walker = document.createTreeWalker(action, NodeFilter.SHOW_TEXT)
      let node: Node | null
      while ((node = walker.nextNode())) {
        if (node.textContent?.includes("赞同")) node.textContent = node.textContent.replace(/赞同/g, "共鸣")
      }
    }
  }
  const observer = new MutationObserver(update)
  observer.observe(root, { childList: true, subtree: true, characterData: true })
  update()
  const preventIdentityNavigation = (event: Event) => {
    if (!(event.target instanceof Element) || !event.target.closest(".atk-avatar, .atk-nick, .atk-reply-at")) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  root.addEventListener("click", preventIdentityNavigation, true)
  root.addEventListener("auxclick", preventIdentityNavigation, true)
  return () => {
    observer.disconnect()
    root.removeEventListener("click", preventIdentityNavigation, true)
    root.removeEventListener("auxclick", preventIdentityNavigation, true)
  }
}

// 保存Artalk实例的引用
let artalkInstance: any = null;
let artalkInitializingContainer: HTMLElement | null = null;
let artalkInitializedContainer: HTMLElement | null = null;

// 检查页面是否被加密
const isPageEncrypted = (): boolean => {
  const lockElement = document.getElementById("lock");
  return lockElement !== null;
};

// The page theme is authoritative; never restore an independent Artalk preference.
const syncCommentTheme = () => {
  const isDarkMode = document.documentElement.getAttribute("saved-theme") === "dark"
  if (artalkInstance && typeof artalkInstance.setDarkMode === 'function') {
    try {
      artalkInstance.setDarkMode(isDarkMode)
    } catch (error) {
      console.warn('Could not update Artalk theme:', error)
    }
  }
}
const changeArtalkTheme = () => syncCommentTheme()

// 处理ReaderMode变化
const changeArtalkReaderMode = (e: any) => {
  const mode: string = e.detail.mode
  const artalkContainer = document.getElementById("artalk-comments")
  if (artalkContainer) {
    if (mode === "on") {
      artalkContainer.classList.add("readermode-enabled")
    } else {
      artalkContainer.classList.remove("readermode-enabled")
    }
  }
}

// 初始化ViewImage灯箱功能
const initArtalkImageView = () => {
  // 等待一小段时间确保Artalk图片已渲染
  setTimeout(() => {
    if (window && (window as any).ViewImage) {
      // ViewImage has one global selector. Keep article images in it when Artalk finishes loading.
      (window as any).ViewImage.init('article img, .content img, #artalk-comments img:not(.atk-avatar):not(.atk-emo):not(.atk-item img)');
    } else {
      // 如果ViewImage还未加载，等待其加载后初始化
      const checkViewImage = setInterval(() => {
        if (window && (window as any).ViewImage) {
          clearInterval(checkViewImage);
          (window as any).ViewImage.init('article img, .content img, #artalk-comments img:not(.atk-avatar):not(.atk-emo):not(.atk-item img)');
        }
      }, 100);
      
      // 设置超时以防止无限等待
      setTimeout(() => {
        clearInterval(checkViewImage);
      }, 5000);
    }
  }, 500);
}

// 验证Artalk资源是否真正可用
const isArtalkAvailable = (): boolean => {
  return !!(window as any).Artalk;
};

// 尝试加载Artalk
const tryLoadArtalk = async () => {
  const settingsValues=await readSiteSettings()
  const artalkContainer: HTMLElement | null = document.getElementById("artalk-comments")
  if (!artalkContainer || artalkContainer.hidden || artalkContainer.dataset.driveShareComments === "pending") {
    return;
  }

  // A decrypt event can be delivered more than once after SPA navigation.
  // Only one load/initialization may own a given container.
  if (
    artalkInitializingContainer === artalkContainer ||
    artalkInitializedContainer === artalkContainer
  ) {
    return;
  }

  artalkInitializingContainer = artalkContainer;
  const stopCommentLayout = alignCommentLayout(artalkContainer)
  const releaseInitialization = () => {
    if (artalkInitializingContainer === artalkContainer) {
      artalkInitializingContainer = null;
    }
  };
  if (window && (window as any).addCleanup) {
    (window as any).addCleanup(releaseInitialization)
    ;(window as any).addCleanup(stopCommentLayout)
  }
  
  // 添加loading类以隐藏容器，避免FOUC
  artalkContainer.classList.add("artalk-loading");
  
  const finishLoading = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        artalkContainer.classList.remove("artalk-loading")
      })
    })
  }

  // 动态加载 Artalk CSS。加载期间保持容器隐藏，避免 FOUC。
  const loadArtalkCSS = () => {
    return new Promise<boolean>((resolve) => {
      const server: string = String(settingsValues["api.artalk.publicUrl"] || artalkContainer.getAttribute("data-server") || "")
      const cssUrl: string = `${server}/dist/Artalk.css`
      
      // 检查是否已经加载了相同的CSS
      const existingLink = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          // @ts-ignore
        .find((link: HTMLLinkElement) => link.href === cssUrl) as HTMLLinkElement;
        
      if (existingLink) {
        resolve(true)
        return;
      }

      const link: HTMLLinkElement = document.createElement("link")
      link.rel = "stylesheet"
      link.type = "text/css"
      link.href = cssUrl
      link.crossOrigin = "anonymous";
      
      link.onload = () => {
        resolve(true)
      };
      
      link.onerror = () => {
        console.error('Failed to load Artalk CSS');
        resolve(false)
      };
      
      document.head.appendChild(link)
    });
  }

  // 动态加载 Artalk 脚本。它与 CSS 并行下载，但不会提前初始化。
  const loadArtalk = () => {
    if ((window as any).Artalk) return Promise.resolve(true)

    return new Promise<boolean>((resolve) => {
      const loadFallback = () => {
        const fallbackScript: HTMLScriptElement = document.createElement("script")
        fallbackScript.src = "https://cdn.jsdelivr.net/npm/artalk@2.9.1/dist/Artalk.js"
        fallbackScript.crossOrigin = "anonymous"
        fallbackScript.onload = () => resolve(isArtalkAvailable())
        fallbackScript.onerror = () => resolve(false)
        document.head.appendChild(fallbackScript)
      }

      const artalkScript: HTMLScriptElement = document.createElement("script")
      const server: string = String(settingsValues["api.artalk.publicUrl"] || artalkContainer.getAttribute("data-server") || "")
      artalkScript.src = `${server}/dist/Artalk.js`
      artalkScript.crossOrigin = "anonymous"
      artalkScript.onload = () => resolve(isArtalkAvailable())
      artalkScript.onerror = () => {
        console.error("Failed to load Artalk script from server; trying fallback CDN")
        loadFallback()
      }
      document.head.appendChild(artalkScript)
    })
  }

  // 初始化Artalk
  const initArtalk = () => {
    if (!isArtalkAvailable()) {
      console.error("Artalk is not loaded, hiding comment section")
      artalkContainer.style.display = 'none';
      releaseInitialization()
      return
    }

    const server: string = String(settingsValues["api.artalk.publicUrl"] || artalkContainer.getAttribute("data-server") || "")
    const site: string = artalkContainer.getAttribute("data-site") || ""
    const theme: string = artalkContainer.getAttribute("data-theme") || "light"
    const lang: string = artalkContainer.getAttribute("data-lang") || "zh-CN"
    const useBackendConf: boolean = artalkContainer.getAttribute("data-use-backend-conf") === "true"
    const pageKey: string = artalkContainer.getAttribute("data-page-key") || ""
    const pageTitle: string = artalkContainer.getAttribute("data-page-title") || ""
    const requestedAdminOnly = artalkContainer.getAttribute("data-admin-only") === "true"
    
    const currentTheme: string = document.documentElement.getAttribute('saved-theme') || document.documentElement.getAttribute('data-theme') || 'light'
    const isCurrentlyDark: boolean = currentTheme === 'dark'

      // @ts-ignore - Artalk API
      artalkInstance = (window as any).Artalk.init({
        el: "#artalk-comments",
        pageKey: pageKey,
        pageTitle: pageTitle,
        server: server,
        site: site,
        theme: theme,
        lang: lang,
        darkMode: isCurrentlyDark,
        useBackendConf: useBackendConf,
        pagination: { readMore: true, autoLoad: true },
        avatarURLBuilder: (comment: { email_encrypted?: string; nick?: string; badge_name?: string }) =>
          commentAvatar(comment.email_encrypted?.toLowerCase() || comment.nick || "访客",
            comment.badge_name === "管理员" || comment.badge_name === "拾光者"),
      })
      const stopNotificationTheme = syncArtalkNotificationTheme()
      const stopIdenticons = observeArtalkIdenticons(artalkContainer)
      const stopLabels = observeCommentLabels(artalkContainer)
      artalkInitializedContainer = artalkContainer
      releaseInitialization()

      const currentArtalkInstance = artalkInstance
      const stopAdminVerifier = useSiteArtalkAdminVerifier(currentArtalkInstance)
      const stopAdminLogout = observeArtalkAdminLogout(currentArtalkInstance)
      // Artalk initializes asynchronously; its plugins may reset the user until created.
      const syncAdminLogin = () => { void syncArtalkAdminSession(currentArtalkInstance) }
      currentArtalkInstance.on("created", syncAdminLogin)
      let detachedEditor: HTMLElement | undefined
      const syncRestrictedEditor = (open = false) => {
        if (!requestedAdminOnly || !artalkContainer.isConnected) return
        const admin = Boolean(currentArtalkInstance.ctx?.getUser?.().getData?.().is_admin)
        artalkContainer.dataset.adminEditor = String(admin)
        if (admin) {
          if (detachedEditor) { artalkContainer.prepend(detachedEditor); detachedEditor = undefined }
          if (open) currentArtalkInstance.ctx?.editorPlugs?.getEvents?.().trigger("editor-open")
        } else {
          const editor = artalkContainer.querySelector<HTMLElement>(".atk-main-editor")
          if (editor) { detachedEditor = editor; editor.remove() }
        }
      }
      const refreshEditorAccess = () => queueMicrotask(() => syncRestrictedEditor(true))
      const editorObserver = new MutationObserver(() => syncRestrictedEditor())
      if (requestedAdminOnly) editorObserver.observe(artalkContainer, { childList: true, subtree: true })
      currentArtalkInstance.on("created", refreshEditorAccess)
      currentArtalkInstance.on("user-changed", refreshEditorAccess)
      const removeComments = () => artalkContainer.remove()
      const onPageLoaded = (page: { admin_only?: boolean }) => {
        syncCommentTheme()
        if (page?.admin_only !== requestedAdminOnly) {
          removeComments()
          return
        }
        refreshEditorAccess()
        artalkContainer.classList.remove("artalk-admin-only-pending")
      }
      currentArtalkInstance.on("page-loaded", onPageLoaded)

      syncCommentTheme()

      // 初始化ViewImage灯箱功能
      initArtalkImageView();

      if (window && (window as any).addCleanup) {
        ;(window as any).addCleanup(() => {
          stopNotificationTheme()
          stopAdminLogout()
          stopAdminVerifier()
          stopIdenticons()
          stopLabels()
          currentArtalkInstance.off("page-loaded", onPageLoaded)
          currentArtalkInstance.off("created", refreshEditorAccess)
          currentArtalkInstance.off("created", syncAdminLogin)
          currentArtalkInstance.off("user-changed", refreshEditorAccess)
          editorObserver.disconnect()
          detachedEditor = undefined
          if (artalkInstance === currentArtalkInstance) {
            currentArtalkInstance.destroy?.()
            artalkInstance = null
          }
          if (artalkInitializedContainer === artalkContainer) {
            artalkInitializedContainer = null
          }
        })
      }

    }

    // CSS 与 JS 并行请求；二者就绪后再初始化与显示评论区。
    Promise.all([loadArtalkCSS(), loadArtalk()]).then(([cssLoaded, scriptLoaded]) => {
      if (!cssLoaded || !scriptLoaded) {
        artalkContainer.style.display = "none"
        releaseInitialization()
        console.error("Failed to load Artalk resources")
        return
      }

      initArtalk()
      finishLoading()
    })

  // 监听主题和ReaderMode变化
  document.addEventListener("themechange" as any, changeArtalkTheme)
  document.addEventListener("readermodechange" as any, changeArtalkReaderMode)
  
  if (window && (window as any).addCleanup) {
    (window as any).addCleanup(() => {
      document.removeEventListener("themechange" as any, changeArtalkTheme)
      document.removeEventListener("readermodechange" as any, changeArtalkReaderMode)
    })
  }
};

// 检查页面加密状态并在适当时候加载Artalk
const handleArtalkLoading = () => {
  // 如果页面没有被加密，直接加载Artalk
  if (!isPageEncrypted()) {
    const root = document.getElementById("artalk-comments")
    if (root && root.dataset.driveShareComments !== "pending") root.hidden = false
    tryLoadArtalk();
    return;
  }

  // 如果页面被加密，等待解密完成事件
  const encryptedPageContainer = document.getElementById("artalk-comments")
  const onDecryptComplete = () => {
    // 延迟加载，确保内容已完全替换
    setTimeout(() => {
      // Ignore a deferred event from a page that has already been replaced by SPA navigation.
      if (document.getElementById("artalk-comments") === encryptedPageContainer && !isPageEncrypted()) {
        if (encryptedPageContainer) encryptedPageContainer.hidden = false
        tryLoadArtalk();
      }
    }, 100);
  }
  document.addEventListener('decryptComplete', onDecryptComplete, { once: true });

  // The global nav listener persists across Quartz SPA navigation, so remove
  // this page-specific listener when leaving an encrypted page before decrypting.
  if (window && (window as any).addCleanup) {
    (window as any).addCleanup(() => {
      document.removeEventListener('decryptComplete', onDecryptComplete)
    })
  }
};

// 在导航事件中处理Artalk加载
document.addEventListener("nav", handleArtalkLoading);

// Share pages are initialized only after successful access and server-side permissions.
document.addEventListener("drive-share-comments-ready", handleArtalkLoading)
