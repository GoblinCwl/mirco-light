import { test } from "node:test"
import assert from "node:assert/strict"
import { PlaybackController } from "./controller"
import type { MediaTransport, PlaybackSource } from "./types"
class Video extends EventTarget {
  currentTime = 0
  duration = 3600
  readyState = 0
  seeking = false
  paused = true
  ended = false
  error: null | { message: string; code: number } = null
  play() {
    this.paused = false
    this.dispatchEvent(new Event("play"))
    if (this.readyState >= 2) this.dispatchEvent(new Event("playing"))
    return Promise.resolve()
  }
  pause() {
    this.paused = true
    this.dispatchEvent(new Event("pause"))
  }
}
class Transport implements MediaTransport {
  usesMse = false
  loads: string[] = []
  seeks: number[] = []
  seek(position: number) {
    this.seeks.push(position)
  }
  constructor(readonly video: Video) {}
  attach(
    source: PlaybackSource,
    position: number,
    onError: (error: Error, decode: boolean) => void,
  ) {
    this.loads.push(source.url)
    this.video.readyState = 0
    queueMicrotask(() => {
      if (source.url === "bad") {
        onError(new Error("fixture network failure"), false)
        return
      }
      this.video.currentTime = position
      this.video.readyState = 2
      this.video.dispatchEvent(new Event("loadedmetadata"))
      this.video.dispatchEvent(new Event("loadeddata"))
      this.video.dispatchEvent(new Event("canplay"))
    })
  }
  dispose() {}
}
const setup = (timeout = 100) => {
  const video = new Video(),
    transport = new Transport(video),
    controller = new PlaybackController(video as unknown as HTMLVideoElement, transport, timeout)
  return { video, transport, controller }
}
test("initial load and resume share one clock and preserve paused intent", async () => {
  const { video, controller } = setup()
  await controller.load({ url: "one", mediaType: "mp4" }, 900, false)
  assert.equal(controller.state.phase, "paused")
  assert.equal(video.currentTime, 900)
  assert.equal(video.paused, true)
  await controller.play()
  assert.equal(controller.state.phase, "playing")
  controller.dispose()
})
test("initial API negotiation preserves the user's latest play or pause intent", async () => {
  for (const wanted of [true, false]) {
    const { controller, video } = setup()
    let release!: (source: PlaybackSource) => void
    const pending = controller.load(
      new Promise<PlaybackSource>((resolve) => {
        release = resolve
      }),
      90,
      false,
    )
    await controller.play()
    if (!wanted) controller.pause()
    assert.equal(
      controller.state.phase,
      "loading",
      "pausing a pending request must not show a ready player",
    )
    release({ url: "one", mediaType: "mp4" })
    await pending
    assert.equal(video.currentTime, 90)
    assert.equal(video.paused, !wanted)
    controller.dispose()
  }
})
test("switch failure restores the old authorized source and its position", async () => {
  const { video, transport, controller } = setup()
  await controller.load({ url: "one", mediaType: "mp4" }, 120, true)
  video.currentTime = 180
  await assert.rejects(controller.load({ url: "bad", mediaType: "m3u8" }, 180, true), /fixture/)
  assert.equal(controller.source?.url, "one")
  assert.equal(video.currentTime, 180)
  assert.equal(video.paused, false)
  assert.deepEqual(transport.loads, ["one", "bad", "one"])
  controller.dispose()
})
test("negotiation failure keeps the old video without reloading it", async () => {
  const { controller, transport, video } = setup()
  await controller.load({ url: "one", mediaType: "mp4" }, 30, true)
  await assert.rejects(
    controller.load(Promise.reject(new Error("permission expired")), 30, true),
    /permission/,
  )
  assert.deepEqual(transport.loads, ["one"])
  assert.equal(controller.state.phase, "playing")
  assert.equal(video.paused, false)
  controller.dispose()
})
test("closing during negotiation cancels immediately and late responses cannot replace video", async () => {
  const { controller, transport } = setup()
  let release!: (source: PlaybackSource) => void
  const request = new Promise<PlaybackSource>((resolve) => {
      release = resolve
    }),
    pending = controller.load(request, 0, false)
  controller.dispose()
  await assert.rejects(pending, { name: "AbortError" })
  release({ url: "late", mediaType: "mp4" })
  await Promise.resolve()
  assert.deepEqual(transport.loads, [])
})
test("a stalled video ends in an explicit error instead of permanent loading", async () => {
  const { controller, transport } = setup(5)
  transport.attach = () => {}
  await assert.rejects(controller.load({ url: "slow", mediaType: "m3u8" }), /超时/)
  assert.equal(controller.state.phase, "error")
  controller.dispose()
})
test("an unbuffered seek cannot leave the player spinning forever", async () => {
  const { controller, video } = setup(5)
  await controller.load({ url: "one", mediaType: "m3u8" }, 120, false)
  video.seeking = true
  video.dispatchEvent(new Event("seeking"))
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(controller.state.phase, "error")
  assert.match(controller.state.error!, /缓冲超时/)
  controller.dispose()
})
test("media events after failure cannot hide the error behind a permanent spinner", async () => {
  const { video, controller, transport } = setup(5)
  transport.attach = () => {}
  await assert.rejects(controller.load({ url: "slow", mediaType: "m3u8" }))
  for (const name of ["waiting", "pause", "seeking", "seeked", "timeupdate"])
    video.dispatchEvent(new Event(name))
  assert.equal(controller.state.phase, "error")
  assert.match(controller.state.error!, /超时/)
  await assert.rejects(controller.play(), /超时/)
  controller.dispose()
})
test("paused MSE resume seeks at metadata before waiting for decoded data", async () => {
  const { video, controller, transport } = setup()
  transport.usesMse = true
  transport.attach = () =>
    queueMicrotask(() => {
      video.currentTime = 0
      video.readyState = 1
      video.dispatchEvent(new Event("loadedmetadata"))
      assert.equal(video.currentTime, 2987)
      video.readyState = 2
      video.dispatchEvent(new Event("canplay"))
    })
  await controller.load({ url: "resume", mediaType: "m3u8" }, 2987, false)
  assert.equal(controller.state.phase, "paused")
  assert.equal(controller.position, 2987)
  controller.dispose()
})

