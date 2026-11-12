import { unlockedIcon } from "../../util/encryptedIcon"
import { showPasswordToast } from "./passwordFeedback"
import {base64} from "rfc4648"

// @ts-ignore:next-line
function find<T>(selector: string): T {
  return document.querySelector(selector) as T
}

let salt: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, iterations: number
let salt_toc: Uint8Array, iv_toc: Uint8Array, ciphertext_toc: Uint8Array, iterations_toc: number
const subtle = window.crypto?.subtle || (window.crypto as any)?.webkitSubtle
type CachedKey = { key: CryptoKey; expires: number }
const inMemoryKeys = new Map<string, { content?: CachedKey; toc?: CachedKey }>()
const CACHE_TTL = 12 * 60 * 60 * 1000
const CACHE_PREFIX = "quartz-encrypted"
let currentCacheId = ""

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
const storageKey = (cacheId: string, kind: "content" | "toc") => `${CACHE_PREFIX}:${cacheId}:${kind}`
const buildCacheId = (slug: string, salt: Uint8Array, saltToc: Uint8Array) =>
  `${slug}:v2:${hex(salt.slice(0, 16))}:${hex(saltToc.slice(0, 16))}`

function getMemoryKey(cacheId: string, kind: "content" | "toc") {
  const entry = inMemoryKeys.get(cacheId)
  const cached = entry?.[kind]
  if (!cached) return undefined
  if (cached.expires <= Date.now()) {
    delete entry[kind]
    return undefined
  }
  return cached.key
}

function readStoredEntry(cacheId: string, kind: "content" | "toc") {
  const key = storageKey(cacheId, kind)
  try {
    for (const storage of [localStorage, sessionStorage]) {
      const raw = storage.getItem(key)
      if (!raw) continue
      let parsed: { key?: JsonWebKey; expires?: number }
      try { parsed = JSON.parse(raw) } catch { storage.removeItem(key); continue }
      if (!parsed.key || typeof parsed.expires !== "number" || parsed.expires <= Date.now()) {
        storage.removeItem(key)
        continue
      }
      // Carry existing tab-scoped caches forward without changing their expiry.
      localStorage.setItem(key, raw)
      sessionStorage.removeItem(key)
      return parsed
    }
  } catch {
    return undefined
  }
}

function hasCachedKey(cacheId: string, kind: "content" | "toc") {
  return Boolean(getMemoryKey(cacheId, kind) || readStoredEntry(cacheId, kind))
}

async function storeKey(cacheId: string, kind: "content" | "toc", key: CryptoKey) {
  const expires = Date.now() + CACHE_TTL
  const entry = inMemoryKeys.get(cacheId) ?? {}
  entry[kind] = { key, expires }
  inMemoryKeys.set(cacheId, entry)
  try {
    localStorage.setItem(
      storageKey(cacheId, kind),
      JSON.stringify({ key: await subtle.exportKey("jwk", key), expires }),
    )
  } catch {
    // Storage can be unavailable; the in-memory key still works.
  }
}

function clearCache(cacheId: string) {
  inMemoryKeys.delete(cacheId)
  try {
    for (const kind of ["content", "toc"] as const) {
      const key = storageKey(cacheId, kind)
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    }
  } catch { /* In-memory keys were already cleared. */ }
}

function cleanupCaches(slug: string, cacheId: string) {
  // Remove the old (<slug>_content) format and any cache for another build.
  try {
    localStorage.removeItem(`${slug}_content`)
    localStorage.removeItem(`${slug}_toc`)
    const prefix = `${CACHE_PREFIX}:${slug}:`
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index)
      if (!key) continue
      if (key.startsWith(prefix) && !key.startsWith(`${CACHE_PREFIX}:${cacheId}:`)) {
        localStorage.removeItem(key)
      }
    }
  } catch { /* Storage can be disabled; keep using memory keys. */ }
  for (const key of [...inMemoryKeys.keys()]) {
    if (key.startsWith(`${slug}:`) && key !== cacheId) inMemoryKeys.delete(key)
  }
}

