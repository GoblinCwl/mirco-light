import { test } from "node:test"
import assert from "node:assert/strict"
import { BrowserTransport } from "./transport"
class Hls {
  constructor(public config: any) {}
  static Events = { ERROR: "error", FRAG_BUFFERED: "buffered", INIT_PTS_FOUND: "initPTS" }
  static isSupported = () => true
  handlers = new Map<string, (...args: any[]) => void>()
  loads: number[] = []
  on(name: string, fn: (...args: any[]) => void) {
    this.handlers.set(name, fn)
  }
  off(name: string) {
    this.handlers.delete(name)
  }
  loadSource() {}
  attachMedia() {}
  startLoad(position: number) {
    this.loads.push(position)
  }
  destroy() {
    this.handlers.clear()
  }
  stopLoad() {}
  fragment(start: number, end: number) {
    this.handlers.get("buffered")?.("buffered", { frag: { type: "main", start, end } })
  }
}
function setup(onError: (error: Error, decode: boolean) => void = () => {}, buffer: 6 | 30 = 30) {
  let ranges = [[120, 150]]
  const video = {
    currentTime: 42,
    readyState: 3,
    seeking: false,
    buffered: {
      get length() {
        return ranges.length
      },
      start: (i: number) => ranges[i][0],
      end: (i: number) => ranges[i][1],
    },
    removeAttribute() {},
    load() {},
  }
  const transport = new BrowserTransport(video as unknown as HTMLVideoElement, Hls, "mse", buffer)
  transport.attach({ url: "authorized", mediaType: "m3u8" }, 120, onError)
  const hls = (transport as any).hls as Hls
  return {
    transport,
    hls,
    video,
    buffer: (value: number[][]) => {
      ranges = value
    },
  }
}
test("high bitrate buffering keeps the upstream browser policy", () => {
  for (const cap of [6, 30] as const) {
    const { transport } = setup(void 0, cap)
    transport.attach(
      { url: "authorized", mediaType: "m3u8", maxStreamingBitrate: 3e7 },
      0,
      () => {},
    )
    assert.equal(transport.diagnostic.bufferSeconds, cap)
    transport.attach(
      { url: "authorized", mediaType: "m3u8", maxStreamingBitrate: 1e7 },
      0,
      () => {},
    )
    assert.equal(transport.diagnostic.bufferSeconds, 30)
    transport.dispose()
  }
})
test("a large fMP4 timestamp shift requests one compatibility negotiation without moving the video clock", async () => {
  let errors = 0
  const { transport, hls } = setup((_error, decode) => {
    assert(decode)
    errors++
  })
  const event = { id: "main", frag: { initSegment: {} }, initPTS: -136136, timescale: 24e3 }
  hls.handlers.get("initPTS")?.("initPTS", event)
  hls.handlers.get("initPTS")?.("initPTS", event)
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  assert.equal(errors, 1)
  assert(Math.abs(transport.diagnostic.timelineOffset + 5.6723333333) < 0.001)
  transport.dispose()
})
test("small encoder delay and native TS timestamp bases do not trigger fMP4 fallback", async () => {
  let errors = 0
  const { transport, hls } = setup(() => errors++)
  hls.handlers.get("initPTS")?.("initPTS", {
    id: "main",
    frag: { initSegment: {} },
    initPTS: -1920,
    timescale: 9e4,
  })
  hls.handlers.get("initPTS")?.("initPTS", { id: "main", frag: {}, initPTS: 9e5, timescale: 9e4 })
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  assert.equal(errors, 0)
  transport.dispose()
})
test("buffered seeks retain the media engine without another load", () => {
  const { transport, hls } = setup()
  transport.seek(130)
  assert.deepEqual(hls.loads, [])
  transport.dispose()
})
test("a fragment silently discarded by MSE requests one controlled recovery", async () => {
  let recoveries = 0
  const { transport, hls } = setup((_error, decode) => {
    assert.equal(decode, true)
    recoveries++
  })
  transport.seek(42)
  hls.fragment(39, 45)
  hls.fragment(39, 45)
  await new Promise((resolve) => setTimeout(resolve, 800))
  assert.deepEqual(hls.loads, [42])
  assert.equal(recoveries, 1)
  transport.dispose()
})
test("a delayed buffer append or closing cancels recovery", async () => {
  let recoveries = 0
  const { transport, hls, buffer } = setup(() => recoveries++)
  transport.seek(42)
  hls.fragment(39, 45)
  buffer([[39, 45]])
  await new Promise((resolve) => setTimeout(resolve, 800))
  assert.equal(recoveries, 0)
  buffer([])
  transport.seek(42)
  hls.fragment(39, 45)
  transport.dispose()
  await new Promise((resolve) => setTimeout(resolve, 800))
  assert.equal(recoveries, 0)
})

test("encoder preroll can finish before the bounded HLS fragment deadline", () => {
  const { transport, hls } = setup()
  assert(
    hls.config.fragLoadingTimeOut > 41000,
    "cold encoder was aborted before the observed preroll completed",
  )
  assert(
    hls.config.fragLoadingTimeOut < 60000,
    "fragment deadline must fit the controller buffering deadline",
  )
  transport.dispose()
})

test("bytes buffered without a decoded seek frame request compatibility", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  let failures = 0
  const { transport, video, buffer } = setup((_error, decode) => {
    assert(decode)
    failures++
  })
  buffer([[39, 45]])
  video.readyState = 1
  video.seeking = true
  transport.seek(42)
  t.mock.timers.tick(3001)
  assert.equal(failures, 1)
  transport.dispose()
})
