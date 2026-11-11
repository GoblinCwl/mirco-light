import { driveToken } from "./driveClient"
import { driveApiUrl } from "./openlistShared"
import hashWorkerSource from "./vendor/uploadHashWorker"

export type UploadMode = "Multipart" | "Stream" | "Form"
export type UploadTask = { id: string; name?: string; state?: number; progress?: number }
type ResponseData = { task?: UploadTask }
type Envelope<T> = { code: number; message?: string; data: T }
export type UploadSnapshot = { upload_id: string; state: "receiving" | "completed" | "failed_retriable" | "failed_permanent" | "aborted"; chunk_size: number; total_chunks: number; received?: [number, number][]; received_bytes?: number; storage_progress?: number; error?: string }
export type UploadUpdate = (status: "hashing" | "uploading" | "backending", progress: number, speed?: number) => void
class UploadError extends Error {
  constructor(message: string, public code: number, public transport = false) { super(message) }
}
export function uploadRequest<T>(route: string, method: string, body: Blob | FormData | null, headers: Record<string, string>, signal: AbortSignal, progress?: (loaded: number, total: number) => void, timeout = 0): Promise<T> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const xhr = new XMLHttpRequest(), abort = () => xhr.abort()
    xhr.open(method, driveApiUrl(route)); xhr.withCredentials = false; xhr.timeout = timeout
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value)
    xhr.upload.onprogress = event => progress?.(event.loaded, event.total)
    const finish = () => signal.removeEventListener("abort", abort)
    xhr.onload = () => {
      finish()
      let response: Envelope<T>
      try { response = JSON.parse(xhr.responseText) } catch { reject(new UploadError(`上传请求失败（${xhr.status || "响应无效"}）`, xhr.status, true)); return }
      if (xhr.status < 200 || xhr.status >= 300) reject(new UploadError(response.message || `上传失败（${xhr.status}）`, xhr.status, true))
      else if (response.code !== 200) reject(new UploadError(response.message || "上传失败", response.code))
      else resolve(response.data)
    }
    xhr.onerror = () => { finish(); reject(new UploadError("网络连接失败，请重试", 0, true)) }
    xhr.ontimeout = () => { finish(); reject(new UploadError("上传请求超时，请重试", 0, true)) }
    xhr.onabort = () => { finish(); reject(new DOMException("上传已停止", "AbortError")) }
    signal.addEventListener("abort", abort, { once: true }); xhr.send(body)
  })
}
const pause = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal.throwIfAborted()
  const abort = () => { clearTimeout(timer); reject(signal.reason) }
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve() }, ms)
  signal.addEventListener("abort", abort, { once: true })
})
const hashes = new WeakMap<File, Record<string, string>>()
async function hashFile(file: File, signal: AbortSignal, update: UploadUpdate) {
  const cached = hashes.get(file); if (cached) return cached
  update("hashing", 0)
  return new Promise<Record<string, string>>((resolve, reject) => {
    signal.throwIfAborted()
    const url = URL.createObjectURL(new Blob([hashWorkerSource], { type: "text/javascript" })), worker = new Worker(url)
    const finish = () => { signal.removeEventListener("abort", abort); worker.terminate(); URL.revokeObjectURL(url) }
    const abort = () => { finish(); reject(new DOMException("上传已停止", "AbortError")) }
    signal.addEventListener("abort", abort, { once: true })
    worker.onmessage = event => {
      if (event.data.type === "progress") update("hashing", event.data.progress)
      else if (event.data.type === "result") { const value = event.data.hash; finish(); hashes.set(file, value); resolve(value) }
      else { finish(); reject(new Error(event.data.error || "文件哈希计算失败")) }
    }
    worker.onerror = () => { finish(); reject(new Error("无法计算文件哈希，请重试或关闭尝试秒传")) }
    worker.postMessage({ file })
  })
}
export async function uploadDriveFile(path: string, file: File, options: {
  mode: UploadMode; token: string; password: string; asTask: boolean; overwrite: boolean; rapid: boolean; chunkSize: number; signal: AbortSignal; update: UploadUpdate
}): Promise<ResponseData | undefined> {
  const { signal, update, token } = options
  const check = () => { signal.throwIfAborted(); if (!token || driveToken() !== token) throw new Error("登录状态已变化，请重新登录后上传") }
  const request = <T>(route: string, method: string, body: Blob | FormData | null, extra: Record<string, string>, progress?: (loaded: number, total: number) => void, timeout = 0, requestSignal = signal) => {
    check(); return uploadRequest<T>(route, method, body, { Authorization: token, ...extra }, requestSignal, progress, timeout)
  }
  check()
  const headers: Record<string, string> = { "File-Path": encodeURIComponent(path), "Last-Modified": String(file.lastModified), Password: options.password, Overwrite: String(options.overwrite) }
  if (options.rapid) {
    const hash = await hashFile(file, signal, update)
    headers["X-File-Md5"] = hash.md5; headers["X-File-Sha1"] = hash.sha1; headers["X-File-Sha256"] = hash.sha256
  }
  const stream = async (): Promise<ResponseData> => {
    update("uploading", 0)
    const form = options.mode === "Form" ? new FormData() : undefined
    if (form) form.append("file", file)
    let at = Date.now(), bytes = 0
    return await request<ResponseData>(form ? "fs/form" : "fs/put", "PUT", form || file,
      { ...headers, "As-Task": String(options.mode !== "Multipart" && options.asTask), ...(!form ? { "Content-Type": file.type || "application/octet-stream" } : {}) },
      (loaded, total) => {
        const now = Date.now(), elapsed = now - at, speed = elapsed >= 1000 ? (loaded - bytes) * 1000 / elapsed : undefined
        if (elapsed >= 1000) { at = now; bytes = loaded }
        const progress = total ? Math.min(100, loaded / total * 100) : 0
        update(progress === 100 ? "backending" : "uploading", progress, speed)
      })
  }
  const chunkSize = Math.max(1024 * 1024, options.chunkSize)
  if (options.mode !== "Multipart" || file.size <= chunkSize) return stream()
  let session: UploadSnapshot | null = null
  for (let attempt = 0; ; attempt++) {
    try {
      session = await request<UploadSnapshot | null>("fs/multipart/init", "POST", null, { ...headers, "X-File-Size": String(file.size), "X-Chunk-Size": String(chunkSize), "Content-Type": file.type || "application/octet-stream" }, undefined, 30000)
      break
    } catch (error) { if (!(error instanceof UploadError) || !error.transport || attempt >= 2) throw error; await pause(1000 * (attempt + 1), signal) }
  }
  if (!session) return stream()
  if (session.state === "completed") { update("uploading", 100); return }
  if (!session.upload_id || !Number.isSafeInteger(session.chunk_size) || session.chunk_size <= 0 || session.total_chunks !== Math.ceil(file.size / session.chunk_size)) throw new Error("分片上传会话无效")
  const id = session.upload_id, sessionHeaders = { "X-Upload-Id": id }
  const status = () => request<UploadSnapshot>(`fs/multipart/status?upload_id=${encodeURIComponent(id)}`, "GET", null, {}, undefined, 30000)
  const have = new Set<number>()
  for (const [lo, hi] of session.received || []) for (let i = Math.max(0, lo); i <= Math.min(hi, session.total_chunks - 1); i++) have.add(i)
  const missing = Array.from({ length: session.total_chunks }, (_, i) => i).filter(i => !have.has(i))
  const length = (i: number) => Math.min(session!.chunk_size, file.size - i * session!.chunk_size)
  let acked = session.received_bytes || 0, peak = acked, done = false, fatal: unknown, at = Date.now(), last = acked
  const inFlight = new Map<number, number>()
  const report = () => {
    peak = Math.max(peak, Math.min(file.size, acked + [...inFlight.values()].reduce((sum, n) => sum + n, 0)))
    const now = Date.now(), elapsed = now - at, speed = elapsed >= 1000 ? (peak - last) * 1000 / elapsed : undefined
    if (elapsed >= 1000) { at = now; last = peak }
    update("uploading", peak / file.size * 100, speed)
  }
  const send = async (i: number) => {
    for (let retry = 0; ; retry++) {
      check(); if (done || fatal) return
      try {
        const state = await request<UploadSnapshot>("fs/multipart/chunk", "PUT", file.slice(i * session!.chunk_size, i * session!.chunk_size + length(i)), { ...sessionHeaders, "X-Chunk-Index": String(i), "Content-Type": "application/octet-stream" }, loaded => { inFlight.set(i, loaded); report() })
        inFlight.delete(i); acked += length(i); if (state?.state === "completed") done = true; report(); return
      } catch (error) {
        inFlight.delete(i)
        if (!(error instanceof UploadError) || !error.transport && error.code !== 429 && error.code !== 409 || retry >= 400) throw error
        if (error.transport) {
          try {
            const state = await status()
            if (state.state === "completed") { done = true; return }
            if (state.state.startsWith("failed") || state.state === "aborted") throw new Error(state.error || "分片上传失败，请重试")
          } catch (probe) { if (probe instanceof UploadError && probe.code === 404) { done = true; return }; if (!(probe instanceof UploadError) || !probe.transport) throw probe }
        }
        await pause(error.transport ? Math.min(1200 * (retry + 1), 4800) : 800, signal)
      }
    }
  }
  try {
    if (session.state === "failed_retriable" && missing.length) await send(missing.shift()!)
    let next = 0
    await Promise.all(Array.from({ length: Math.min(3, missing.length) }, async () => {
      while (!done && !fatal) {
        const i = next++; if (i >= missing.length) return
        try { await send(missing[i]) } catch (error) { fatal = error }
      }
    }))
    if (fatal) throw fatal
    if (done) { update("uploading", 100); return }
    update("backending", 100, 0)
    const completeController = new AbortController(), completeSignal = AbortSignal.any([signal, completeController.signal])
    let settled = false, result: UploadSnapshot | undefined, error: unknown
    const completion = request<UploadSnapshot>("fs/multipart/complete", "POST", null, sessionHeaders, undefined, 0, completeSignal)
      .then(value => { result = value }, reason => { error = reason }).finally(() => { settled = true })
    try {
      for (;;) {
        check()
        if (settled) {
          if (result) { update("uploading", 100); return }
          if (error && (!(error instanceof UploadError) || !error.transport)) throw error
        }
        if (!settled) await Promise.race([completion, pause(2000, signal)])
        else await pause(2000, signal)
        if (!settled) {
          try { const state = await status(); if (state.state === "completed") { update("uploading", 100); return }; if (state.state.startsWith("failed") || state.state === "aborted") throw new Error(state.error || "存储写入失败"); update("backending", state.storage_progress || 0, 0) }
          catch (probe) { if (probe instanceof UploadError && probe.code === 404) return; if (!(probe instanceof UploadError) || !probe.transport) throw probe }
        } else if (!result) {
          try { const state = await status(); if (state.state === "completed") return; if (state.state !== "receiving") throw new Error(state.error || "上传失败"); update("backending", state.storage_progress || 0, 0) }
          catch (probe) { if (probe instanceof UploadError && probe.code === 404) return; if (!(probe instanceof UploadError) || !probe.transport) throw probe }
        }
      }
    } finally { completeController.abort(); await completion }
  } catch (error) {
    if (signal.aborted && driveToken() === token) {
      void uploadRequest("fs/multipart/abort", "POST", null, { Authorization: token, ...sessionHeaders }, AbortSignal.timeout(5000)).catch(() => {})
    }
    throw error
  }
}
