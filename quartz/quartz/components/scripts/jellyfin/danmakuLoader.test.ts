import { test } from "node:test"
import assert from "node:assert/strict"
import { loadDanmakuRows } from "./danmakuLoader"

test("large comment sources reset once, append in order and retain their source", async () => {
  const rows = Array.from({ length: 2000 }, (_, index) => index)
  const appended: unknown[] = []
  const batches: number[] = []
  let resets = 0
  let source: unknown[] = []
  await loadDanmakuRows(
    {
      config: (option) => {
        source = option.danmuku
      },
      load: async (batch) => {
        if (!batch) resets++
        else {
          batches.push(batch.length)
          appended.push(...batch)
        }
      },
    },
    rows,
    () => true,
  )
  assert.equal(resets, 1)
  assert.deepEqual(appended, rows)
  assert(batches.every((size) => size <= 256))
  assert.equal(source, rows)
})

test("a replaced source stops appending and cannot overwrite the new selection", async () => {
  let active = true
  const appended: unknown[] = []
  let source: unknown[] = []
  await loadDanmakuRows(
    {
      config: (option) => {
        source = option.danmuku
      },
      load: async (batch) => {
        if (batch) {
          appended.push(...batch)
          active = false
        }
      },
    },
    Array.from({ length: 1000 }, (_, index) => index),
    () => active,
  )
  assert.equal(appended.length, 256)
  assert.deepEqual(source, [])
})