let form: HTMLFormElement, pwd: HTMLInputElement,
    lock: HTMLDivElement, errorMessage: HTMLElement, article: HTMLElement,
    article_graph: HTMLElement
let decryptedTocTrackingCleanup: (() => void) | undefined
let pageVersion = 0
let payloadController: AbortController | undefined
let payloadLoaded = false
let decrypting = false

async function decryptHTML() {
  ++pageVersion
  payloadController?.abort()
  payloadLoaded = false
  decrypting = false
  currentCacheId = ""
  form = find("#lockForm");
  pwd = find(".pwd"); lock = find("#lock"); errorMessage = find("#error-msg"); article = find("#content")
  article_graph = find(".sidebar.right > .graph") ?? find(".graph")

  if (!lock || !form || !pwd) return
  const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement
  const passwordVisibilityToggle = find<HTMLButtonElement>("#toggle-password-visibility")
  const updateSubmitState = () => {
    submitBtn.disabled = decrypting || pwd.value.length === 0
  }
  const prefilledPassword = new URLSearchParams(location.search).get("p")
  pwd.value = prefilledPassword ?? ""
  if (!subtle) {
    show(lock)
    pwd.disabled = true
    error("modern")
    return
  }
  if (!lock.dataset.payloadUrl) {
    show(lock)
    pwd.disabled = true
    error("empty")
    return
  }

  window.addCleanup(() => { ++pageVersion; payloadController?.abort() })

  form.addEventListener("submit", (event) => { event.preventDefault(); decrypt() })
  pwd.addEventListener("input", updateSubmitState)
  passwordVisibilityToggle?.addEventListener("click", () => {
    const isPlaintext = pwd.classList.toggle("show-plain")
    const label = isPlaintext ? "隐藏密码" : "显示密码"
    passwordVisibilityToggle.setAttribute("aria-label", label)
    passwordVisibilityToggle.setAttribute("title", label)
    passwordVisibilityToggle.setAttribute("aria-pressed", String(isPlaintext))
    const icon = passwordVisibilityToggle.querySelector("svg")
    if (icon) icon.innerHTML = isPlaintext
      ? '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.9M6.6 6.6A19 19 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.4-1.6"/>'
      : '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>'
  })

  updateSubmitState()
  show(lock)
  currentCacheId = lock.dataset.cacheId || ""
  if (prefilledPassword || (currentCacheId && hasCachedKey(currentCacheId, "content") && hasCachedKey(currentCacheId, "toc"))) {
    void decrypt()
  }

}

document.addEventListener("nav", decryptHTML)

function show(element: Element) { element.classList.remove("hidden") }
function hide(element: Element) { element.classList.add("hidden") }

function error(code: string) {
  showPasswordToast(
    code === "wrong" ? "密码错误，请重试。" : errorMessage.getAttribute(`data-${code}`) || "",
    code === "wrong",
  )
}

function revealTocEntry(tocEntry: Element) {
  const tocContent = tocEntry.closest(".toc-content") as HTMLElement | null
  if (!tocContent || tocContent.scrollHeight <= tocContent.clientHeight) return

  const entryBounds = tocEntry.getBoundingClientRect()
  const contentBounds = tocContent.getBoundingClientRect()
  if (entryBounds.top >= contentBounds.top && entryBounds.bottom <= contentBounds.bottom) return

  tocContent.scrollTo({
    top: Math.max(
      0,
      tocContent.scrollTop + entryBounds.top - contentBounds.top -
        (tocContent.clientHeight - entryBounds.height) / 2,
    ),
    behavior: "smooth",
  })
}

