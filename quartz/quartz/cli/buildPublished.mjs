import { request } from "node:http"

// Snapshots are authoritative. Delivery is a wake-up signal only. Coalesce
// notifications within the current build process; the next builder publishes
// and notifies its latest complete snapshot again.
const key = Symbol.for("quartz.build-published")
const state = (globalThis[key] ??= { pending: false, running: false, timer: undefined })

export async function notifyBuildPublished() {
  const socketPath = process.env.QUARTZ_EVENTS_SOCKET
  if (!socketPath) return
  state.pending = true
  clearTimeout(state.timer)
  if (state.running) return
  state.running = true
  try {
    while (state.pending) {
      state.pending = false
      await new Promise((resolve, reject) => {
        const req = request(
          { socketPath, path: "/published", method: "POST", timeout: 2000 },
          (res) => {
            res.resume()
            res.on("end", () =>
              res.statusCode === 202 ? resolve() : reject(new Error("Build notification rejected")),
            )
            res.on("error", reject)
          },
        )
        req.on("error", reject)
        req.on("timeout", () => req.destroy(new Error("Build notification timed out")))
        req.end()
      })
    }
  } catch {
    state.pending = true
    console.warn("构建已发布，Go 通知暂未送达，将重试。")
    state.timer = setTimeout(() => void notifyBuildPublished(), 15000)
    state.timer.unref()
  } finally {
    state.running = false
  }
}
