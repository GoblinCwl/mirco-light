import test from "node:test"
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { setImmediate } from "node:timers/promises"
import { notifyBuildPublished } from "./buildPublished.mjs"

test("successful builds notify privately, failures retry and successful senders become idle", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "quartz-events-"))
  const before = process.env.QUARTZ_EVENTS_SOCKET
  const socket = join(dir, "events.sock")
  let calls = 0
  const server = createServer((req, res) => {
    assert.equal(req.method, "POST")
    assert.equal(req.url, "/published")
    calls++
    res.writeHead(202)
    res.end()
  })
  const state = globalThis[Symbol.for("quartz.build-published")]
  t.mock.timers.enable({ apis: ["setTimeout"] })
  try {
    process.env.QUARTZ_EVENTS_SOCKET = socket
    await notifyBuildPublished() // Receiver is down; build success is unaffected.
    assert.equal(state.pending, true)
    await new Promise((resolve) => server.listen(socket, resolve))
    t.mock.timers.tick(15000)
    for (let i = 0; i < 200 && state.running; i++) await setImmediate()
    assert.equal(calls, 1)
    assert.equal(state.pending, false)
    t.mock.timers.tick(60000)
    await setImmediate()
    assert.equal(calls, 1, "successful notification must not keep polling")
    await notifyBuildPublished()
    assert.equal(calls, 2)
  } finally {
    clearTimeout(state.timer)
    t.mock.timers.reset()
    await new Promise((resolve) => server.close(resolve))
    if (before === undefined) delete process.env.QUARTZ_EVENTS_SOCKET
    else process.env.QUARTZ_EVENTS_SOCKET = before
    await rm(dir, { recursive: true, force: true })
  }
})
