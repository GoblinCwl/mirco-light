import { test } from "node:test"
import assert from "node:assert/strict"
import { mountAssClock } from "./assClock"

test("ASS worker rebases forward/backward seeks, buffering, rate and paused seeks to the media clock", () => {
  const video = Object.assign(new EventTarget(), {
    currentTime: 30,
    playbackRate: 1,
    paused: false,
    seeking: false,
    readyState: 4,
  })
  const calls: [boolean, number][] = [],
    rates: number[] = []
  const renderer = {
    setIsPaused: (paused: boolean, time: number) => calls.push([paused, time]),
    setRate: (rate: number) => rates.push(rate),
  }
  const lifetime = new AbortController()
  let delay = 2
  mountAssClock(video as any, renderer, lifetime.signal, () => delay)
  assert.deepEqual(calls.at(-1), [false, 28])
  video.currentTime = 1800
  video.seeking = true
  video.dispatchEvent(new Event("seeking"))
  assert.deepEqual(calls.at(-1), [true, 1798])
  video.dispatchEvent(new Event("timeupdate"))
  assert.deepEqual(calls.at(-1), [true, 1798])
  video.seeking = false
  video.dispatchEvent(new Event("seeked"))
  assert.deepEqual(calls.at(-1), [false, 1798])
  video.dispatchEvent(new Event("waiting"))
  video.currentTime = 1801
  video.dispatchEvent(new Event("timeupdate"))
  assert.deepEqual(calls.at(-1), [true, 1799])
  video.dispatchEvent(new Event("playing"))
  assert.deepEqual(calls.at(-1), [false, 1799])
  video.paused = true
  video.currentTime = 90
  video.dispatchEvent(new Event("seeked"))
  assert.deepEqual(calls.at(-1), [true, 88])
  video.playbackRate = 2
  video.dispatchEvent(new Event("ratechange"))
  assert.equal(rates.at(-1), 2)
  delay = -3
  video.dispatchEvent(new Event("timeupdate"))
  assert.deepEqual(calls.at(-1), [true, 93])
  lifetime.abort()
  const count = calls.length
  video.dispatchEvent(new Event("playing"))
  assert.equal(calls.length, count)
})

test("ASS follows presented frames, ignores frames during seeking, and cancels on disposal", () => {
  let callback: VideoFrameRequestCallback | undefined,
    cancelled: number | undefined,
    id = 0
  const video = Object.assign(new EventTarget(), {
    currentTime: 600,
    playbackRate: 1,
    paused: false,
    seeking: false,
    readyState: 4,
    requestVideoFrameCallback: (fn: VideoFrameRequestCallback) => {
      callback = fn
      return ++id
    },
    cancelVideoFrameCallback: (value: number) => {
      cancelled = value
    },
  })
  const calls: [boolean, number][] = []
  const lifetime = new AbortController()
  mountAssClock(
    video as any,
    { setIsPaused: (paused, time) => calls.push([paused, time]), setRate: () => {} },
    lifetime.signal,
    () => 2,
  )
  callback!(0, { mediaTime: 599.75 } as VideoFrameCallbackMetadata)
  assert.deepEqual(calls.at(-1), [false, 597.75])
  video.seeking = true
  video.dispatchEvent(new Event("seeking"))
  callback!(0, { mediaTime: 29 } as VideoFrameCallbackMetadata)
  assert.deepEqual(calls.at(-1), [true, 598])
  video.currentTime = 30
  video.seeking = false
  video.dispatchEvent(new Event("seeked"))
  callback!(0, { mediaTime: 30.1 } as VideoFrameCallbackMetadata)
  assert.deepEqual(calls.at(-1), [false, 28.1])
  lifetime.abort()
  assert.equal(cancelled, id)
  const count = calls.length
  callback!(0, { mediaTime: 100 } as VideoFrameCallbackMetadata)
  assert.equal(calls.length, count)
})
