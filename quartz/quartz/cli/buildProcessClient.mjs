import { fork } from "node:child_process"

export class BuildProcess {
  constructor(moduleURL, argv, mutex, { refresh = () => {}, error = console.error } = {}) {
    this.child = fork(new URL("./buildProcess.mjs", import.meta.url), [], {
      stdio: ["inherit", "inherit", "inherit", "ipc"],
      serialization: "advanced",
      execArgv: process.execArgv.filter(arg => !arg.startsWith("--input-type")),
    })
    this.locks = new Map()
    this.exited = false
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    this.done = new Promise(resolve => { this.exitResolve = resolve })
    let reported = false
    const fail = cause => {
      this.readyReject(cause)
      if (this.started && !this.closing && !reported) { reported = true; error(cause) }
    }
    this.child.on("message", message => {
      if (message.type === "lock") {
        void mutex.acquire().then(release => {
          if (this.exited || !this.child.connected) { release(); return }
          this.locks.set(message.id, release)
          this.child.send({ type: "locked", id: message.id })
        }).catch(fail)
      } else if (message.type === "unlock") {
        this.locks.get(message.id)?.()
        this.locks.delete(message.id)
      } else if (message.type === "ready") {
        this.started = true
        this.readyResolve()
      } else if (message.type === "refresh") refresh()
      else if (message.type === "failure") fail(new Error(message.error))
    })
    this.child.on("error", fail)
    this.child.once("close", (code, signal) => {
      this.exited = true
      this.releaseLocks()
      if (!this.started) this.readyReject(new Error(`Quartz builder exited before ready (${signal || code})`))
      this.exitResolve()
      if (this.started && !this.closing) fail(new Error(`Quartz builder exited unexpectedly (${signal || code})`))
    })
    this.child.send({ type: "start", moduleURL, argv })
  }

  releaseLocks() {
    for (const release of this.locks.values()) release()
    this.locks.clear()
  }

  close() {
    return (this.closing ??= (async () => {
      if (this.exited) return
      let timer
      try {
        if (this.child.connected) this.child.send({ type: "stop" })
        await Promise.race([
          this.done,
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Quartz builder shutdown timed out")), 120000) }),
        ])
      } finally {
        clearTimeout(timer)
        if (!this.exited) {
          this.child.kill("SIGKILL")
          await this.done
        }
        this.releaseLocks()
      }
    })())
  }
}