test("ordinary seeking keeps one source and preserves the user's paused intent", async () => {
  const { video, controller, transport } = setup()
  transport.usesMse = true
  await controller.load({ url: "one", mediaType: "m3u8" }, 600, false)
  controller.seek(180)
  video.dispatchEvent(new Event("seeking"))
  assert.equal(controller.state.phase, "seeking")
  video.dispatchEvent(new Event("seeked"))
  assert.equal(controller.state.phase, "paused")
  assert.equal(controller.position, 180)
  assert.deepEqual(transport.seeks, [180])
  assert.deepEqual(transport.loads, ["one"])
  controller.dispose()
})

test("native or player UI play/pause supersedes an earlier subtitle resume intent", async () => {
  const { video, controller } = setup()
  await controller.load({ url: "one", mediaType: "mp4" }, 30, false)
  const before = controller.intentVersion
  await video.play()
  video.pause()
  assert(controller.intentVersion > before)
  assert.equal(controller.playing, false)
  controller.dispose()
})

test("a playing quality switch freezes its captured position until negotiation commits", async () => {
  const { video, controller } = setup()
  await controller.load({ url: "one", mediaType: "mp4" }, 30, true)
  let resolve!: (source: PlaybackSource) => void
  const pending = controller.load(
    new Promise<PlaybackSource>((done) => {
      resolve = done
    }),
    30,
    true,
  )
  assert.equal(video.paused, true)
  assert.equal(controller.playing, true)
  controller.pause()
  await controller.play()
  assert.equal(
    video.paused,
    true,
    "play during negotiation changes intent without restarting old bytes",
  )
  assert.equal(controller.playing, true)
  assert.equal(video.currentTime, 30)
  resolve({ url: "two", mediaType: "mp4" })
  await pending
  assert.equal(video.currentTime, 30)
  assert.equal(video.paused, false)
  controller.dispose()
})

