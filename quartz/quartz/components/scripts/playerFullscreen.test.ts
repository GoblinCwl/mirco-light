import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { transformSync } from "esbuild"
import { mountPlayerFullscreen } from "./playerFullscreen"

test("fullscreen buttons preserve their return mode, recover failures and support native-video fallback", async (t) => {
  const descriptors = new Map(
    ["document", "addEventListener"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  )
  const doc = Object.assign(new EventTarget(), {
    fullscreenEnabled: true,
    fullscreenElement: null as any,
    exitFullscreen: async () => {},
  })
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc })
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, value: () => {} })
  t.after(() => {
    for (const [key, value] of descriptors) {
      if (value) Object.defineProperty(globalThis, key, value)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  const classes = new Set<string>(),
    errors: string[] = []
  let reject = false
  const element = {
    classList: {
      toggle: (name: string, on: boolean) => {
        on ? classes.add(name) : classes.delete(name)
      },
    },
    requestFullscreen: async () => {
      if (reject) throw Error("denied")
      doc.fullscreenElement = element
      doc.dispatchEvent(new Event("fullscreenchange"))
    },
  }
  doc.exitFullscreen = async () => {
    doc.fullscreenElement = null
    doc.dispatchEvent(new Event("fullscreenchange"))
  }
  const video = Object.assign(new EventTarget(), {
    webkitDisplayingFullscreen: false,
    webkitEnterFullscreen: () => {},
    webkitExitFullscreen: () => {},
  })
  video.webkitEnterFullscreen = () => {
    video.webkitDisplayingFullscreen = true
    video.dispatchEvent(new Event("webkitbeginfullscreen"))
  }
  video.webkitExitFullscreen = () => {
    video.webkitDisplayingFullscreen = false
    video.dispatchEvent(new Event("webkitendfullscreen"))
  }
  class Player {
    static FULLSCREEN_WEB_IN_BODY = true
    template = { $player: element, $video: video }
    private web = false
    listeners = new Map<string, Set<(...args: any[]) => void>>()
    on(name: string, fn: (...args: any[]) => void) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set())
      this.listeners.get(name)!.add(fn)
    }
    off(name: string, fn: (...args: any[]) => void) {
      this.listeners.get(name)?.delete(fn)
    }
    get fullscreenWeb() {
      return this.web
    }
    set fullscreenWeb(value: boolean) {
      this.web = value
      this.emit("fullscreenWeb", value)
      if (!value && Player.FULLSCREEN_WEB_IN_BODY && doc.fullscreenElement) {
        doc.fullscreenElement = null
      }
    }
    emit(name: string, ...args: any[]) {
      for (const fn of this.listeners.get(name) || []) fn(...args)
    }
  }
  const player = new Player(),
    lifetime = new AbortController()
  const webLayout: boolean[] = []
  const control = mountPlayerFullscreen(player, {
    signal: lifetime.signal,
    onError: (message) => errors.push(message),
    webChanged: (active) => webLayout.push(active),
  })
  assert.equal(Player.FULLSCREEN_WEB_IN_BODY, false)
  // Inline -> system -> inline.
  await control.toggleNative()
  assert.equal(doc.fullscreenElement, element)
  await control.toggleNative()
  assert.equal(player.fullscreenWeb, false)
  // Web -> system -> Web, without losing the system fullscreen node.
  await control.toggleWeb()
  assert.equal(player.fullscreenWeb, true)
  await control.toggleNative()
  assert.equal(doc.fullscreenElement, element)
  assert.equal(player.fullscreenWeb, false)
  await control.toggleNative()
  assert.equal(player.fullscreenWeb, true)
  assert.equal(
    webLayout.includes(false),
    false,
    "entering/exiting native must not tear down the outer web-fullscreen layout",
  )
  // Failed entry preserves Web.
  reject = true
  await control.toggleNative()
  assert.equal(player.fullscreenWeb, true)
  assert.equal(errors.length, 1)
  reject = false
  // The Web button from system fullscreen always returns to Web.
  await control.toggleWeb()
  await control.toggleNative()
  await control.toggleWeb()
  assert.equal(player.fullscreenWeb, true)
  // Esc/browser-native exit restores the originating mode as well.
  await control.toggleNative()
  await doc.exitFullscreen()
  await Promise.resolve()
  assert.equal(player.fullscreenWeb, true)
  // Safari native video APIs use the same return policy.
  doc.fullscreenEnabled = false
  await control.toggleNative()
  assert.equal(video.webkitDisplayingFullscreen, true)
  await control.toggleNative()
  assert.equal(video.webkitDisplayingFullscreen, false)
  assert.equal(player.fullscreenWeb, true)
  await control.toggleNative()
  assert.equal(video.webkitDisplayingFullscreen,true)
  // WebKit's end event can arrive before its fullscreen property is updated.
  video.dispatchEvent(new Event("webkitendfullscreen"))
  await Promise.resolve()
  assert.equal(player.fullscreenWeb,true)
  video.webkitDisplayingFullscreen=false
  lifetime.abort()
  await control.toggleWeb()
  assert.equal(player.fullscreenWeb, true)
})

test("the shared fullscreen helper remains self-contained when serialized into the ordinary preview", () => {
  const module = { exports: {} as { mountPlayerFullscreen: typeof mountPlayerFullscreen } }
  const code = transformSync(
    readFileSync(new URL("./playerFullscreen.ts", import.meta.url), "utf8"),
    { loader: "ts", format: "cjs", minify: true },
  ).code
  Function("module", "exports", code)(module, module.exports)
  const isolated = Function(`return (${module.exports.mountPlayerFullscreen.toString()})`)()
  assert.equal(typeof isolated, "function")
  // Accessing the supplied template is its first dependency, rather than a lost module import.
  assert.throws(
    () =>
      isolated(
        {
          get template() {
            throw Error("fixture stop")
          },
        },
        {},
      ),
    /fixture stop/,
  )
})
