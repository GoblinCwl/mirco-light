import { mountSettingsRange } from "./settingsRange"
import { loadDanmakuRows } from "./danmakuLoader"
import type { PlayerBridge } from "./bridge"
import type { PlayerConfig } from "./types"

/** An optional background feature. Its requests/loading can never pause video. */
export class DanmakuManager {
  private sequence = 0
  private selection = 0
  private requests = new Map<
    number,
    {
      resolve: (value: any) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private lifetime = new AbortController()
  private automatic?: Promise<any>
  private sourceMenu?: HTMLSelectElement
  private activeMode = "auto"
  private manual?: { id: string; title: string; rows: any[] }
  constructor(
    private player: any,
    private config: PlayerConfig,
    private bridge: PlayerBridge,
    private status: (text: string) => void,
    private notice: (text: string) => void,
  ) {
    addEventListener(
      "message",
      (event) => {
        if (
          event.source !== parent ||
          event.data?.channel !== config.channel ||
          event.data.type !== "danmakuResponse"
        )
          return
        const pending = this.requests.get(event.data.id)
        if (!pending) return
        this.requests.delete(event.data.id)
        clearTimeout(pending.timer)
        event.data.error
          ? pending.reject(new Error(event.data.error))
          : pending.resolve(event.data.value)
      },
      { signal: this.lifetime.signal },
    )
  }
  private rpc(action: string, fields: Record<string, string> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence,
        timer = setTimeout(
          () => {
            this.requests.delete(id)
            reject(new Error("弹幕请求超时"))
          },
          action === "auto" ? 150000 : 46000,
        )
      this.requests.set(id, { resolve, reject, timer })
      this.bridge.send("danmakuRequest", { id, action, ...fields })
    })
  }
  private async offline() {
    if (!this.config.danmu) throw new Error("没有可用的离线弹幕")
    const response = await fetch(this.config.danmu, { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error("离线弹幕读取失败")
    const xml = new DOMParser().parseFromString(await response.text(), "application/xml")
    if (xml.querySelector("parsererror")) throw new Error("离线弹幕格式无效")
    return Array.from(xml.getElementsByTagName("d"))
      .slice(0, 100000)
      .flatMap((node) => {
        const [time, mode, , color] = (node.getAttribute("p") || "").split(",").map(Number),
          text = node.textContent || ""
        return Number.isFinite(time) &&
          time >= 0 &&
          [1, 2, 3, 4, 5, 6].includes(mode) &&
          text.trim()
          ? [
              {
                text: text.slice(0, 1000),
                time: time || 0.000001,
                mode: mode === 4 ? 2 : mode === 5 ? 1 : 0,
                color:
                  "#" +
                  (Number.isFinite(color) ? Math.max(0, Math.min(0xffffff, color)) : 0xffffff)
                    .toString(16)
                    .padStart(6, "0"),
              },
            ]
          : []
      })
      .sort((a, b) => a.time - b.time)
  }
  async load(mode = "auto", id?: string, title?: string) {
    const own = ++this.selection
    this.status(mode === "auto" ? "弹幕匹配中…" : "弹幕加载中…")
    try {
      let rows: any[],
        message: string,
        matchedTitle = "",
        keyword = ""
      if (mode === "offline") {
        rows = await this.offline()
        message = `离线弹幕 · ${rows.length} 条`
      } else if (mode === "manual") {
        const cached = !id ? this.manual : undefined
        id ||= cached?.id
        title ||= cached?.title
        if (!id) throw new Error("请先搜索并选择集数")
        rows = cached?.rows || (await this.rpc("select", { selection: id })).comments || []
        if (!rows.length) throw new Error("所选集数暂无弹幕，保留当前弹幕")
        matchedTitle = title || "手动选择"
        message = `${matchedTitle} · ${rows.length} 条`
      } else {
        this.automatic ||= this.rpc("auto")
        const result = await this.automatic
        rows = result.comments || []
        keyword = result.keyword || this.config.name
        matchedTitle = result.title || ""
        if (!rows.length && this.config.danmu) {
          rows = await this.offline()
          message = `${result.matchError ? "自动匹配失败" : "未匹配到在线弹幕"}，已使用离线弹幕 · ${rows.length} 条`
        } else
          message = rows.length
            ? `弹幕匹配成功 · ${result.source || "danmu-api"} · ${rows.length} 条`
            : result.matchError || "未匹配到弹幕，可手动搜索"
      }
      if (own !== this.selection || this.lifetime.signal.aborted) return
      const engine = this.player.plugins.artplayerPluginDanmuku
      await loadDanmakuRows(
        engine,
        rows,
        () => own === this.selection && !this.lifetime.signal.aborted,
      )
      if (own !== this.selection) return
      this.activeMode = mode
      if (mode === "manual") {
        this.manual = { id: id!, title: matchedTitle, rows }
        if (
          this.sourceMenu &&
          !Array.from(this.sourceMenu.options).some((o) => o.value === "manual")
        )
          this.sourceMenu.add(new Option("手动选择", "manual"))
      }
      if (this.sourceMenu) {
        this.sourceMenu.value = mode
        this.sourceMenu.dispatchEvent(new Event("quartz-danmaku-source-changed", { bubbles: true }))
      }
      this.keyword.textContent =
        mode === "auto" ? keyword : ""
      this.title.textContent = matchedTitle || ""
      this.notice(message)
    } catch (error) {
      if (own === this.selection) {
        if (this.sourceMenu) this.sourceMenu.value = this.activeMode
        this.notice((error as Error).message)
      }
    } finally {
      if (own === this.selection) this.status("")
    }
  }
  private keyword = document.createElement("dd")
  private title = document.createElement("dd")
  mount() {
    const save = () => {
      const option = this.player.plugins.artplayerPluginDanmuku?.option
      if (!option) return
      const { opacity, fontSize, margin, modes, speed, visible, antiOverlap, synchronousPlayback } =
        option
      this.bridge.send("videoPreference", {
        patch: {
          danmuku: {
            opacity,
            fontSize,
            margin,
            modes,
            speed,
            visible,
            antiOverlap,
            synchronousPlayback,
          },
        },
      })
    }
    for (const name of ["config", "show", "hide"])
      this.player.on("artplayerPluginDanmuku:" + name, save)

    const panel = this.player.template.$player.querySelector(
      ".apd-config-panel-inner",
    ) as HTMLElement
    if (!panel) return
    const display = document.createElement("div")
    display.className = "quartz-danmuku-display"
    const modes = panel.querySelector(".apd-config-mode")
    if (modes) {
      for (const child of Array.from(modes.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) child.remove()
      }
      modes.setAttribute("role", "group")
      modes.setAttribute("aria-label", "弹幕类型")
      display.append(modes)
    }
    const options = panel.querySelector(".apd-config-other")
    options?.setAttribute("role", "group")
    options?.setAttribute("aria-label", "弹幕播放选项")
    if (options) {
      const optionIcons = [
        [".apd-anti-overlap", '<path d="M4 7h11m-6 5h11M4 17h11"/>'],
        [".apd-sync-video", '<path d="M19 9a7 7 0 0 0-12-3L4 9m0-5v5h5m-4 6a7 7 0 0 0 12 3l3-3m0 5v-5h-5"/>'],
      ] as const
      for (const [selector, path] of optionIcons) {
        for (const icon of options.querySelectorAll<SVGSVGElement>(`${selector} svg`)) {
          icon.setAttribute("viewBox", "0 0 24 24")
          icon.setAttribute("aria-hidden", "true")
          const offMark = icon.classList.contains("apd-check-off")
            ? '<path d="m4 4 16 16" stroke="var(--q-surface)" stroke-width="4"/><path d="m4 4 16 16"/>'
            : ""
          icon.innerHTML = `<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}${offMark}</g>`
        }
      }
      display.append(options)
    }
    const plugin = this.player.plugins.artplayerPluginDanmuku
    const option = plugin.option
    const range = (key: string, label: string, min: number, max: number, step: number,
      value: number, change: (value: number) => void, format: (value: number) => string) => {
      const original = panel.querySelector<HTMLElement>(`.apd-config-${key}`)
      if (!original) return
      const row = document.createElement("div")
      row.className = "quartz-danmuku-setting-row"
      mountSettingsRange(row, label, min, max, step, value, change, format)
      original.hidden = true
      display.append(row)
    }
    range("opacity", "不透明度", 0, 100, 1, option.opacity * 100,
      value => plugin.config({ opacity: value / 100 }), value => `${value}%`)
    range("fontSize", "弹幕字号", 8, 120, 1, Number.parseFloat(option.fontSize),
      value => plugin.config({ fontSize: value }), value => `${value}px`)

    const areas = ["75%", "50%", "25%", 10] as const
    const areaLabels = ["1/4", "半屏", "3/4", "满屏"]
    const areaIndex = areas.findIndex(value => value === option.margin[1])
    const areaOptions = areaIndex < 0 ? [option.margin[1], ...areas] : areas
    const areaNames = areaIndex < 0 ? ["自定义", ...areaLabels] : areaLabels
    range("margin", "显示区域", 0, areaOptions.length - 1, 1, Math.max(0, areaIndex),
      value => plugin.config({ margin: [option.margin[0], areaOptions[value]] }),
      value => areaNames[value])
    const speeds = [10, 7.5, 5, 2.5, 1]
    const speedLabels = ["极慢", "较慢", "适中", "较快", "极快"]
    let speedIndex = speeds.indexOf(option.speed)
    if (speedIndex < 0) {
      speedIndex = speeds.filter(value => value > option.speed).length
      speeds.splice(speedIndex, 0, option.speed)
      speedLabels.splice(speedIndex, 0, "自定义")
    }
    range("speed", "滚动速度", 0, speeds.length - 1, 1, speedIndex,
      value => plugin.config({ speed: speeds[value] }), value => speedLabels[value])
    const area = document.createElement("div")
    area.className = "quartz-danmuku-source"
    area.tabIndex = -1
    const source = document.createElement("select")
    this.sourceMenu = source
    source.setAttribute("aria-label", "选择弹幕来源")
    source.append(new Option("自动匹配", "auto"), new Option("离线弹幕", "offline"))
    source.options[1].disabled = !this.config.danmu
    source.onchange = () => {
      void this.load(source.value)
    }
    const form = document.createElement("form")
    form.noValidate = true
    form.className = "quartz-danmuku-search"
    const input = document.createElement("input")
    input.type = "text"
    input.enterKeyHint = "search"
    input.placeholder = "搜索弹幕节目"
    input.setAttribute("aria-label", "搜索弹幕节目")
    input.value = this.config.name
      .replace(/\.[^.]+$/, "")
      .replace(/(?:\s*[-–—])?\s*S\d+E\d+.*$/i, "")
      .trim()
    const submit = document.createElement("button")
    submit.type = "submit"
    submit.setAttribute("aria-label", "搜索弹幕")
    submit.title = "搜索弹幕"
    submit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="5.8"/><path d="m15 15 4 4"/></svg>'
    form.append(input, submit)
    const results = document.createElement("div")
    results.className = "quartz-danmuku-results"
    results.setAttribute("aria-live", "polite")
    let programResults: Node[] | undefined
    const button = (text: string, action: () => void) => {
      const node = document.createElement("button")
      node.type = "button"
      node.className = "quartz-danmuku-result"
      node.textContent = text
      node.onclick = action
      return node
    }
    form.onsubmit = async (event) => {
      event.preventDefault()
      const query = input.value.trim()
      if (!query || submit.disabled) return
      submit.disabled = true
      programResults = undefined
      delete search.dataset.episodes
      showSearch(true)
      results.scrollTop = 0
      results.textContent = "正在搜索…"
      try {
        const value = await this.rpc("search", { query })
        results.replaceChildren()
        for (const anime of value.animes || [])
          results.append(
            button(anime.title, () => {
              void (async () => {
                try {
                  const firstResult = results.firstChild
                  const episodes = await this.rpc("episodes", { selection: anime.id })
                  if (search.hidden || programResults || results.firstChild !== firstResult) return
                  programResults = Array.from(results.childNodes)
                  search.dataset.episodes = ""
                  results.replaceChildren()
                  results.scrollTop = 0
                  for (const ep of episodes.episodes || [])
                    results.append(
                      button(ep.title || `第 ${ep.number} 集`, () => {
                        void this.load("manual", ep.id, `${anime.title} / ${ep.title}`)
                      }),
                    )
                } catch (error) {
                  this.notice((error as Error).message)
                }
              })()
            }),
          )
        if (!value.animes?.length) results.textContent = "没有找到对应结果"
      } catch (error) {
        results.textContent = (error as Error).message
      } finally {
        submit.disabled = false
      }
    }
    const match = document.createElement("dl")
    match.className = "quartz-danmuku-match"
    const matchRow = (label: string, value: HTMLElement) => {
      const row = document.createElement("div")
      const name = document.createElement("dt")
      name.textContent = label
      row.append(name, value)
      return row
    }
    match.append(matchRow("匹配词", this.keyword), matchRow("匹配结果", this.title))
    const sourceLabel = document.createElement("label")
    sourceLabel.append("弹幕来源", source)
    const search = document.createElement("div")
    search.className = "quartz-danmuku-search-panel"
    search.tabIndex = -1
    search.hidden = true
    const searchRow = document.createElement("div")
    searchRow.className = "quartz-danmuku-field"
    const searchLabel = document.createElement("span")
    searchLabel.textContent = "手动匹配"
    searchRow.append(searchLabel, form)
    const matching = document.createElement("div")
    matching.className = "quartz-danmuku-matching"
    const showSearch = (open: boolean) => {
      search.hidden = !open
      area.hidden = open
      const settings = matching.closest(".art-setting-panel")
      if (settings) settings.scrollTop = 0
      const view = open ? search : area
      view.focus({ preventScroll: true })
    }
    search.addEventListener("quartz-danmaku-search-back", () => {
      if (programResults) {
        results.replaceChildren(...programResults)
        programResults = undefined
        delete search.dataset.episodes
        results.scrollTop = 0
      } else showSearch(false)
    })
    search.append(results)
    area.append(match, sourceLabel, searchRow)
    matching.append(area, search)
    search.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") event.stopPropagation()
    })
    area.addEventListener("keydown", (event) => event.stopPropagation())
    const sourceLabelText = () =>
      Array.from(source.options).find(option => option.value === this.activeMode)?.text || ""
    return { matching, display, sourceLabelText }
  }
  dispose() {
    this.lifetime.abort()
    ++this.selection
    for (const pending of this.requests.values()) {
      clearTimeout(pending.timer)
      pending.reject(new DOMException("播放器已关闭", "AbortError"))
    }
    this.requests.clear()
  }
}