test("canplay and pause during an unfinished seek cannot replace its loading state", async () => {
  const { video, controller } = setup()
  await controller.load({ url: "one", mediaType: "mp4" }, 30, true)
  video.seeking = true
  video.dispatchEvent(new Event("seeking"))
  video.dispatchEvent(new Event("canplay"))
  assert.equal(controller.state.phase, "seeking")
  video.pause()
  assert.equal(controller.state.phase, "seeking")
  controller.pause()
  assert.equal(controller.state.phase, "seeking")
  video.seeking = false
  video.dispatchEvent(new Event("seeked"))
  assert.equal(controller.state.phase, "paused")
  controller.dispose()
})

test("an old transport error cannot interrupt a replacement being negotiated", async () => {
  const { controller, transport } = setup()
  const attach = transport.attach.bind(transport)
  let oldError!: (error: Error, decode: boolean) => void
  transport.attach = (source, position, onError) => {
    if (source.url === "one") oldError = onError
    attach(source, position, onError)
  }
  await controller.load({ url: "one", mediaType: "mp4" }, 42, false)
  let release!: (source: PlaybackSource) => void
  const replacement = new Promise<PlaybackSource>((resolve) => {
    release = resolve
  })
  const switching = controller.load(replacement, 42, false)
  oldError(new Error("old connection closed"), false)
  await Promise.resolve()
  assert.equal(controller.state.phase, "switching")
  release({ url: "two", mediaType: "mp4" })
  await switching
  assert.equal(controller.source?.url, "two")
  assert.equal(controller.state.phase, "paused")
  controller.dispose()
})

test("a rejected switch during a seek retains the seek loading state", async () => {
  const { controller, video } = setup()
  await controller.load({ url: "one", mediaType: "m3u8" }, 120, false)
  video.currentTime = 42
  video.seeking = true
  video.dispatchEvent(new Event("seeking"))
  await assert.rejects(controller.load(Promise.reject(new Error("temporary failure")), 42, false))
  assert.equal(controller.source?.url, "one")
  assert.equal(controller.state.phase, "seeking")
  controller.dispose()
})

test("the controller's delayed native pause event does not look like another user action", async () => {
  const { controller, video } = setup()
  await controller.load({ url: "one", mediaType: "mp4" }, 4, true)
  video.pause = () => {
    video.paused = true
    queueMicrotask(() => video.dispatchEvent(new Event("pause")))
  }
  controller.pause()
  const version = controller.intentVersion
  await Promise.resolve()
  assert.equal(controller.intentVersion, version)
  await controller.play()
  assert.equal(controller.playing, true)
  controller.dispose()
})
test("queued native events cannot overwrite the media element's newer state", async () => {
  const { controller, video } = setup()
  await controller.load({ url: "one", mediaType: "mp4" }, 4, true)
  controller.pause()
  video.dispatchEvent(new Event("play"))
  video.dispatchEvent(new Event("playing"))
  assert.equal(controller.state.phase, "paused")
  assert.equal(controller.playing, false)
  await controller.play()
  video.dispatchEvent(new Event("pause"))
  assert.equal(controller.state.phase, "playing")
  assert.equal(controller.playing, true)
  video.seeking = true
  video.dispatchEvent(new Event("seeking"))
  video.dispatchEvent(new Event("seeked"))
  assert.equal(controller.state.phase, "seeking")
  video.seeking = false
  video.dispatchEvent(new Event("seeked"))
  video.readyState = 4
  for (const event of ["waiting", "ended", "error"]) video.dispatchEvent(new Event(event))
  assert.equal(controller.state.phase, "playing")
  controller.dispose()
})

