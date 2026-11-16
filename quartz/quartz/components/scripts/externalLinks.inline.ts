import { readSiteSettings, siteSettings } from './siteSettings'
import { faviconNeedsPadding, faviconCandidates } from '../../util/favicon'
import { externalDestination } from '../../util/externalLinks'
import { lockPageScroll } from './pageScrollLock'
import { closeSiteDialog, showSiteDialog } from './siteDialog'

// Capture before page-specific handlers, including dynamically rendered comments.
document.addEventListener('nav', () => {
  const controller = new AbortController(), { signal } = controller
  const settingsReady = readSiteSettings()
  let dialog: HTMLDialogElement | undefined, unlock: (() => void) | undefined
  const dismiss = () => { if (dialog) void closeSiteDialog(dialog) }
  const intercept = (event: MouseEvent) => {
    if (event.type === 'auxclick' && event.button !== 1) return
    if (event.type === 'click' && event.button !== 0) return
    const source = event.composedPath().find(node => node instanceof HTMLAnchorElement || node instanceof SVGAElement)
    if (!(source instanceof HTMLAnchorElement || source instanceof SVGAElement)) return
    // Only this dialog's native confirmation link can bypass the guard.
    if (dialog?.contains(source)) return
    const destination = externalDestination(source.getAttribute('href') || '', window.location.href)
    if (!destination) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (dialog?.open) return
    dialog?.remove()
    const current = document.createElement('dialog')
    dialog = current
    current.className = 'activity-details drive-action-dialog external-link-dialog'
    current.setAttribute('aria-labelledby', 'external-link-title')
    current.setAttribute('aria-describedby', 'external-link-address')
    const form = document.createElement('form')
    form.method = 'dialog'
    const header = document.createElement('header')
    header.className = 'activity-details-header'
    const title = document.createElement('strong')
    title.id = 'external-link-title'
    title.textContent = '即将离开微光集'
    const close = document.createElement('button')
    close.type = 'button'
    close.setAttribute('aria-label', '关闭')
    close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
    close.addEventListener('click', dismiss, { signal })
    header.append(title, close)
    const body = document.createElement('div')
    body.className = 'external-link-body'
    const intro = document.createElement('p')
    intro.className = 'external-link-intro'
    intro.textContent = '你将前往以下站点'
    const card = document.createElement('div')
    card.className = 'external-link-destination'
    const identity = document.createElement('div')
    identity.className = 'external-link-identity'
    const icon = document.createElement('span')
    icon.className = 'external-link-symbol'
    icon.setAttribute('aria-hidden', 'true')
    const globe = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5a18 18 0 0 0 14 0M5 17.5a18 18 0 0 1 14 0"/></svg>'
    const loading = document.createElement('span')
    loading.className = 'external-link-icon-loading'
    loading.append(document.createElement('i'))
    icon.append(loading)
    const favicon = document.createElement('img')
    favicon.alt = ''
    favicon.width = favicon.height = 24
    favicon.referrerPolicy = 'no-referrer'
    favicon.crossOrigin = 'anonymous'
    favicon.decoding = 'async'
    favicon.draggable = false
    favicon.setAttribute('no-view', '')
    let settled = false
    let timeout: number | undefined
    const finish = (loaded: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      favicon.onload = favicon.onerror = null
      if (loaded) {
        const isPNG = /\.png$/i.test(new URL(favicon.currentSrc || favicon.src).pathname)
        let padded = !isPNG
        try {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 32
          const context = canvas.getContext('2d', { willReadFrequently: true })
          if (context && !isPNG) {
            context.drawImage(favicon, 0, 0, 32, 32)
            padded = faviconNeedsPadding(context.getImageData(0, 0, 32, 32).data, 32)
          }
        } catch { /* Cross-origin images still display with modest padding. */ }
        icon.classList.toggle('has-icon-padding', padded)
        icon.replaceChildren(favicon)
      }
      else { icon.classList.add('has-icon-padding'); icon.innerHTML = globe; favicon.removeAttribute('src') }
    }
    let candidates: string[] = []
    let candidate = 0, retried = false
    const loadCandidate = () => {
      if (settled) return
      window.clearTimeout(timeout)
      if (candidate >= candidates.length) { finish(false); return }
      retried = false
      favicon.crossOrigin = 'anonymous'
      // A stalled ICO must not prevent trying the PNG alternative.
      timeout = window.setTimeout(nextCandidate, 2500)
      favicon.src = candidates[candidate]
    }
    const nextCandidate = () => { candidate++; loadCandidate() }
    favicon.onload = () => {
      if (favicon.naturalWidth > 0) finish(true)
      else nextCandidate()
    }
    favicon.onerror = () => {
      if (settled) return
      if (!retried) {
        retried = true
        favicon.removeAttribute('crossorigin')
        favicon.src = candidates[candidate]
      } else nextCandidate()
    }
    void settingsReady.then(() => {
      if (settled || signal.aborted) return
      candidates = faviconCandidates(destination, String(siteSettings()['external.favicons'] || ''))
      loadCandidate()
    })
    current.addEventListener('close', () => {
      settled = true
      window.clearTimeout(timeout)
      favicon.onload = favicon.onerror = null
      favicon.removeAttribute('src')
    }, { once: true })
    const details = document.createElement('div')
    details.className = 'external-link-details'
    const name = document.createElement('strong')
    const label = (source.getAttribute('data-external-link-title') || source.querySelector('h1,h2,h3,h4,h5,h6')?.textContent || source.textContent || source.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()
    name.textContent = label && !/^https?:\/\//i.test(label) ? label : destination.hostname
    const host = document.createElement('span')
    host.className = 'external-link-host'
    host.textContent = destination.host
    if (name.textContent !== destination.host) details.append(name, host)
    else details.append(name)
    identity.append(icon, details)
    const address = document.createElement('p')
    address.id = 'external-link-address'
    address.className = 'external-link-address'
    address.textContent = destination.href
    card.append(identity, address)
    body.append(intro, card)
    const footer = document.createElement('div')
    footer.className = 'drive-action-footer'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = '取消'
    cancel.addEventListener('click', dismiss, { signal })
    const proceed = document.createElement('a')
    proceed.className = 'drive-action-submit'
    proceed.append(document.createTextNode('继续访问'))
    const arrow = document.createElement('span')
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>'
    proceed.append(arrow)
    proceed.href = destination.href
    proceed.target = '_blank'
    proceed.rel = 'noopener noreferrer'
    proceed.dataset.routerIgnore = 'true'
    if (source.hasAttribute('download')) proceed.setAttribute('download', source.getAttribute('download') || '')
    proceed.addEventListener('click', dismiss, { signal })
    footer.append(cancel, proceed)
    form.append(header, body, footer)
    current.append(form)
    document.body.append(current)
    let outside = false
    const isOutside = (event: MouseEvent) => {
      const rect = current.getBoundingClientRect()
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
    }
    current.addEventListener('pointerdown', event => { outside = event.target === current && isOutside(event) }, { signal })
    current.addEventListener('click', event => { if (outside && event.target === current && isOutside(event)) dismiss(); outside = false }, { signal })
    let release: (() => void) | undefined
    current.addEventListener('close', () => {
      release?.(); release = undefined
      current.remove()
      if (dialog === current) { dialog = undefined; unlock = undefined }
    }, { once: true })
    showSiteDialog(current)
    release = lockPageScroll({ preserveLayout: true })
    unlock = release
  }
  document.addEventListener('click', intercept, { capture: true, signal })
  document.addEventListener('auxclick', intercept, { capture: true, signal })
  window.addCleanup(() => {
    controller.abort()
    dialog?.close()
    dialog?.remove()
    dialog = undefined
    unlock?.(); unlock = undefined
  })
})
