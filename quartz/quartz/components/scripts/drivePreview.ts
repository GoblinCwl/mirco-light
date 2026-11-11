import {readPlayerAsset} from "./playerAssetCache"
import {mountPlayerPanels,setupPlayerPanelHost} from "./playerPanels"
import { mountPlayerFullscreen } from "./playerFullscreen"
import { sandboxJSON as safeJSON } from "./preview/sandboxJSON"
import { playerIcons } from "./jellyfin/icons"
import { initialJellyfinSubtitle } from "./jellyfinSubtitleSelection"
import { openSubtitleAppearanceDialog } from "./subtitleAppearanceDialog"
import {playerStyles} from "./videoPlayerStyles"
import {jellyfinDeviceProfile,jellyfinAutoBitrate,jellyfinHlsMode,jellyfinHlsBuffer,jellyfinSubtitleBurnIn} from "./jellyfinCapabilities"
import {subtitleNeedsBurn} from './jellyfinSubtitlePolicy'
import { resumeSeekTarget } from "./videoResume"
import { embeddedASSFont } from "./assFonts"
import { preferredSubtitle } from "./driveSubtitleSelection"
import { readSiteSettings } from "./siteSettings"
import { readVideoProgress, saveVideoProgress } from "./driveVideoProgress"
import { trackDriveResponse } from "./driveFileDownload"
import { beginDriveLoading, driveFileProgress } from "./driveLoading"
import { driveTextEncodings, canDecodeDriveEncoding } from "./driveEncodings"
import { renderDriveImage } from "./driveImagePreview"
import { setupPreviewWebFullscreen } from "./drivePreviewFullscreen"
import { driveRequest, driveRoute, driveHref } from "./driveClient"
import { DRIVE_ORIGIN, driveApiUrl, drivePreviewKind, driveSize } from "./openlistShared"
import { fileIconForName, node } from "./driveUi"
import { initialVideoQuality, nativePdfUrl, previewChoices, previewScheme, type PreviewFile, type PreviewSettings } from "./drivePreviewOptions"
import {previewSandboxRuntime} from "./drivePreviewSandbox"
import type {SandboxPreview} from "./preview/sandboxTypes"
import {renderSandboxVideo} from "./preview/videoRenderer"
import { matroskaReaderUrl } from "./matroskaReaderVersion"
import { renderDriveArchive, type PreviewAccess } from "./driveArchivePreview"
import { fallbackVideoScope, readVideoPreferences, saveVideoPreferences, type VideoScope } from "./driveVideoPreferences"
let cached: { at: number; value: PreviewSettings } | undefined
async function settings(signal: AbortSignal) {
  if (cached && Date.now() - cached.at < 300000) return cached.value
  const value = await driveRequest<PreviewSettings>("public/settings", undefined, { anonymous: true, signal })
  cached = { at: Date.now(), value }; return value
}
const colors = () => {
  const style = getComputedStyle(document.documentElement)
  return { background: style.getPropertyValue("--moreLight").trim(), foreground: style.getPropertyValue("--darkgray").trim(), muted: style.getPropertyValue("--gray").trim(), accent: style.getPropertyValue("--secondary").trim(), border: style.getPropertyValue("--lightgray").trim() }
}
const theme = () => document.documentElement.getAttribute("saved-theme") || "light"
export function setupDrivePreview(body: HTMLElement, lifecycle: AbortSignal) {
  const chooser = document.querySelector<HTMLElement>("[data-drive-preview-selector]")!
  const select = chooser.querySelector<HTMLSelectElement>("select")!
  const encodingLabel = node("label", "文本编码", "drive-preview-encoding"), encoding = node("select")
  encoding.setAttribute("aria-label", "文本编码")
  for (const value of driveTextEncodings) {
    const option = node("option", value.toUpperCase()); option.value = value
    option.disabled = !canDecodeDriveEncoding(value)
    if (option.disabled) option.title = "当前浏览器不支持此编码"
    encoding.append(option)
  }
  encodingLabel.append(encoding); encodingLabel.hidden = true; select.after(encodingLabel)
  let current: AbortController | undefined, fileController: AbortController | undefined
  let renderChoice: (key: string) => void = () => {}, activeFrame: HTMLIFrameElement | undefined
  const webFullscreen = new WeakMap<HTMLIFrameElement, (active: boolean) => void>()
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !activeFrame?.classList.contains("is-web-fullscreen")) return
    if (document.fullscreenElement || (document as any).webkitFullscreenElement) return
    event.preventDefault(); event.stopPropagation()
    webFullscreen.get(activeFrame)?.(false)
    activeFrame.contentWindow?.postMessage({ channel: activeFrame.dataset.channel, type: "exitFullscreenWeb" }, "*")
  }, { signal: lifecycle, capture: true })
  const stop = () => {
    current?.abort(); current = undefined
    for (const media of body.querySelectorAll<HTMLMediaElement>("video,audio")) { media.pause(); media.removeAttribute("src"); media.load() }
    activeFrame?.remove(); activeFrame = undefined
  }
  window.addEventListener('pagehide',stop,{signal:lifecycle})
  const prepare = (file: PreviewFile) => {
    const choices = previewChoices(file, cached?.value || {}, false, false).filter(item => !item.external)
    const requested = new URL(location.href).searchParams.get("preview")
    select.replaceChildren(...choices.map(item => { const option = node("option", item.name); option.value = item.key; return option }))
    select.value = choices.some(item => item.key === requested) ? requested! : choices[0].key
    select.disabled = true; select.setAttribute("aria-busy", "true")
    encodingLabel.hidden = true; chooser.hidden = false
  }
  const clear = (file?: PreviewFile) => {
    fileController?.abort(); stop(); body.setAttribute("aria-busy", "false"); chooser.hidden = true
    select.replaceChildren(); encodingLabel.hidden = true; renderChoice = () => {}
    if (file) prepare(file)
  }
  select.addEventListener("change", () => renderChoice(select.value), { signal: lifecycle })
  encoding.addEventListener("change", () => renderChoice(select.value), { signal: lifecycle })
  const themeObserver = new MutationObserver(() => {
    if (activeFrame) {
      activeFrame.style.colorScheme = theme()
      activeFrame.contentWindow?.postMessage({ channel: activeFrame.dataset.channel, type: "theme", theme: theme(), colors: colors() }, "*")
    }
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["saved-theme"] })
  lifecycle.addEventListener("abort", () => { clear(); themeObserver.disconnect() }, { once: true })
  const load = async (file: PreviewFile, direct: string, access: PreviewAccess, signal: AbortSignal, returnToArchive?: () => void, archiveDirectory?: string) => {

    fileController?.abort(); fileController = new AbortController()
    const fileSignal = AbortSignal.any([lifecycle, signal, fileController.signal])
    const finishPreparation = beginDriveLoading(body, fileSignal)
    body.setAttribute("aria-busy", "true")
    prepare(file)
    stop(); body.replaceChildren()
    try {
    let config: PreviewSettings
    try { config = await settings(fileSignal) }
    catch { config = {} }
    if (fileSignal.aborted) return
    // Only the Jellyfin player starts a background danmaku match.
    const matchDanmaku = async () => {
        type MatchResult = { comments: { text: string; time: number; mode: number; color: string }[] | null; keyword?: string; matchError?: string }
        let last:MatchResult={comments:null,keyword:file.name,matchError:'自动匹配失败'}
        // One request per keyword: preferred source, then unrestricted fallback.
        for(const unrestrictedMatch of [false,true]) {
          if(fileSignal.aborted)break
          try {
            last=await driveRequest<MatchResult>("public/quartz/jellyfin/danmaku", { path: access.requestPath, password: access.password, fileName: file.name, unrestrictedMatch }, { anonymous: access.view !== "storage", timeout: 70000, signal: fileSignal })
            if(last.comments?.length)return last
          } catch { /* Never repeat the same keyword or block video playback. */ }
        }
        return last
      }
    let danmaku:ReturnType<typeof matchDanmaku>|undefined
    type JellyfinMatch = { match: string; defaultSubtitleStreamIndex?: number; videoCodec?:string; scopes?: VideoScope; timeline?: SandboxPreview["timeline"]; subtitles?: { index?: number; key?: string; name: string; language: string; type: string; url: string; nativeUrl?: string; isDefault?: boolean; burn?:boolean }[]; videoAspectRatio?: number; qualities: { id: string; name: string; bitrate: number }[]; audioTracks: { index: number; key?: string; name: string }[]; audioStreamIndex?: number }
    let jellyfin: JellyfinMatch | undefined
    if (!returnToArchive && access.mediaShare && (file.type === 2 || drivePreviewKind(file.name) === "video")) {
      try {
        const value = await driveRequest<JellyfinMatch & { matched: boolean }>("public/quartz/jellyfin/lookup", { path: access.requestPath, password: access.password }, { anonymous: access.view !== "storage", signal: AbortSignal.any([fileSignal, AbortSignal.timeout(5000)]) })

        if (value.matched) jellyfin = value
      } catch { /* Unavailable or unindexed media keeps the regular player. */ }
    }
    if (fileSignal.aborted) return
    const progressIdentity = JSON.stringify([access.view, access.user?.base_path || "", access.requestPath])
    const preferenceScope = jellyfin?.scopes || fallbackVideoScope(access.requestPath, `${access.view}:${access.user?.base_path || ""}`)
    const allowed = access.view === "share" ? String(config.share_archive_preview ?? "true") === "true"
      : Boolean(access.user && (access.user.role === 2 || (access.user.permission || 0) & (1 << 12)))
    const choices = previewChoices(file, config, access.view === "share", allowed && !returnToArchive)
    const available = choices.filter(item => !item.external && (item.key !== "pdf_native" || navigator.pdfViewerEnabled !== false))
    if (jellyfin && available.some(item => item.key === "video")) available.unshift({ key: "jellyfin", name: "Jellyfin 播放器" })
    select.replaceChildren(...available.map(item => { const option = node("option", item.name); option.value = item.key; return option }))
    select.disabled = false; select.removeAttribute("aria-busy")
    chooser.hidden = Boolean(access.mediaShare); encoding.value = "utf-8"
    const actions = node("div", "", "drive-file-actions")
    const extension = file.name.split(".").at(-1)!.toLowerCase()
    if (["ipa", "tipa", "plist"].includes(extension)) {
      const addInstall = (name: string, url: string) => { const link = node("a", name, "drive-file-action"); link.href = url; link.rel = "noopener noreferrer"; actions.append(link) }
      if (extension === "plist") addInstall("安装到 iOS", `itms-services://?action=download-manifest&url=${encodeURIComponent(file.raw_url || direct)}`)
      else {
        const basename = file.name.replace(/\.[^.]*$/, ""), value = btoa(`${encodeURIComponent(file.raw_url || direct)}/${encodeURIComponent(basename)}`).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ".")
        addInstall("安装到 iOS", `itms-services://?action=download-manifest&url=${encodeURIComponent(`${DRIVE_ORIGIN}/i/${value}.plist`)}`)
        addInstall("通过巨魔安装", `apple-magnifier://install?url=${encodeURIComponent(direct)}`)
      }
    }
    for (const item of choices.filter(item => item.external)) {
      try { const link = node("a", item.name, "drive-file-action"); link.href = previewScheme(item.scheme!, file, direct); link.target = "_blank"; link.rel = "noopener noreferrer"; actions.append(link) } catch { /* Invalid configured schemes are omitted. */ }
    }
    const info = (notice = "", extraAction?: HTMLAnchorElement) => {
      const wrapper = node("div", "", "drive-preview-download"), heading = node("strong", file.name)
      wrapper.append(fileIconForName(file.name), heading, node("p", driveSize(file.size), "drive-preview-filesize"))
      const buttons = actions.cloneNode(true) as HTMLElement
      if (extraAction) buttons.append(extraAction)
      if (buttons.childElementCount) wrapper.append(buttons)
      if (notice) wrapper.append(node("p", notice, "drive-preview-note"))
      body.append(wrapper)
    }
    const render = async (key: string) => {
      await readSiteSettings()
      const preferences = readVideoPreferences(preferenceScope)
      const highBitrateBuffer = jellyfin ? await jellyfinHlsBuffer() : undefined
      const hlsMode = jellyfin ? await jellyfinHlsMode(jellyfin.timeline?.duration || 1,jellyfin.videoCodec) : undefined
      const subtitleBurnIn = jellyfin ? await jellyfinSubtitleBurnIn(preferences.subtitleBurnIn) : preferences.subtitleBurnIn
      if(jellyfin)jellyfin={...jellyfin,subtitles:jellyfin.subtitles?.map(track=>({...track,burn:track.burn||subtitleNeedsBurn(track.type,subtitleBurnIn)}))}
      stop(); current = new AbortController()
      const renderSignal = AbortSignal.any([fileSignal, current.signal])
      if (renderSignal.aborted) return
      const finishLoading = beginDriveLoading(body, renderSignal)
      const progress = driveFileProgress(body, renderSignal)
      body.setAttribute("aria-busy", "true")
      let timeout: ReturnType<typeof setTimeout> | undefined
      const complete = () => {
        clearTimeout(timeout)
        if (renderSignal.aborted) return
        body.setAttribute("aria-busy", "false")
        progress.clear(); finishLoading()
      }
      renderSignal.addEventListener("abort", () => clearTimeout(timeout), { once: true })
      const selected = available.find(item => item.key === key) || available[0]
      select.value = selected.key
      encodingLabel.hidden = !["markdown", "markdown_with_word_wrap", "text_editor", "html", "url_open"].includes(selected.key)
      body.replaceChildren()
      if (returnToArchive) {
        const back = node("button", "", "drive-archive-back"); back.type = "button"
        back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>'
        back.append(node("span", "返回压缩包")); back.onclick = returnToArchive; body.append(back)
      }
      const output = node("div", "", "drive-preview-content"); body.append(output)
      if (actions.childElementCount && !["download", "ipa", "plist", "url_open"].includes(selected.key)) body.append(actions.cloneNode(true))
      let retainedPlayerError = ""
      const fail = (reason: string) => {
        if (renderSignal.aborted) return
        if (selected.key === "jellyfin" || access.mediaShare && selected.key === "video") {
          if (retainedPlayerError) return
          retainedPlayerError = reason; complete()
          let playerFrame = output.querySelector<HTMLIFrameElement>('iframe[data-preview-kind="video"]')
          if (!playerFrame) {
            runtime("video", { url: "", mediaType: "m3u8", cover: access.cover ?? file.thumb, mediaShare: access.mediaShare, danmuApi: false, resumeTime: 0,
              jellyfin: { qualities: jellyfin?.qualities || [], audioTracks: jellyfin?.audioTracks || [] } })
            playerFrame = output.querySelector<HTMLIFrameElement>("iframe")
          }
          playerFrame?.classList.remove("is-loading")
          const channel = playerFrame?.dataset.channel
          if (channel) playerFrame?.contentWindow?.postMessage({ channel, type: "jellyfinPlaybackError", message: reason }, "*")
          const message = node("div", reason, "drive-player-error"); message.setAttribute("role", "alert"); output.append(message)
          return
        }
        complete()
        stop(); select.value = "download"; encodingLabel.hidden = true; output.replaceChildren(); output.remove()
        body.querySelector(":scope > .drive-file-actions")?.remove()
        info(`${reason}，已切换到文件预览，可通过右侧操作下载文件。`)
      }
      timeout = setTimeout(() => fail("预览加载超时"), 45000)
      const frame = (src?: string, nativePdf = false) => {
        const result = node("iframe"); result.title = `${file.name} · ${selected.name}`; result.className = "drive-renderer-frame is-loading"; result.referrerPolicy = "no-referrer"
        result.style.colorScheme = theme()
        if (!nativePdf) result.setAttribute("sandbox", "allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox allow-forms")
        result.allowFullscreen = true
        if (src && !nativePdf && "credentialless" in result) result.credentialless = true
        if (src) result.src = src
        result.addEventListener("error", () => fail("预览服务加载失败"), { once: true, signal: renderSignal })
        activeFrame = result; output.replaceChildren(result)
        webFullscreen.set(result, setupPreviewWebFullscreen(result, renderSignal))
        if (src) result.addEventListener("load", () => { result.classList.remove("is-loading"); complete() }, { once: true, signal: renderSignal })
        return result
      }
      const runtime = (key: string, extra: Partial<SandboxPreview> = {}) => {
        const result = frame(), channel = crypto.randomUUID()
        result.dataset.channel = channel
        if (["video","aliyun_video"].includes(key)) setupPlayerPanelHost(result,channel,renderSignal)
        result.dataset.previewKind = key
        // A sandboxed srcdoc has an opaque origin: 'self' does not delegate
        // local-network permission to it. Only our controlled media runtime
        // gets this delegation; external/document previews keep their policy.
        if (["video", "aliyun_video", "video360", "audio"].includes(key)) {
          result.setAttribute("allow", "local-network *; local-network-access *")
        }
        if(access.mediaShare&&jellyfin&&extra.jellyfin&&!danmaku)danmaku=matchDanmaku()
        const data: SandboxPreview = { key, name: file.name, size: file.size, channel, url: direct.replace(`${DRIVE_ORIGIN}/d/`, `${DRIVE_ORIGIN}/p/`), theme: theme(), staticBase: new URL("/static/", location.href).href, matroskaReader: new URL(matroskaReaderUrl, location.href).href, colors: colors(), encoding: encoding.value, preferences, playerIcons, resumeTime: readVideoProgress(progressIdentity), danmuApi: Boolean(danmaku)&&Boolean(extra.jellyfin), ...extra }
        if (data.qualities && preferences.quality) data.url = initialVideoQuality(data.qualities.map(item=>({...item,id:item.html.match(/\d{3,4}/)?.[0] || "auto"})),preferences.quality)?.url || data.url
        if(data.jellyfin) {
          const playerURL=new URL(driveApiUrl('public/quartz/jellyfin/player'))
          result.setAttribute('sandbox',result.getAttribute('sandbox')+' allow-same-origin')
          result.addEventListener('load',()=>result.contentWindow?.postMessage({type:'jellyfinInit',config:data,script:String((window as any).__quartzJellyfinScript||'')},playerURL.origin),{once:true,signal:renderSignal})
          result.src=playerURL.href
        } else result.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html{color-scheme:${theme()};background:var(--background)}body{margin:0;padding:12px;background:var(--background);color:var(--foreground);font:15px/1.65 system-ui,sans-serif}*{box-sizing:border-box}#preview{min-width:0}pre{margin:0;overflow:auto;white-space:pre;tab-size:4}code{font:13px/1.6 ui-monospace,monospace}a,button{color:var(--accent)}img,canvas{max-width:100%;height:auto}table{border-collapse:collapse;min-width:100%}td,th{padding:6px 10px;border:1px solid var(--border);white-space:pre-wrap}nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}button{font:inherit;background:transparent;border:1px solid var(--border);border-radius:4px;padding:4px 10px;cursor:pointer}button[aria-pressed=true]{border-color:var(--accent)}dl{display:grid;grid-template-columns:auto 1fr;gap:8px 20px}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}.hljs-keyword,.hljs-built_in{color:#9f77bd}.hljs-string,.hljs-attr{color:#609582}.hljs-number,.hljs-literal{color:#b99255}.hljs-comment{color:var(--muted)}#preview.aplayer{background:var(--background);color:var(--foreground);box-shadow:none;border:1px solid var(--border)}#preview.aplayer .aplayer-list li.aplayer-list-light{background:var(--border)}#preview.aplayer .aplayer-lrc::before{background:linear-gradient(to bottom,var(--background),transparent);filter:none}#preview.aplayer .aplayer-lrc::after{background:linear-gradient(to bottom,transparent,var(--background));opacity:.8;filter:none}.docx-wrapper{padding:12px!important;background:transparent!important}.docx-wrapper>section.docx{max-width:100%;overflow:auto}
#preview:is([data-renderer="markdown"],[data-renderer="markdown_with_word_wrap"]){overflow-wrap:anywhere}
#preview:is([data-renderer="markdown"],[data-renderer="markdown_with_word_wrap"]),#preview:is([data-renderer="markdown"],[data-renderer="markdown_with_word_wrap"]) :is(pre,code){font-family:"Microsoft YaHei","微软雅黑",sans-serif}
</style></head><body><div id="preview"></div><script>(${previewSandboxRuntime.toString()})(${safeJSON(data)},${trackDriveResponse.toString()},${preferredSubtitle.toString()},${embeddedASSFont.toString()},${resumeSeekTarget.toString()},${safeJSON(playerStyles)},(${renderSandboxVideo.toString()}),(${mountPlayerFullscreen.toString()}),(${mountPlayerPanels.toString()})).catch(()=>{});</script></body></html>`
        let qualityRequest = 0, videoStarted = false
        let confirmedSelection = {quality:selectedQuality,audio:selectedAudio,subtitle:selectedSubtitleIndex,burn:forcedBurnIndex}
        let pendingSwitch: {request:number;session:string;selection:string;compatible:boolean;next:typeof confirmedSelection} | undefined
        window.addEventListener("message", event => {
          if (event.source !== result.contentWindow || event.data?.channel !== channel) return
          if (["subtitleAsset", "playerAsset", "previewAsset"].includes(event.data.type)) {
            const name = event.data.name
            const playerAsset = event.data.type !== "subtitleAsset"
            const playerPaths: Record<string, string> = {
              "artplayer.js": "artplayer/5.4.0/artplayer.js",
              "hls.min.js": "hls.js/1.6.16/hls.min.js",
              "artplayer-plugin-danmuku.js": "artplayer-plugin-danmuku/5.2.0/artplayer-plugin-danmuku.js?v=quartz-queue1",
              "marked.umd.js": "marked/15.0.12/lib/marked.umd.js",
              "purify.min.js": "dompurify/3.2.7/dist/purify.min.js",
              "APlayer.min.js": "aplayer/1.10.1/dist/APlayer.min.js",
              "APlayer.min.css": "aplayer/1.10.1/dist/APlayer.min.css",
              "mpegts.js": "mpegts.js/1.8.0/dist/mpegts.js",
              "asciinema-player.min.js": "asciinema-player/3.17.0/dist/bundle/asciinema-player.min.js",
              "asciinema-player.css": "asciinema-player/3.17.0/dist/bundle/asciinema-player.css",
              "ruffle.js": "ruffle/0.5.0/ruffle.js",
              "6ce4f603a1fe7cc88438.wasm": "ruffle/0.5.0/6ce4f603a1fe7cc88438.wasm",
              "a71cef02d58dcec6f55f.wasm": "ruffle/0.5.0/a71cef02d58dcec6f55f.wasm",
            }
            const assetPath = ['libpgs.js','libpgs.worker.js'].includes(name) && !playerAsset ? `libpgs/0.8.1/${name}` : playerAsset ? Object.hasOwn(playerPaths, name) ? playerPaths[name] : undefined
              : ["subtitles-octopus.js", "subtitles-octopus-worker.js", "subtitles-octopus-worker.wasm", "SourceHanSansCN-Bold.woff2"].includes(name) ? `libass-wasm/4.2.4/${name}` : undefined
            // Fetch in the stable top-level cache partition, not the preview's
            // fresh opaque origin. Only these public, versioned assets are allowed.
            if (!assetPath) return
            const resultType = `${event.data.type}Result`
            void (async () => {
              const assetURL = new URL(`/static/vendor/${assetPath}`, location.origin)
              const buffer = await readPlayerAsset(assetURL,renderSignal)
              if (!renderSignal.aborted) result.contentWindow?.postMessage({ channel, type: resultType, name, buffer }, "*", [buffer])
            })().catch(() => {
              if (!renderSignal.aborted) result.contentWindow?.postMessage({ channel, type: resultType, name, error: "预览资源读取失败" }, "*")
            })
          }
          if (event.data.type === "danmakuRequest" && danmaku && Number.isSafeInteger(event.data.id) && ["auto", "search", "episodes", "select"].includes(event.data.action)) {
            const { action, id } = event.data
            const payload = { path: access.requestPath, password: access.password, action,
              ...(action === "search" ? { query: String(event.data.query || "").slice(0, 151) } : {}),
              ...(["episodes", "select"].includes(action) ? { id: String(event.data.selection || "").slice(0, 121) } : {}) }
            const work = action === "auto" ? danmaku : driveRequest("public/quartz/jellyfin/danmaku", payload, { anonymous: access.view !== "storage", signal: AbortSignal.any([renderSignal, AbortSignal.timeout(45000)]) })
            void work.then(value => {
              if (!renderSignal.aborted) result.contentWindow?.postMessage({ channel, type: "danmakuResponse", id, value }, "*")
            }).catch(error => {
              if (!renderSignal.aborted) result.contentWindow?.postMessage({ channel, type: "danmakuResponse", id, error: error instanceof Error ? error.message : "弹幕读取失败" }, "*")
            })
          }
          if (event.data.type === "videoProgress") saveVideoProgress(progressIdentity, event.data.position, event.data.duration, event.data.ended === true)
          if (event.data.type === "subtitleAppearanceOpen" && jellyfin) {
            openSubtitleAppearanceDialog(readVideoPreferences(preferenceScope).subtitleAppearance, value => {
              if (renderSignal.aborted) return
              saveVideoPreferences(preferenceScope, { subtitleAppearance: value })
              result.contentWindow?.postMessage({ channel, type: "subtitleAppearance", value }, "*")
            }, renderSignal)
          }
          if (event.data.type === "videoPreference" && event.data.patch && typeof event.data.patch === "object") saveVideoPreferences(preferenceScope, event.data.patch)
          if (event.data.type === "downloadProgress" && typeof event.data.progress === "number") progress.update(event.data.progress)
          if (event.data.type === "contentHeight" && typeof event.data.height === "number" && Number.isFinite(event.data.height) && event.data.height > 0) {
            result.classList.add("is-content-sized")
            result.style.setProperty("--drive-content-height", `${Math.ceil(event.data.height)}px`)
          }
          if (event.data.type === "fullscreenWeb" && ["video", "aliyun_video"].includes(key) && typeof event.data.active === "boolean") {
            webFullscreen.get(result)?.(event.data.active)
          }
          if (event.data.type === "ready") {
            if (retainedPlayerError && ["video", "aliyun_video"].includes(key)) {
              result.classList.remove("is-loading"); complete()
              result.contentWindow?.postMessage({ channel, type: "jellyfinPlaybackError", message: retainedPlayerError }, "*")
              return
            }

            result.classList.remove("is-loading"); complete()

            if (["video", "aliyun_video"].includes(key) && !videoStarted) {
              videoStarted = true
              // The controls are ready now; mobile decoding may require tapping Play.
              requestAnimationFrame(() => requestAnimationFrame(() => {
                if (renderSignal.aborted) return
                if (data.jellyfin) {
                  void startJellyfin(selectedQuality).then(value => {
                    if (renderSignal.aborted) return
                    if (retainedPlayerError) { stopJellyfin(value.session); return }
                    activateJellyfin(value.session)
                    result.contentWindow?.postMessage({ channel, type: "videoStart", url: value.url, mediaType:value.type, quality:selectedQuality, audioStreamIndex:selectedAudio, playMethod:value.playMethod, maxStreamingBitrate:value.maxStreamingBitrate, subtitleStreamIndex: value.subtitleStreamIndex }, "*")
                  }).catch(error => { if (!renderSignal.aborted) fail(error instanceof Error ? error.message : "视频加载失败") })
                } else result.contentWindow?.postMessage({ channel, type: "videoStart", url: data.url }, "*")
              }))
            }
          }
          if (event.data.type === "jellyfinInitError") { result.classList.remove("is-loading"); complete(); output.querySelector(".drive-player-error")?.remove() }
          if (event.data.type === "jellyfinReload" && data.jellyfin) { void render(selected.key); return }
          if (event.data.type === "jellyfinPlaybackErrorShown") output.querySelector(".drive-player-error")?.remove()
          if (event.data.type === "error") {
            if (data.jellyfin && videoStarted) result.contentWindow?.postMessage({channel,type:"jellyfinPlaybackError",message:event.data.message},"*")
            else fail(event.data.message || "此方式无法预览该文件")
          }
          if(event.data.type==="jellyfinFallback"&&jellyfin){
            const request=++qualityRequest,position=Number.isFinite(event.data.position)?Math.max(0,event.data.position):0
            void startJellyfin(selectedQuality,selectedAudio,true,position).then(value=>{
              if(renderSignal.aborted||request!==qualityRequest){stopJellyfin(value.session);jellyfinSessions.delete(value.session);return}
              pendingSwitch={request,session:value.session,selection:"fallback",compatible:true,next:{quality:selectedQuality,audio:selectedAudio,subtitle:selectedSubtitleIndex,burn:forcedBurnIndex}}
              result.contentWindow?.postMessage({channel,requestId:request,type:"jellyfinSource",url:value.url,mediaType:value.type,playMethod:value.playMethod,audioStreamIndex:selectedAudio,maxStreamingBitrate:value.maxStreamingBitrate,quality:selectedQuality,subtitleStreamIndex:value.subtitleStreamIndex,selection:"fallback",position},"*")
            }).catch(error=>{if(!renderSignal.aborted&&request===qualityRequest)result.contentWindow?.postMessage({channel,type:"jellyfinPlaybackError",message:error instanceof Error?error.message:"Jellyfin 重新协商失败"},"*")})
          }
          if (["jellyfinSourceReady","jellyfinSourceFailed"].includes(event.data.type) && pendingSwitch && pendingSwitch.request === event.data.requestId) {
            if (event.data.type === "jellyfinSourceReady") {
              retainedPlayerError = ""; output.querySelector(".drive-player-error")?.remove()
              activateJellyfin(pendingSwitch.session); confirmedSelection = pendingSwitch.next
              if(pendingSwitch.compatible)compatiblePlayback=true
              if(pendingSwitch.selection==="quality")saveVideoPreferences(preferenceScope,{quality:confirmedSelection.quality})
              if(pendingSwitch.selection==="audio"){
                const key=jellyfin?.audioTracks.find(track=>track.index===confirmedSelection.audio)?.key
                if(key)saveVideoPreferences(preferenceScope,{audio:key})
              }
            } else {
              stopJellyfin(pendingSwitch.session);jellyfinSessions.delete(pendingSwitch.session)
              selectedQuality=confirmedSelection.quality;selectedAudio=confirmedSelection.audio;selectedSubtitleIndex=confirmedSelection.subtitle;forcedBurnIndex=confirmedSelection.burn
            }
            pendingSwitch=undefined
          }
          if (event.data.type === "videoEpisode" && ["previous", "next"].includes(event.data.direction)) {
            const target = data.episodes?.[event.data.direction as "previous" | "next"]
            if (target) void window.spaNavigate(new URL(target.url, location.href))
          }
          if(event.data.type==='jellyfinRetry'&&!jellyfin){void load(file,direct,access,signal,returnToArchive,archiveDirectory);return}
          if ((event.data.type === "jellyfinQuality" || event.data.type === "jellyfinAudio" || event.data.type === "jellyfinSubtitle" || event.data.type==='jellyfinRetry') && jellyfin) {
            if (event.data.type === "jellyfinQuality" && jellyfin.qualities.some(item => item.id === event.data.quality)) selectedQuality = event.data.quality
            else if (event.data.type === "jellyfinAudio" && jellyfin.audioTracks.some(item => item.index === event.data.audioStreamIndex)) selectedAudio = event.data.audioStreamIndex
            else if (event.data.type === "jellyfinSubtitle" && (event.data.subtitleStreamIndex === -1 || jellyfin.subtitles?.some(track => track.index === event.data.subtitleStreamIndex))) {
              selectedSubtitleIndex = event.data.subtitleStreamIndex
              forcedBurnIndex = event.data.forceBurn===true ? selectedSubtitleIndex : -1
            }
            else if(event.data.type!=='jellyfinRetry')return
            const quality = selectedQuality, audioStreamIndex = selectedAudio, selection = event.data.type === "jellyfinSubtitle" ? "subtitle" : event.data.type === "jellyfinAudio" ? "audio" : "quality"
            const request = ++qualityRequest
            void startJellyfin(quality, audioStreamIndex,event.data.compatible===true,Number(event.data.position)||0).then(value => {
              if (renderSignal.aborted || request !== qualityRequest) { stopJellyfin(value.session); jellyfinSessions.delete(value.session); return }
              pendingSwitch={request,session:value.session,selection,compatible:compatiblePlayback||event.data.compatible===true,next:{quality,audio:audioStreamIndex,subtitle:selectedSubtitleIndex,burn:forcedBurnIndex}}
              result.contentWindow?.postMessage({ channel, requestId:request, type: "jellyfinSource", url: value.url, mediaType:value.type, playMethod:value.playMethod, maxStreamingBitrate:value.maxStreamingBitrate, quality, audioStreamIndex, subtitleStreamIndex: value.subtitleStreamIndex, selection }, "*")
            }).catch(error => { if (!renderSignal.aborted && request === qualityRequest) {
              selectedQuality=confirmedSelection.quality;selectedAudio=confirmedSelection.audio;selectedSubtitleIndex=confirmedSelection.subtitle;forcedBurnIndex=confirmedSelection.burn
              result.contentWindow?.postMessage({ channel, type: "jellyfinQualityError", selection, message: error instanceof Error ? error.message : "播放请求失败" }, "*")
            } })
          }
        }, { signal: renderSignal })
      }
      const jellyfinSessions = new Set<string>()
      let compatiblePlayback = false
      let selectedQuality = initialVideoQuality(jellyfin?.qualities || [], preferences.quality)?.id || "auto"
      let selectedAudio = jellyfin?.audioTracks.find(track => track.key && track.key === preferences.audio)?.index ?? jellyfin?.audioStreamIndex
      const initialSubtitle = initialJellyfinSubtitle(jellyfin?.subtitles || [], preferences.subtitle, jellyfin?.defaultSubtitleStreamIndex)
      let selectedSubtitleIndex = initialSubtitle?.index ?? -1
      let forcedBurnIndex = initialSubtitle?.burn ? selectedSubtitleIndex : -1
      // Video-only native fullscreen/PiP cannot include a sibling PGS canvas.
      const nativeOnly = /iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.platform==='MacIntel' && navigator.maxTouchPoints>1
      const pgsClientRender = preferences.pgsRender===true && !subtitleNeedsBurn('pgs',subtitleBurnIn) && typeof Worker!=='undefined' && !nativeOnly && Boolean(document.createElement('canvas').getContext('2d'))
      const stopJellyfin = (session: string) => { void fetch(driveApiUrl("public/quartz/jellyfin/stop"), { method: "POST", credentials: "omit", keepalive: true, headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify({ session }) }).catch(() => {}) }
      const activateJellyfin = (current: string) => { for (const session of jellyfinSessions) if (session !== current) { stopJellyfin(session); jellyfinSessions.delete(session) } }
      const startJellyfin = async (quality: string, audioStreamIndex = selectedAudio, forceTranscode=false, position=readVideoProgress(progressIdentity)) => {
        const signal=AbortSignal.any([renderSignal,AbortSignal.timeout(75000)])
        signal.throwIfAborted()
        let cancel!:()=>void
        const aborted=new Promise<never>((_resolve,reject)=>{cancel=()=>reject(signal.reason);signal.addEventListener("abort",cancel,{once:true})})
        try {
          const [deviceProfile,maxBitrate]=await Promise.race([Promise.all([jellyfinDeviceProfile(pgsClientRender,subtitleBurnIn),quality==='auto'?jellyfinAutoBitrate(jellyfin!.match,signal):Promise.resolve(undefined)]),aborted])
          const value = await driveRequest<{ session: string; url: string; type:string; playMethod:string; maxStreamingBitrate:number; subtitleStreamIndex?: number }>("public/quartz/jellyfin/playback", { match: jellyfin!.match, quality, audioStreamIndex, deviceProfile,maxBitrate,forceTranscode:forceTranscode||compatiblePlayback,position, subtitleStreamIndex: selectedSubtitleIndex, burnPgs: !pgsClientRender, forceBurn:forcedBurnIndex===selectedSubtitleIndex && selectedSubtitleIndex>=0, nativeSubtitles:hlsMode==='native' && subtitleBurnIn!=='all' }, { anonymous: true, timeout: 75000, signal })
          if (signal.aborted) { stopJellyfin(value.session); throw signal.reason }
          jellyfinSessions.add(value.session)
          return value
        } catch(error) {
          if (!renderSignal.aborted && signal.aborted) throw new Error("Jellyfin 播放协商超时，请重试")
          throw error
        } finally { signal.removeEventListener("abort",cancel) }
      }
      renderSignal.addEventListener("abort", () => { for (const session of jellyfinSessions) stopJellyfin(session); jellyfinSessions.clear() }, { once: true })
      try {
        if (selected.scheme) { frame(previewScheme(selected.scheme, file, direct)); return }
        const kind = selected.key, extension = file.name.split(".").at(-1)!.toLowerCase()
        if (kind === "jit") {
          const channel = crypto.randomUUID(), url = new URL("/jit-viewer/", location.origin)
          url.search = new URLSearchParams({ file: direct, name: file.name, size: String(file.size), embed: "1", channel, theme: theme() }).toString()
          const result = frame()
          result.setAttribute("sandbox", result.getAttribute("sandbox") + " allow-same-origin")
          result.dataset.channel = channel
        if (["video","aliyun_video"].includes(key)) setupPlayerPanelHost(result,channel,renderSignal); result.dataset.previewKind = kind
          const setWebFullscreen = webFullscreen.get(result)!
          window.addEventListener("message", event => {
            if (event.origin !== location.origin || event.source !== result.contentWindow || event.data?.channel !== channel) return
            if (event.data.type === "downloadProgress" && typeof event.data.progress === "number") progress.update(event.data.progress)
            if (event.data.type === "fullscreenWeb" && typeof event.data.active === "boolean") setWebFullscreen(event.data.active)
            if (event.data.type === "ready") { result.classList.remove("is-loading"); complete(); result.contentWindow?.postMessage({ channel, type: "theme", theme: theme(), colors: colors() }, location.origin) }
            if (event.data.type === "error") fail(event.data.message || "JitViewer 无法预览此文件")
          }, { signal: renderSignal })
          result.src = url.href
          return
        }
        if (kind === "pdf_native") {
          const result = frame(nativePdfUrl(direct), true)
          result.dataset.previewKind = kind
          return
        }
        if (["download", "ipa", "plist"].includes(kind)) { output.remove(); info(); complete(); return }
        if (kind === "image") {
          if (["heic", "heif", "vvc", "avc"].includes(extension)) { runtime("heif"); return }
          renderDriveImage(output, file.raw_url || direct, file.name, renderSignal, () => extension === "avif" ? runtime("heif") : fail("浏览器无法显示此图片"), complete)
          return
        }
        if (kind === "html" || kind === "url_open") {
          if (file.size > 32 * 1024 * 1024) throw new Error("文本文件超过在线预览大小限制")
          const response = await fetch(direct.replace(`${DRIVE_ORIGIN}/d/`, `${DRIVE_ORIGIN}/p/`), { credentials: "omit", signal: renderSignal })
          if (!response.ok) throw new Error(`文件读取失败（${response.status}）`)
          const text = new TextDecoder(encoding.value).decode(await trackDriveResponse(response, file.size, progress.update).arrayBuffer()); if (renderSignal.aborted) return
          if (kind === "html") {
            const document = new DOMParser().parseFromString(text, "text/html"), base = node("base")
            base.href = file.raw_url || direct; document.head.prepend(base)
            const result = frame(); result.addEventListener("load", () => { result.classList.remove("is-loading"); complete() }, { once: true, signal: renderSignal }); result.srcdoc = `<!doctype html>${document.documentElement.outerHTML}`; return
          }
          const url = /^\s*URL\s*=\s*(.*?)\s*$/im.exec(text)?.[1]
          if (!url || !/^https?:\/\//i.test(url)) throw new Error("快捷方式中没有有效的网址")
          output.replaceChildren()
          const link = node("a", url, "drive-url-link"); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; output.remove(); info("", link); complete(); return
        }
        if (kind === "archive") {
          await renderDriveArchive(output, direct, access, renderSignal, (entry, url, directory) => {
            const reopen = () => { void load(file, direct, access, signal, undefined, directory) }
            void load(entry, url, access, signal, reopen)
          }, archiveDirectory); complete(); return
        }
        if (kind === "aliyun_video") {
          const data = await driveRequest<{ video_preview_play_info: { live_transcoding_task_list: { url: string; template_name: string; template_height: number }[] } }>("fs/other", { path: access.requestPath, password: access.password, method: "video_preview" }, { anonymous: access.view === "share" || access.view === "guest", signal: renderSignal })
          if (renderSignal.aborted) return
          const list = data.video_preview_play_info.live_transcoding_task_list.filter(item => item.url)
          if (!list.length) throw new Error("此文件没有可用转码视频")
          runtime(kind, { url: list.at(-1)!.url, qualities: list.map(item => ({ html: item.template_name || `${item.template_height}p`, url: item.url })) }); return
        }
        if (["markdown", "markdown_with_word_wrap", "text_editor"].includes(kind) && file.size > 32 * 1024 * 1024) throw new Error("文本文件超过在线预览大小限制")
        let related: Partial<SandboxPreview> = {}
        if (["video", "jellyfin", "audio"].includes(kind) && !returnToArchive && !(access.view === "share" && /^\/@s\/[^/]+$/.test(access.requestPath))) {
          try {
            const directory = access.requestPath.slice(0, access.requestPath.lastIndexOf("/")) || "/"
            const listing = await driveRequest<{ content: PreviewFile[] | null }>("fs/list", { path: directory, password: access.password, page: 1, per_page: 0 }, { anonymous: access.view === "share" || access.view === "guest", signal: renderSignal })
            if (renderSignal.aborted) return
            const items = listing.content || [], basename = file.name.replace(/\.[^.]*$/, "").toLowerCase()
            const sibling = (item: PreviewFile) => { const url = new URL(direct); url.pathname = url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1) + encodeURIComponent(item.name); if (item.sign) url.searchParams.set("sign", item.sign); else url.searchParams.delete("sign"); return url.href }
            if (kind === "video" || kind === "jellyfin") {
              related.subtitles = items.filter(item => /\.(ass|ssa|srt|vtt)$/i.test(item.name)).map(item => ({ name: item.name, url: sibling(item), type: item.name.split(".").at(-1)!.toLowerCase() }))
              const danmu = items.find(item => /\.xml$/i.test(item.name) && item.name.toLowerCase().startsWith(basename)); if (danmu&&selected.key==="jellyfin") related.danmu = sibling(danmu)
              const route = driveRoute(new URL(location.href))
              if (route.valid) {
                const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" })
                const videos = items.filter(item => !item.is_dir && (item.type === 2 || drivePreviewKind(item.name) === "video")).sort((a, b) => collator.compare(a.name, b.name))
                const index = videos.findIndex(item => item.name === file.name)
                const episode = (item?: PreviewFile) => item ? { name: item.name, url: driveHref(route.view, `${route.path.slice(0, route.path.lastIndexOf("/"))}/${item.name}`, route.share, false) } : undefined
                if (index >= 0) related.episodes = { previous: episode(videos[index - 1]), next: episode(videos[index + 1]) }
              }
            } else {
              const cover = items.find(item => /\.(jpg|jpeg|png|webp)$/i.test(item.name) && [basename, "cover", "front", "folder"].includes(item.name.replace(/\.[^.]*$/, "").toLowerCase()))
              related.playlist = items.filter(item => item.type === 3 || /\.(mp3|flac|ogg|m4a|wav|opus|wma)$/i.test(item.name)).map(item => {
                const stem = item.name.replace(/\.[^.]*$/, "").toLowerCase(), lyrics = items.find(entry => entry.name.toLowerCase() === `${stem}.lrc`)
                return { name: item.name, artist: "", url: item.name === file.name ? file.raw_url || direct : sibling(item), cover: item.thumb || (cover ? sibling(cover) : String(config.audio_cover || "")), lrc: lyrics ? sibling(lyrics) : undefined }
              })
              related.currentAudio = related.playlist.findIndex(item => item.name === file.name)
            }
          } catch { /* Related files are optional; the current media still plays. */ }
        }
        if (renderSignal.aborted || retainedPlayerError) return
        if (kind === "jellyfin") {
          runtime("video", { ...related, cover: access.cover ?? file.thumb, mediaShare: access.mediaShare, url: "", subtitleUrl: file.raw_url || direct, mediaType: "m3u8", videoAspectRatio: jellyfin!.videoAspectRatio, timeline: jellyfin!.timeline, nativeSubtitles: jellyfin!.subtitles, jellyfin: { hlsMode, highBitrateBuffer, pgsRender:pgsClientRender, defaultSubtitleStreamIndex:jellyfin!.defaultSubtitleStreamIndex, initialSubtitleIndex: initialSubtitle?.burn || initialSubtitle?.type === "pgs" && !pgsClientRender ? selectedSubtitleIndex : -1, qualities: jellyfin!.qualities, quality: selectedQuality, audioTracks: jellyfin!.audioTracks, audioStreamIndex: selectedAudio }, autoplay: String(config.video_autoplay) === "true" })
          return
        }
        runtime(kind, {
          ...(["video", "audio", "video360"].includes(kind) ? { url: file.raw_url || direct } : {}),
          ...related,
          autoplay: String(config[kind === "audio" ? "audio_autoplay" : "video_autoplay"]) === "true",
          cover: access.cover ?? (file.thumb || (kind === "audio" ? String(config.audio_cover || "") : "")), mediaShare: access.mediaShare,
        })
      } catch (error) { if (!renderSignal.aborted) fail(error instanceof Error ? error.message : "预览失败") }
    }
    renderChoice = key => {
      const url = new URL(location.href); url.searchParams.set("preview", key); history.replaceState(history.state, "", url.pathname + url.search + url.hash)
      void render(key)
    }
    const initial = new URL(location.href).searchParams.get("preview")
    await render(access.mediaShare && jellyfin ? "jellyfin" : archiveDirectory !== undefined ? "archive" : available.some(item => item.key === initial) ? initial! : available[0].key)
    } finally { finishPreparation() }
  }
  return { load, clear, prepare }
}