class FramedVideo extends Video {
  ownerDocument = { visibilityState: "visible" }
  callbacks = new Map<number, () => void>()
  sequence = 0
  requestVideoFrameCallback(callback: () => void) {
    const id = ++this.sequence
    this.callbacks.set(id, callback)
    return id
  }
  cancelVideoFrameCallback(id: number) {
    this.callbacks.delete(id)
  }
  present() {
    const pending = [...this.callbacks.values()]
    this.callbacks.clear()
    for (const callback of pending) callback()
  }
}
test("a moving audio clock without presented video frames requests decode recovery", async (t) => {
  let now = 1000,
    failures = 0
  t.mock.method(Date, "now", () => now)
  const video = new FramedVideo(),
    transport = new Transport(video)
  const controller = new PlaybackController(video as unknown as HTMLVideoElement, transport)
  controller.onDecodeError = async () => {
    failures++
    return false
  }
  await controller.load({ url: "one", mediaType: "m3u8" }, 120, true)
  now = 10000
  video.currentTime = 129
  video.dispatchEvent(new Event("timeupdate"))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(failures, 1)
  assert.equal(controller.state.phase, "error")
  controller.dispose()
})
test("hidden tabs and paused time do not count as decode stalls; sources rearm frame callbacks", async (t) => {
  let now = 1000,
    failures = 0
  t.mock.method(Date, "now", () => now)
  const video = new FramedVideo(),
    transport = new Transport(video)
  const controller = new PlaybackController(video as unknown as HTMLVideoElement, transport)
  controller.onDecodeError = async () => {
    failures++
    return false
  }
  await controller.load({ url: "one", mediaType: "m3u8" }, 120, true)
  assert.equal(video.callbacks.size, 1)
  video.ownerDocument.visibilityState = "hidden"
  now = 20000
  video.dispatchEvent(new Event("timeupdate"))
  video.ownerDocument.visibilityState = "visible"
  now = 30000
  video.dispatchEvent(new Event("timeupdate"))
  for (const time of [35000, 40000, 45000]) {
    now = time
    video.present()
    video.dispatchEvent(new Event("timeupdate"))
  }
  controller.pause()
  now = 60000
  await controller.play()
  now = 65000
  video.dispatchEvent(new Event("timeupdate"))
  await controller.load({ url: "two", mediaType: "m3u8" }, 240, false)
  assert.equal(video.callbacks.size, 1)
  assert.equal(failures, 0)
  controller.dispose()
  assert.equal(video.callbacks.size, 0)
})

test("Safari system fullscreen and PiP do not trigger recovery when webpage frame callbacks stop",async(t)=>{
 let now=1000,failures=0
 t.mock.method(Date,'now',()=>now)
 const video=Object.assign(new FramedVideo(),{webkitDisplayingFullscreen:false,webkitPresentationMode:'inline'})
 const controller=new PlaybackController(video as unknown as HTMLVideoElement,new Transport(video))
 controller.onDecodeError=async()=>{failures++;return false}
 await controller.load({url:'one',mediaType:'m3u8'},120,true)
 for(const mode of ['fullscreen','picture-in-picture']){
  video.webkitPresentationMode=mode;now+=20000;video.currentTime+=20;video.dispatchEvent(new Event('timeupdate'))
 }
 video.webkitPresentationMode='inline';video.webkitDisplayingFullscreen=true
 now+=20000;video.dispatchEvent(new Event('timeupdate'))
 video.webkitDisplayingFullscreen=false
 now+=20000;video.dispatchEvent(new Event('timeupdate'))
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(failures,0)
 assert.equal(controller.state.phase,'playing')
 now+=9000;video.dispatchEvent(new Event('timeupdate'))
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(failures,1,'returning inline still detects an actual decoder stall')
 controller.dispose()
})

test("attach timeout with bytes at the target is a decode failure, not a missing-network guess", async () => {
  const { video, transport, controller } = setup(5)
  Object.assign(video, { buffered: { length: 1, start: () => 39, end: () => 45 } })
  transport.attach = () => {
    video.currentTime = 42
    video.readyState = 1
    video.dispatchEvent(new Event("loadedmetadata"))
  }
  await assert.rejects(
    controller.load({ url: "buffered", mediaType: "m3u8" }, 42, false),
    (error: any) => error.decode === true,
  )
  controller.dispose()
})
