import { stop as stopEsbuild } from "esbuild"

// One process owns one build bundle, its content watcher and native libraries.
// The supervisor never imports this bundle; exiting releases all of its memory.
let cleanup
let lockId = 0
let started = false
let stopping = false
const waiting = new Map()
const send = message => process.send?.(message)
const mutex = {
  acquire() {
    const id = ++lockId
    return new Promise(resolve => {
      waiting.set(id, resolve)
      send({ type: "lock", id })
    })
  },
}
const fail = error => {
  stopEsbuild()
  process.send?.({ type: "failure", error: error.stack || String(error) }, () => process.exit(1))
}
process.on("message", async message => {
  if (message.type === "start" && !started) {
    started = true
    try {
      const { default: build } = await import(message.moduleURL)
      cleanup = await build(message.argv, mutex, () => send({ type: "refresh" }))
      send({ type: "ready" })
    } catch (error) { fail(error) }
  } else if (message.type === "locked") {
    const resolve = waiting.get(message.id)
    waiting.delete(message.id)
    resolve?.(() => send({ type: "unlock", id: message.id }))
  } else if (message.type === "stop" && !stopping) {
    stopping = true
    try {
      await cleanup?.()
      // Drain in-flight/queued article writes before releasing the entire process.
      const release = await mutex.acquire()
      release()
      await stopEsbuild()
      process.send?.({ type: "stopped" }, () => process.exit(0))
    } catch (error) { fail(error) }
  }
})
// Losing the supervisor must not leave a builder writing independently.
process.on("disconnect", () => process.exit(0))
