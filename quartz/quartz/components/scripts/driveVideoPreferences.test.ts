import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { readVideoPreferences, saveVideoPreferences, fallbackVideoScope } from "./driveVideoPreferences"

const originalMatchMedia = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia')
test('original quality is saved and restored for movies',()=>{
 const storage=new Map<string,string>()
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)}})
 const scope={program:'jellyfin:movie:test-original'}
 saveVideoPreferences(scope,{quality:'original'})
 assert.equal(readVideoPreferences(scope).quality,'original')
})
before(() => Object.defineProperty(globalThis, 'matchMedia', {configurable:true,value:() => ({matches:false})}))
after(() => {if(originalMatchMedia)Object.defineProperty(globalThis,'matchMedia',originalMatchMedia);else delete (globalThis as any).matchMedia})

test("global, program and season preferences inherit only their intended fields", () => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
  const season1 = { program: "show:a", season: "season:a1" }, season2 = { program: "show:a", season: "season:a2" }, other = { program: "movie:b" }
  saveVideoPreferences(season1, { volume: .35, muted: true, quality: "720", playbackRate: 1.5, aspectRatio: "4:3", audio: "japanese-aac", subtitle: "off", danmuku: { opacity: .5, fontSize: 20, visible: false, margin: [10, "50%"] } })
  assert.equal(readVideoPreferences(season2).playbackRate, 1.5)
  assert.equal(readVideoPreferences(season2).audio, undefined)
  assert.equal(readVideoPreferences(other).playbackRate, undefined)
  assert.equal(readVideoPreferences(other).volume, .35)
  assert.equal(readVideoPreferences(other).quality, "720")
  assert.equal(readVideoPreferences(other).danmuku?.opacity, .5)
  saveVideoPreferences(season2, { playbackRate: 2, quality: "1080" })
  assert.equal(readVideoPreferences(season1).playbackRate, 1.5)
  assert.equal(readVideoPreferences(season1).quality, "720")
  assert.equal(readVideoPreferences({ program: "show:a", season: "season:a3" }).playbackRate, 2)
  assert.equal(readVideoPreferences(other).quality, "1080")
  assert.equal(readVideoPreferences(season1).subtitle, "off")
  delete (globalThis as any).localStorage
})
test("unindexed season folders have distinct season scopes and a shared program", () => {
  const a = fallbackVideoScope("/@s/share/Show/Season 01/E01.mkv")
  const b = fallbackVideoScope("/@s/share/Show/Season 01/E02.mkv")
  const c = fallbackVideoScope("/@s/share/Show/Season 02/E01.mkv")
  assert.equal(a.season, b.season); assert.equal(a.program, c.program); assert.notEqual(a.season, c.season)
  assert.equal(fallbackVideoScope("/film/movie.mkv").season, undefined)
})


test("subtitle style persists only in its season and rejects invalid input", () => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
  try {
    const scope = { program: "show:a", season: "season:1" }
    const style = { scale: 1.25, x: -4, y: 7, bold: false }
    saveVideoPreferences(scope, { subtitleStyle: style })
    assert.deepEqual(readVideoPreferences(scope).subtitleStyle, style)
    assert.equal(readVideoPreferences({ program: "show:a", season: "season:2" }).subtitleStyle, undefined)
    assert.equal(readVideoPreferences({ program: "movie:a" }).subtitleStyle, undefined)
    for (const invalid of [{ scale: NaN, x: 0, y: 0 }, { scale: 3, x: 0, y: 0 }, { scale: 1, x: 51, y: 0 }]) {
      saveVideoPreferences(scope, { subtitleStyle: invalid })
      assert.deepEqual(readVideoPreferences(scope).subtitleStyle, style)
    }
    saveVideoPreferences(scope, { subtitleStyle: { scale: 1, x: 0, y: 0 } })
    assert.deepEqual(readVideoPreferences(scope).subtitleStyle, { scale: 1, x: 0, y: 0, bold: false })
  } finally { delete (globalThis as any).localStorage }
})

test("subtitle timing stays within the season; skip preference is shared", () => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
  try {
    const a = { program: "show:a", season: "season:1" }, b = { program: "show:a", season: "season:2" }
    saveVideoPreferences(a, { subtitleDelay: 1.25, skipIntroOutro: true })
    assert.equal(readVideoPreferences(a).subtitleDelay, 1.3)
    assert.equal(readVideoPreferences(b).subtitleDelay, undefined)
    assert.equal(readVideoPreferences(b).skipIntroOutro, true)
    saveVideoPreferences(a, { subtitleDelay: Infinity })
    saveVideoPreferences(a, { subtitleDelay: 61 })
    assert.equal(readVideoPreferences(a).subtitleDelay, 1.3)
    saveVideoPreferences(a, { subtitleDelay: 0, skipIntroOutro: false })
    assert.equal(readVideoPreferences(a).subtitleDelay, 0)
    assert.equal(readVideoPreferences(b).skipIntroOutro, false)
  } finally { delete (globalThis as any).localStorage }
})

test("volume boost is remembered up to 200 percent", () => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
  try {
    saveVideoPreferences({}, { volume: 1.8 })
    assert.equal(readVideoPreferences({}).volume, 1.8)
    saveVideoPreferences({}, { volume: 3 })
    assert.equal(readVideoPreferences({}).volume, 2)
    saveVideoPreferences({}, { volume: -1 })
    assert.equal(readVideoPreferences({}).volume, 0)
  } finally { delete (globalThis as any).localStorage }
})


test("text subtitle appearance is stored once per browser and shared across media", () => {
  const storage = new Map<string, string>()
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } })
  try {
    const first = { program: "movie:first" }, second = { program: "show:second", season: "season:2" }
    const appearance = { ...readVideoPreferences(first).subtitleAppearance!, font: "console" as const, verticalPosition: -4, textColor: "#aabbcc" }
    saveVideoPreferences(first, { subtitleAppearance: appearance })
    assert.deepEqual(readVideoPreferences(second).subtitleAppearance, appearance)
    assert.equal(storage.size, 1)
    saveVideoPreferences(second, { subtitleAppearance: { ...appearance, font: "invalid" } as any })
    assert.equal(readVideoPreferences(first).subtitleAppearance?.font, "casual")
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous)
    else Reflect.deleteProperty(globalThis, "localStorage")
  }
})