function setupDecryptedTocTracking() {
  decryptedTocTrackingCleanup?.()

  const toc = document.getElementById("decrypted-toc")
  if (!toc) return

  const headers = Array.from(document.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]"))
  const tocEntries = new Map<string, HTMLAnchorElement>()
  toc.querySelectorAll<HTMLAnchorElement>("a[data-for]").forEach((entry) => {
    const slug = entry.dataset.for
    if (slug) tocEntries.set(slug, entry)
  })

  let animationFrame: number | undefined
  const update = () => {
    animationFrame = undefined
    let latestVisibleEntry: HTMLAnchorElement | undefined

    for (const header of headers) {
      const tocEntry = tocEntries.get(header.id)
      if (!tocEntry) continue

      const isInView = header.getBoundingClientRect().top < window.innerHeight
      tocEntry.classList.toggle("in-view", isInView)
      if (isInView) latestVisibleEntry = tocEntry
    }

    if (latestVisibleEntry) revealTocEntry(latestVisibleEntry)
  }
  const scheduleUpdate = () => {
    if (animationFrame === undefined) animationFrame = requestAnimationFrame(update)
  }

  window.addEventListener("scroll", scheduleUpdate, { passive: true })
  window.addEventListener("resize", scheduleUpdate)
  window.addEventListener("hashchange", scheduleUpdate)
  update()

  decryptedTocTrackingCleanup = () => {
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
    window.removeEventListener("scroll", scheduleUpdate)
    window.removeEventListener("resize", scheduleUpdate)
    window.removeEventListener("hashchange", scheduleUpdate)
  }
}

async function loadEncryptedPayload(version: number) {
  if (payloadLoaded) return
  payloadController = new AbortController()
  const response = await fetch(lock.dataset.payloadUrl!, {
    signal: AbortSignal.any([payloadController.signal, AbortSignal.timeout(20000)]),
    credentials: "omit",
  })
  if (!response.ok) throw new Error("Payload unavailable")
  const payload = await response.json()
  if (version !== pageVersion) return
  if (typeof payload.content !== "string" || typeof payload.toc !== "string" || !Number.isSafeInteger(payload.iterations) || payload.iterations < 1) throw new Error("Invalid payload")
  const contentBytes = base64.parse(payload.content)
  const tocBytes = base64.parse(payload.toc)
  if (contentBytes.length < 64 || tocBytes.length < 64) throw new Error("Invalid payload")
  salt = contentBytes.slice(0, 32); iv = contentBytes.slice(32, 48); ciphertext = contentBytes.slice(48)
  salt_toc = tocBytes.slice(0, 32); iv_toc = tocBytes.slice(32, 48); ciphertext_toc = tocBytes.slice(48)
  iterations = iterations_toc = payload.iterations
  const slug = document.body.dataset.slug!
  currentCacheId = buildCacheId(slug, salt, salt_toc)
  cleanupCaches(slug, currentCacheId)
  if (hasCachedKey(currentCacheId, "content") !== hasCachedKey(currentCacheId, "toc")) clearCache(currentCacheId)
  payloadLoaded = true
}

