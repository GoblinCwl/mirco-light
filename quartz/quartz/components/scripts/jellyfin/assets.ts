import type { PlayerBridge } from "./bridge"

export class PlayerAssets {
  private urls: string[] = []
  private scripts = new Map<string, Promise<void>>()
  constructor(private bridge: PlayerBridge) {}
  url(data: BlobPart, type: string) {
    const url = URL.createObjectURL(new Blob([data], { type }))
    this.urls.push(url)
    return url
  }
  async script(name: string, kind: "player" | "subtitle" = "player") {
    let pending = this.scripts.get(name)
    if (!pending) {
      pending = (async () => {
        const src = this.url(await this.bridge.asset(name, kind), "text/javascript")
        await new Promise<void>((resolve, reject) => {
          const tag = document.createElement("script"),
            timer = setTimeout(() => reject(new Error("播放器组件加载超时")), 30000)
          tag.src = src
          tag.onload = () => {
            clearTimeout(timer)
            resolve()
          }
          tag.onerror = () => {
            clearTimeout(timer)
            reject(new Error("播放器组件加载失败"))
          }
          document.head.append(tag)
        })
      })().catch((error) => {
        this.scripts.delete(name)
        throw error
      })
      this.scripts.set(name, pending)
    }
    return pending
  }
  async assWorker() {
    await this.script("subtitles-octopus.js", "subtitle")
    const [worker, wasm] = await Promise.all([
      this.bridge.asset("subtitles-octopus-worker.js"),
      this.bridge.asset("subtitles-octopus-worker.wasm"),
    ])
    const wasmUrl = this.url(wasm, "application/wasm")
    const source = new TextDecoder()
      .decode(worker)
      .replaceAll('"subtitles-octopus-worker.wasm"', JSON.stringify(wasmUrl))
    return this.url(
      source +
        `\n;(()=>{const ready=Module.onRuntimeInitialized;Module.onRuntimeInitialized=function(){ready.apply(this,arguments);postMessage({target:'ready',quartzSubtitleReady:'initial'})}})();`,
      "text/javascript",
    )
  }
  async pgs() {
    const [module, worker] = await Promise.all([
      this.bridge.asset("libpgs.js"),
      this.bridge.asset("libpgs.worker.js"),
    ])
    const moduleUrl = this.url(module, "text/javascript")
    const workerUrl = this.url(
      new Blob([
        worker,
        `\nself.addEventListener('unhandledrejection',e=>{self.postMessage({op:'quartzPgsError'});e.preventDefault()})`,
      ]),
      "text/javascript",
    )
    return { library: await import(/* @vite-ignore */ moduleUrl), workerUrl }
  }
  async fallbackFont() {
    return this.url(await this.bridge.asset("SourceHanSansCN-Bold.woff2"), "font/woff2")
  }
  dispose() {
    for (const url of this.urls) URL.revokeObjectURL(url)
    this.urls = []
  }
}
