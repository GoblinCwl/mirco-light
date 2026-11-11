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
      if (this.sourceMenu) this.sourceMenu.value = mode
      this.keyword.textContent =
        mode === "auto" ? `自动匹配词：${keyword}` : mode === "offline" ? "离线 XML 弹幕" : ""
      this.title.textContent = matchedTitle ? `匹配剧集：${matchedTitle}` : ""
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
  private keyword = document.createElement("p")
  private title = document.createElement("p")
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
    const area = document.createElement("div")
    area.className = "quartz-danmuku-source"
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
    input.type = "search"
    input.placeholder = "搜索弹幕节目"
    input.setAttribute("aria-label", "搜索弹幕节目")
    input.value = this.config.name.replace(/\.[^.]+$/, "").replace(/\s*S\d+E\d+.*$/i, "")
    const submit = document.createElement("button")
    submit.type = "submit"
    submit.textContent = "搜索"
    form.append(input, submit)
    const results = document.createElement("div")
    results.className = "quartz-danmuku-results"
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
      if (!input.value.trim()) return
      submit.disabled = true
      try {
        const value = await this.rpc("search", { query: input.value.trim() })
        results.replaceChildren()
        for (const anime of value.animes || [])
          results.append(
            button(anime.title, () => {
              void (async () => {
                try {
                  const episodes = await this.rpc("episodes", { selection: anime.id })
                  results.replaceChildren(button("返回搜索结果", () => form.requestSubmit()))
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
        this.notice((error as Error).message)
      } finally {
        submit.disabled = false
      }
    }
    this.keyword.className = this.title.className = "quartz-danmuku-source-status"
    this.keyword.textContent = `自动匹配词：${this.config.name}`
    const sourceLabel=document.createElement("label")
    sourceLabel.append("弹幕来源",source)
    area.append(sourceLabel, this.keyword, this.title, form, results)
    panel.prepend(area)
    area.addEventListener("keydown", (event) => event.stopPropagation())
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
