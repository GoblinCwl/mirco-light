import type {mountPlayerPanels} from "./playerPanels"
import type { mountPlayerFullscreen } from "./playerFullscreen"
import type { resumeSeekTarget } from "./videoResume"
import type { preferredSubtitle } from "./driveSubtitleSelection"
import type { embeddedASSFont } from "./assFonts"
import type { SandboxPreview } from "./preview/sandboxTypes"
import type { renderSandboxVideo } from "./preview/videoRenderer"
// This function is serialized into an isolated iframe. Keep runtime dependencies
// local or explicitly passed: renderers never modify the site's globals or styles.
export async function previewSandboxRuntime(
  config: SandboxPreview,
  trackResponse: (response: Response, size: number, progress: (value: number) => void) => Response,
  chooseSubtitle: typeof preferredSubtitle,
  findEmbeddedFont: typeof embeddedASSFont,
  resumeTargetFor: typeof resumeSeekTarget,
  playerSkinCSS: string,
  renderVideo: typeof renderSandboxVideo,
  mountFullscreen: typeof mountPlayerFullscreen,
  mountPanels: typeof mountPlayerPanels,
) {
  const w = window as typeof window & Record<string, any>
  const root = document.getElementById("preview")!
  root.dataset.renderer = config.key
  // Some native players use Web Storage unconditionally. Keep those preferences
  // inside this opaque frame rather than granting access to the application's storage.
  for (const name of ["localStorage", "sessionStorage"]) {
    const values = new Map<string, string>()
    Object.defineProperty(window, name, {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(String(key)) ?? null,
        setItem: (key: string, value: string) => values.set(String(key), String(value)),
        removeItem: (key: string) => values.delete(String(key)),
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() {
          return values.size
        },
      },
    })
  }
  const npm = (name: string, version: string, path: string) =>
    `https://cdn.jsdelivr.net/npm/${name}@${version}/${path}`
  const resource = "https://res.oplist.org.cn"
  const send = (type: string, message = "") =>
    parent.postMessage({ channel: config.channel, type, message }, "*")
  const style = (url: string) => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = url
    document.head.append(link)
  }
  const script = (url: string) =>
    new Promise<void>((resolve, reject) => {
      const tag = document.createElement("script"),
        timer = setTimeout(() => reject(new Error("预览组件加载超时")), 30000)
      tag.src = url
      tag.onload = () => {
        clearTimeout(timer)
        resolve()
      }
      tag.onerror = () => {
        clearTimeout(timer)
        reject(new Error("预览组件加载失败"))
      }
      document.head.append(tag)
    })
  const frameAsset = (name: string, kind: "subtitle" | "player" | "preview") =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      const errorText = kind === "subtitle" ? "字幕资源" : "预览资源"
      const received = (event: MessageEvent) => {
        if (
          event.source !== parent ||
          event.data?.channel !== config.channel ||
          event.data.type !== `${kind}AssetResult` ||
          event.data.name !== name
        )
          return
        clearTimeout(timer)
        removeEventListener("message", received)
        if (event.data.buffer instanceof ArrayBuffer) {
          resolve(event.data.buffer)
        } else {
          reject(new Error(`${errorText}读取失败`))
        }
      }
      const timer = setTimeout(() => {
        removeEventListener("message", received)
        reject(new Error(`${errorText}加载超时`))
      }, 45000)
      addEventListener("message", received)
      parent.postMessage({ channel: config.channel, type: `${kind}Asset`, name }, "*")
    })
  const localResourceURLs: string[] = []
  const resourceURL = (data: ArrayBuffer, type: string) => {
    const url = URL.createObjectURL(new Blob([data], { type }))
    localResourceURLs.push(url)
    return url
  }
  const localScript = async (name: string) =>
    script(resourceURL(await frameAsset(name, "preview"), "text/javascript"))
  const localStyle = async (name: string) => {
    const href = resourceURL(await frameAsset(name, "preview"), "text/css")
    await new Promise<void>((resolve, reject) => {
      const link = document.createElement("link"),
        timer = setTimeout(() => reject(new Error("预览样式加载超时")), 30000)
      link.rel = "stylesheet"
      link.href = href
      link.onload = () => {
        clearTimeout(timer)
        resolve()
      }
      link.onerror = () => {
        clearTimeout(timer)
        reject(new Error("预览样式加载失败"))
      }
      document.head.append(link)
    })
  }
  addEventListener(
    "pagehide",
    () => {
      for (const url of localResourceURLs) URL.revokeObjectURL(url)
    },
    { once: true },
  )
  const read = async () => {
    const response = await fetch(config.url, {
      credentials: "omit",
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new Error(`文件读取失败（${response.status}）`)
    return trackResponse(response, config.size, (progress) =>
      parent.postMessage({ channel: config.channel, type: "downloadProgress", progress }, "*"),
    )
  }
  const text = async () =>
    new TextDecoder(config.encoding || "utf-8").decode(await (await read()).arrayBuffer())
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, content = "") => {
    const e = document.createElement(tag)
    e.textContent = content
    return e
  }
  const colors = (theme: string, values: SandboxPreview["colors"]) => {
    // Spreadsheet colours belong to the workbook; keep the surrounding canvas
    // light until the renderer can safely handle workbook-specific dark themes.
    if (config.key === "xls") {
      theme = "light"
      values = {
        background: "#ffffff",
        foreground: "#222222",
        muted: "#666666",
        accent: "#284b63",
        border: "#e5e5e5",
      }
    }
    document.documentElement.dataset.previewTheme = theme
    document.documentElement.style.colorScheme = theme
    for (const [key, value] of Object.entries(values))
      document.documentElement.style.setProperty(`--${key}`, value)
  }
  const viewportRenderer = [
    "text_editor",
    "pdf",
    "video",
    "aliyun_video",
    "video360",
    "flash",
  ].includes(config.key)
  document.documentElement.style.overflowY = viewportRenderer ? "hidden" : "auto"
  document.body.style.display = "flow-root"
  let ready = false,
    sizingFrame = 0
  const reportHeight = (height: number) =>
    parent.postMessage(
      { channel: config.channel, type: "contentHeight", height: Math.ceil(height) },
      "*",
    )
  const reportContent = () => {
    if (!ready || viewportRenderer || sizingFrame) return
    sizingFrame = requestAnimationFrame(() => {
      sizingFrame = 0
      // The flow-root body includes the first/last child's margins and padding.
      // Measuring only #preview omits collapsed heading/paragraph margins.
      const horizontalScrollbar = Math.max(0, innerHeight - document.documentElement.clientHeight)
      reportHeight(document.body.getBoundingClientRect().height + horizontalScrollbar)
    })
  }
  if (!viewportRenderer) {
    const observer = new ResizeObserver(reportContent)
    observer.observe(root)
    observer.observe(document.body)
    addEventListener(
      "pagehide",
      () => {
        observer.disconnect()
        cancelAnimationFrame(sizingFrame)
      },
      { once: true },
    )
  }
  colors(config.theme, config.colors)
  addEventListener("message", (event) => {
    if (
      event.source === parent &&
      event.data?.channel === config.channel &&
      event.data.type === "theme"
    )
      colors(event.data.theme, event.data.colors)
  })
  const table = (entries: [string, string][]) => {
    const dl = element("dl")
    for (const [key, value] of entries) dl.append(element("dt", key), element("dd", value))
    root.append(dl)
  }
  const bytes = (value: number) =>
    value < 1024
      ? `${value} B`
      : `${(value / 1024 ** Math.min(4, Math.floor(Math.log(value) / Math.log(1024)))).toFixed(1)} ${["B", "KB", "MB", "GB", "TB"][Math.min(4, Math.floor(Math.log(value) / Math.log(1024)))]}`
  try {
    const key = config.key
    if (["markdown", "markdown_with_word_wrap", "text_editor"].includes(key)) {
      const content = await text(),
        extension = config.name.split(".").at(-1)!.toLowerCase()
      if (key === "text_editor") {
        const base = "https://drive.goblincwl.site/static/monaco-editor/vs"
        await script(`${base}/loader.js`)
        const requireAMD = w.require as any
        w.MonacoEnvironment = {
          getWorkerUrl: () =>
            URL.createObjectURL(
              new Blob(
                [
                  `self.MonacoEnvironment={baseUrl:${JSON.stringify(base.replace(/\/vs$/, "/"))}};importScripts(${JSON.stringify(base + "/base/worker/workerMain.js")});`,
                ],
                { type: "text/javascript" },
              ),
            ),
        }
        requireAMD.config({ paths: { vs: base } })
        await new Promise<void>((resolve, reject) =>
          requireAMD(["vs/editor/editor.main"], resolve, reject),
        )
        root.style.height = "calc(100vh - 24px)"
        const language =
          (
            {
              js: "javascript",
              ts: "typescript",
              tsx: "typescript",
              jsx: "javascript",
              py: "python",
              md: "markdown",
              yml: "yaml",
              sh: "shell",
              rs: "rust",
              cpp: "cpp",
              h: "cpp",
            } as Record<string, string>
          )[extension] || extension
        const editorTheme = (theme: string, palette: SandboxPreview["colors"]) => {
          // CSS minification shortens hex colours, but Monaco only accepts
          // six/eight-digit values. Normalize on initial load and theme changes.
          const background = palette.background.replace(
            /^#([\da-f]{3,4})$/i,
            (_match, hex: string) => `#${[...hex].map((digit) => digit + digit).join("")}`,
          )
          w.monaco.editor.defineTheme("drive-preview", {
            base: theme === "dark" ? "vs-dark" : "vs",
            inherit: true,
            rules: [],
            colors: {
              "editor.background": background,
              "editorGutter.background": background,
              "editorOverviewRuler.background": background,
            },
          })
          w.monaco.editor.setTheme("drive-preview")
        }
        editorTheme(config.theme, config.colors)
        const editor = w.monaco.editor.create(root, {
          value: content,
          language,
          readOnly: true,
          automaticLayout: true,
          theme: "drive-preview",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          scrollbar: { alwaysConsumeMouseWheel: false },
        })
        addEventListener("message", (event) => {
          if (
            event.source === parent &&
            event.data?.channel === config.channel &&
            event.data.type === "theme"
          )
            editorTheme(event.data.theme, event.data.colors)
        })
        const reportEditor = () => {
          const lines = editor.getModel()?.getLineCount() || 1
          reportHeight(lines * editor.getOption(w.monaco.editor.EditorOption.lineHeight) + 24)
        }
        const contentSize = editor.onDidContentSizeChange(reportEditor)
        reportEditor()
        addEventListener(
          "pagehide",
          () => {
            contentSize.dispose()
            editor.dispose()
          },
          { once: true },
        )
      } else if (["md", "markdown"].includes(extension)) {
        await Promise.all([localScript("marked.umd.js"), localScript("purify.min.js")])
        root.innerHTML = w.DOMPurify.sanitize(await w.marked.parse(content))
        if (key === "markdown_with_word_wrap")
          for (const pre of root.querySelectorAll("pre")) pre.style.whiteSpace = "pre-wrap"
        for (const image of root.querySelectorAll<HTMLImageElement>("img[src]")) {
          const source = image.getAttribute("src") || ""
          if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(source)) {
            const resolved = new URL(source, config.url),
              current = new URL(config.url)
            if (current.searchParams.has("pwd") && resolved.origin === current.origin)
              resolved.searchParams.set("pwd", current.searchParams.get("pwd")!)
            image.src = resolved.href
          }
          image.referrerPolicy = "no-referrer"
        }
        for (const link of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
          link.target = "_blank"
          link.rel = "noopener noreferrer"
        }
      } else {
        const pre = element("pre"),
          code = element("code", content)
        pre.append(code)
        root.append(pre)
        if (key === "markdown_with_word_wrap") pre.style.whiteSpace = "pre-wrap"
        await script(`${config.staticBase}vendor/highlightjs/11.11.1/highlight.min.js`)
        if (w.hljs.getLanguage(extension)) code.className = `language-${extension}`
        w.hljs.highlightElement(code)
      }
    } else if (key === "doc") {
      await script(npm("jszip", "3.10.1", "dist/jszip.min.js"))
      await script(`${resource}/docxjs/dist/docx-preview.min.js`)
      await w.docx.renderAsync(await (await read()).blob(), root, undefined, {
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: true,
      })
    } else if (key === "xls") {
      await script(`${resource}/exceljs/exceljs.min.js`)
      const workbook = new w.ExcelJS.Workbook()
      await workbook.xlsx.load(await (await read()).arrayBuffer())
      const tabs = element("nav"),
        output = element("div")
      root.append(tabs, output)
      const render = (sheet: any) => {
        output.replaceChildren()
        const grid = element("table")
        sheet.eachRow((row: any) => {
          const tr = element("tr")
          for (let i = 1; i <= sheet.columnCount; i++) {
            const cell = row.getCell(i),
              td = element("td", cell.text ?? "")
            if (cell.font?.bold) td.style.fontWeight = "bold"
            if (cell.font?.italic) td.style.fontStyle = "italic"
            const bg = cell.fill?.fgColor?.argb,
              fg = cell.font?.color?.argb
            if (/^[a-f\d]{8}$/i.test(bg || "")) td.style.background = `#${bg.slice(2)}`
            if (/^[a-f\d]{8}$/i.test(fg || "")) td.style.color = `#${fg.slice(2)}`
            tr.append(td)
          }
          grid.append(tr)
        })
        output.append(grid)
        for (const button of tabs.querySelectorAll("button"))
          button.setAttribute("aria-pressed", String(button.textContent === sheet.name))
      }
      for (const sheet of workbook.worksheets) {
        const button = element("button", sheet.name)
        button.onclick = () => render(sheet)
        tabs.append(button)
      }
      if (workbook.worksheets[0]) render(workbook.worksheets[0])
    } else if (key === "ppt") {
      const base = `${resource}/ppt.js`
      style(`${base}/css/pptxjs.css`)
      style(`${base}/css/nv.d3.min.css`)
      for (const url of [
        `${base}/js/jquery-1.11.3.min.js`,
        npm("jszip", "2.6.1", "dist/jszip.min.js"),
        ...["filereader", "d3.min", "nv.d3.min", "pptxjs", "divs2slides"].map(
          (name) => `${base}/js/${name}.js`,
        ),
      ])
        await script(url)
      w.$(root).pptxToHtml({ pptxFileUrl: config.url, slideMode: false, keyBoardShortCut: false })
    } else if (key === "flash") {
      const base = `${config.staticBase}vendor/ruffle/0.5.0/`
      w.RufflePlayer = {
        ...(w.RufflePlayer || {}),
        config: { ...w.RufflePlayer?.config, publicPath: base },
      }
      // Ruffle selects one of its WASM builds lazily. Read that large asset
      // through the parent's persistent cache without eagerly fetching both.
      const originalFetch = window.fetch.bind(window)
      window.fetch = (input, options) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href)
        const name = url.href.startsWith(base) ? url.href.slice(base.length) : ""
        if (
          ["6ce4f603a1fe7cc88438.wasm", "a71cef02d58dcec6f55f.wasm"].includes(name) &&
          (options?.method || (input instanceof Request ? input.method : "GET")).toUpperCase() ===
            "GET"
        ) {
          return frameAsset(name, "preview").then(
            (buffer) => new Response(buffer, { headers: { "Content-Type": "application/wasm" } }),
          )
        }
        return originalFetch(input, options)
      }
      await localScript("ruffle.js")
      const player = w.RufflePlayer.newest().createPlayer()
      player.style.width = "100%"
      player.style.height = "calc(100vh - 24px)"
      root.append(player)
      await player.load(config.url)
    } else if (key === "asciinema") {
      await Promise.all([
        localStyle("asciinema-player.css"),
        localScript("asciinema-player.min.js"),
      ])
      const player = w.AsciinemaPlayer.create(config.url, root, { fit: "width", autoPlay: false })
      addEventListener("pagehide", () => player.dispose?.(), { once: true })
    } else if (key === "pdf") {
      const moduleURL = npm("@embedpdf/snippet", "2.14.4", "dist/embedpdf.js"),
        module = await import(/* @vite-ignore */ moduleURL)
      root.style.height = "calc(100vh - 24px)"
      const viewer = module.default.init({
        worker: false,
        type: "container",
        target: root,
        src: config.url,
        theme: { preference: config.theme },
        i18n: { defaultLocale: "zh-CN", fallbackLocale: "en" },
        wasmUrl: npm("@embedpdf/snippet", "2.14.4", "dist/pdfium.wasm"),
      })
      addEventListener("message", (event) => {
        if (
          event.source === parent &&
          event.data?.channel === config.channel &&
          event.data.type === "theme"
        )
          viewer?.setTheme(event.data.theme)
      })
    } else if (key === "video" || key === "aliyun_video") {
      await renderVideo({
        config,
        w,
        root,
        frameAsset,
        script,
        localScript,
        reportHeight,
        send,
        resumeTargetFor,
        chooseSubtitle,
        mountFullscreen,
        mountPanels,
        findEmbeddedFont,
        playerSkinCSS,
        element,
        key,
      })
    } else if (key === "audio") {
      await Promise.all([localStyle("APlayer.min.css"), localScript("APlayer.min.js")])
      const audioPreferences = config.preferences || {}
      const player = new w.APlayer({
        container: root,
        autoplay: Boolean(config.autoplay),
        volume: Math.min(1, audioPreferences.volume ?? 0.7),
        theme: config.colors.accent,
        lrcType: config.playlist?.some((item) => item.lrc) ? 3 : 0,
        audio: config.playlist?.length
          ? config.playlist
          : [{ name: config.name, artist: "", url: config.url, cover: config.cover || "" }],
      })
      player.audio.volume = Math.min(1, audioPreferences.volume ?? 0.7)
      player.audio.muted = audioPreferences.muted ?? false
      let lastVolume = player.audio.volume,
        lastMuted = player.audio.muted
      player.audio.addEventListener("volumechange", () => {
        if (player.audio.volume === lastVolume && player.audio.muted === lastMuted) return
        lastVolume = player.audio.volume
        lastMuted = player.audio.muted
        parent.postMessage(
          {
            channel: config.channel,
            type: "videoPreference",
            patch: { volume: lastVolume, muted: lastMuted },
          },
          "*",
        )
      })
      player.on("error", () => send("error", "浏览器无法播放此音频"))
      if ((config.currentAudio || 0) > 0) player.list.switch(config.currentAudio)
      addEventListener("pagehide", () => player.destroy(), { once: true })
    } else if (key === "video360") {
      await script(npm("@egjs/view360", "4.0.0-beta.7", "dist/view360.pkgd.min.js"))
      const module = w.View360
      style(npm("@egjs/view360", "4.0.0-beta.7", "css/view360.min.css"))
      root.className = "view360-container"
      root.style.height = "calc(100vh - 24px)"
      root.append(Object.assign(element("canvas"), { className: "view360-canvas" }))
      const viewer = new module(root, {
        projection: new module.EquirectProjection({
          src: config.url,
          video: { autoplay: Boolean(config.autoplay) },
        }),
        plugins: [new module.ControlBar()],
      })
      addEventListener("pagehide", () => viewer.destroy(), { once: true })
    } else if (key === "heif") {
      const base = "https://drive.goblincwl.site/static/libheif"
      await script(`${base}/libheif.js`)
      const wasmBinary = await (await fetch(`${base}/libheif.wasm`)).arrayBuffer()
      const lib = await w.libheif({ wasmBinary }),
        decoder = new lib.HeifDecoder(),
        frames = decoder.decode(await (await read()).arrayBuffer())
      if (!frames.length) throw new Error("无法解码此图片")
      const image = frames[0],
        canvas = element("canvas")
      canvas.width = image.get_width()
      canvas.height = image.get_height()
      root.append(canvas)
      await new Promise<void>((resolve, reject) =>
        image.display(new ImageData(canvas.width, canvas.height), (data: ImageData | null) => {
          if (!data) return reject(new Error("图片解码失败"))
          canvas.getContext("2d")!.putImageData(data, 0, 0)
          resolve()
        }),
      )
    } else if (key === "torrent") {
      const buffer = new Uint8Array(await (await read()).arrayBuffer()),
        decoder = new TextDecoder()
      let cursor = 0,
        infoStart = 0,
        infoEnd = 0
      const parse = (): any => {
        const tag = buffer[cursor++]
        if (tag === 105) {
          const end = buffer.indexOf(101, cursor),
            value = Number(decoder.decode(buffer.subarray(cursor, end)))
          if (end < 0 || !Number.isFinite(value)) throw new Error("无效种子文件")
          cursor = end + 1
          return value
        }
        if (tag === 108 || tag === 100) {
          const value: any = tag === 108 ? [] : Object.create(null)
          while (buffer[cursor] !== 101) {
            if (cursor >= buffer.length) throw new Error("无效种子文件")
            if (tag === 108) value.push(parse())
            else {
              const key = decoder.decode(parse())
              if (key === "info") infoStart = cursor
              value[key] = parse()
              if (key === "info") infoEnd = cursor
            }
          }
          cursor++
          return value
        }
        cursor--
        const end = buffer.indexOf(58, cursor),
          length = Number(decoder.decode(buffer.subarray(cursor, end)))
        if (
          end < 0 ||
          !Number.isSafeInteger(length) ||
          length < 0 ||
          end + 1 + length > buffer.length
        )
          throw new Error("无效种子文件")
        cursor = end + 1 + length
        return buffer.subarray(end + 1, cursor)
      }
      const torrent = parse(),
        info = torrent.info
      if (!info) throw new Error("无效种子文件")
      const digest = await crypto.subtle.digest("SHA-1", buffer.slice(infoStart, infoEnd)),
        hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
      const files = info.files || [{ path: [info.name], length: info.length }]
      table([
        ["名称", decoder.decode(info["name.utf-8"] || info.name)],
        ["总大小", bytes(files.reduce((sum: number, f: any) => sum + f.length, 0))],
        ["Info Hash", hash],
        ["分片大小", bytes(info["piece length"] || 0)],
      ])
      const list = element("ul")
      for (const f of files)
        list.append(
          element(
            "li",
            `${f.path.map((p: Uint8Array) => decoder.decode(p)).join("/")} · ${bytes(f.length)}`,
          ),
        )
      root.append(list)
    } else if (key === "ipa" || key === "plist") {
      if (key === "ipa") {
        await script(npm("jszip", "3.10.1", "dist/jszip.min.js"))
        const zip = await w.JSZip.loadAsync(await (await read()).arrayBuffer())
        const entry = Object.values(zip.files).find((f: any) =>
          /^Payload\/[^/]+\.app\/Info\.plist$/.test(f.name),
        ) as any
        if (!entry) throw new Error("未找到应用信息")
        const data = await entry.async("uint8array")
        if (new TextDecoder().decode(data.subarray(0, 8)).startsWith("bplist")) {
          table([
            ["应用包", config.name],
            ["Info.plist", "二进制属性列表"],
          ])
          root.append(
            element(
              "pre",
              Object.keys(zip.files)
                .filter((name) => !name.endsWith("/"))
                .join("\n"),
            ),
          )
        } else root.append(element("pre", new TextDecoder().decode(data)))
      } else root.append(element("pre", await text()))
    }
    ready = true
    reportContent()
    requestAnimationFrame(() => {
      send("ready")
    })
  } catch (error) {
    send("error", error instanceof Error ? error.message : "此方式无法预览该文件")
  }
}
