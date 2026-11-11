import { test } from "node:test"
import assert from "node:assert/strict"
import { readVideoProgress, saveVideoProgress } from "./driveVideoProgress"
test("video progress restores per file, clears completed videos and limits stored history", () => {
  const data = new Map<string, string>()
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } })
  try {
    saveVideoProgress("episode:a", 120, 1400)
    assert.equal(readVideoProgress("episode:a"), 120)
    assert.equal(readVideoProgress("episode:b"), 0)
    saveVideoProgress("episode:a", 1390, 1400)
    assert.equal(readVideoProgress("episode:a"), 0)
    saveVideoProgress("episode:a", 100, 1400)
    saveVideoProgress("episode:a", 1400, 1400, true)
    assert.equal(readVideoProgress("episode:a"), 0)
    saveVideoProgress("bad", NaN, 1200)
    assert.equal(readVideoProgress("bad"), 0)
    for (let n = 0; n < 505; n++) saveVideoProgress(`file:${n}`, 30, 500)
    assert.equal(Object.keys(JSON.parse(data.get("quartz-video-progress:v1")!)).length, 500)
  } finally { delete (globalThis as any).localStorage }
})