async function decrypt() {
  if (decrypting) return
  const version = pageVersion
  const typedPassword = pwd.value.length > 0
  const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement
  const visibilityBtn = form.querySelector<HTMLButtonElement>("#toggle-password-visibility")
  const submitLabel = submitBtn.getAttribute("aria-label")
  let restoreFocus = false
  const hasCachedPair =
    hasCachedKey(currentCacheId, "content") && hasCachedKey(currentCacheId, "toc")
  if (pwd.value.length === 0 && !hasCachedPair) return

  decrypting = true
  submitBtn.disabled = true
  pwd.disabled = true
  if (visibilityBtn) visibilityBtn.disabled = true
  submitBtn.setAttribute("aria-busy", "true")
  submitBtn.setAttribute("aria-label", "正在加载并解密")
  form.setAttribute("aria-busy", "true")

  try {
    await loadEncryptedPayload(version)
    if (version !== pageVersion) return
    const [contentHtml, tocHtml] = await Promise.all([
      decryptFile({salt, iv, ciphertext, iterations}, pwd.value),
      decryptFile_toc({salt_toc, iv_toc, ciphertext_toc, iterations_toc}, pwd.value),
    ])
    if (version !== pageVersion) return
    hide(lock)
    const titleLock = document.querySelector<HTMLElement>(".article-title .encrypted-mark")
    if (titleLock) {
      titleLock.innerHTML = unlockedIcon
      titleLock.dataset.lockState = "unlocked"
      titleLock.setAttribute("aria-label", "已解锁")
    }

    article.innerHTML = contentHtml
    // Decryption can be retried or completed by more than one pending callback.
    // Content is replaced above, so give the separately inserted TOC the same
    // idempotent behaviour instead of appending duplicate navigation blocks.
    document.getElementById("decrypted-toc")?.remove()
    const tocAnchor = article_graph ?? article
    // The TOC must remain a direct sidebar flex item; an extra wrapper removes
    // its constrained height and prevents the list from scrolling.
    tocAnchor.insertAdjacentHTML("afterend", tocHtml)
    const decryptedToc = tocAnchor.nextElementSibling as HTMLElement | null
    decryptedToc?.setAttribute("id", "decrypted-toc")

    setupDecryptedTocTracking()

    // 触发解密完成事件，通知其他组件（如Artalk）可以加载了
    const decryptCompleteEvent = new CustomEvent('decryptComplete', {
      detail: { success: true },
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(decryptCompleteEvent);
    pwd.value = ""
  } catch (e) {
    if (version !== pageVersion) return
    restoreFocus = true
    if (!payloadLoaded) {
      showPasswordToast("加密内容加载失败，请重试。", true)
      return
    }
    const hadCache =
      hasCachedKey(currentCacheId, "content") || hasCachedKey(currentCacheId, "toc")
    clearCache(currentCacheId)
    if (typedPassword || !hadCache) error("wrong")
    show(lock)
    pwd.value = ""
  } finally {
    if (version === pageVersion) {
      decrypting = false
      form.setAttribute("aria-busy", "false")
      pwd.disabled = false
      if (visibilityBtn) visibilityBtn.disabled = false
      submitBtn.removeAttribute("aria-busy")
      if (submitLabel) submitBtn.setAttribute("aria-label", submitLabel)
      else submitBtn.removeAttribute("aria-label")
      submitBtn.disabled = pwd.value.length === 0
      if (restoreFocus) pwd.focus()
    }
  }
}

async function deriveKey(salt: Uint8Array, password: string, iterations: number) {
  const encoder = new TextEncoder()
  const baseKey = await subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"])
  return await subtle.deriveKey(
      // @ts-ignore
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, true, ["decrypt"]
  )
}

async function importKey(key: JsonWebKey) {
  return subtle.importKey("jwk", key, "AES-GCM", true, ["decrypt"])
}

async function decryptFile({ salt, iv, ciphertext, iterations }: {
  salt: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, iterations: number
}, password: string) {
  const cacheId = currentCacheId
  const decoder = new TextDecoder()
  const memory = password ? undefined : getMemoryKey(cacheId, "content")
  const stored = password || memory ? undefined : readStoredEntry(cacheId, "content")
  const key = memory ?? (stored?.key
    ? await importKey(stored.key)
    : await deriveKey(salt, password, iterations))

  // @ts-ignore
  const data = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext))
  if (!data) throw "Malformed data"

  await storeKey(cacheId, "content", key)
  return decoder.decode(data)
}

async function decryptFile_toc({ salt_toc, iv_toc, ciphertext_toc, iterations_toc }: {
  salt_toc: Uint8Array, iv_toc: Uint8Array, ciphertext_toc: Uint8Array, iterations_toc: number
}, password: string) {
  const cacheId = currentCacheId
  const decoder = new TextDecoder()
  const memory = password ? undefined : getMemoryKey(cacheId, "toc")
  const stored = password || memory ? undefined : readStoredEntry(cacheId, "toc")
  const key = memory ?? (stored?.key
    ? await importKey(stored.key)
    : await deriveKey(salt_toc, password, iterations_toc))

  // @ts-ignore
  const data = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv:iv_toc }, key, ciphertext_toc))
  if (!data) throw "Malformed data"

  await storeKey(cacheId, "toc", key)
  return decoder.decode(data)
}
