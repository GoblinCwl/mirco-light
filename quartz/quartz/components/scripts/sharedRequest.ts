// Inline scripts are separate bundles. Keep shared request state on the page,
// rather than creating an independent cache in each copy of an imported module.
const stateKey = Symbol.for("quartz.shared-request-state.v1")
export function sharedState<T>(name: string, create: () => T): T {
  const scope = globalThis as typeof globalThis & { [stateKey]?: Map<string, unknown> }
  const states = (scope[stateKey] ??= new Map())
  if (!states.has(name)) states.set(name, create())
  return states.get(name) as T
}

type Pending<T> = {
  controller: AbortController
  promise: Promise<T>
  consumers: Set<symbol>
  settled: boolean
}

/** Coalesce reads without letting one departing component cancel other readers. */
export class RequestCache<T> {
  private values = new Map<string, { value: T; until: number }>()
  private pending = new Map<string, Pending<T>>()

  constructor(
    private ttl: number,
    private limit = 128,
  ) {}

  /** Read the last successful value without starting work. Stale values may
   * keep existing UI stable while a fresh read is pending. */
  peek(key: string, allowStale = false): T | undefined {
    const cached = this.values.get(key)
    return cached && (allowStale || Date.now() < cached.until) ? cached.value : undefined
  }

  clear() {
    for (const key of this.pending.keys()) this.invalidate(key)
    this.values.clear()
  }

  private invalidate(key: string) {
    const work = this.pending.get(key)
    this.pending.delete(key)
    work?.controller.abort(new DOMException("Request invalidated", "AbortError"))
    this.values.delete(key)
  }

  set(key: string, value: T) {
    this.invalidate(key)
    this.store(key, value)
  }

  private store(key: string, value: T) {
    this.values.delete(key)
    this.values.set(key, { value, until: Date.now() + this.ttl })
    while (this.values.size > this.limit) this.values.delete(this.values.keys().next().value!)
  }

  read(
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    options: { signal?: AbortSignal; refresh?: boolean } = {},
  ): Promise<T> {
    if (options.signal?.aborted) return Promise.reject(options.signal.reason)
    const cached = this.values.get(key)
    if (!options.refresh && cached && Date.now() < cached.until)
      return Promise.resolve(cached.value)
    let work = this.pending.get(key)
    if (!work) {
      const controller = new AbortController()
      work = { controller, consumers: new Set(), settled: false, promise: undefined! }
      const own = work
      this.pending.set(key, own)
      own.promise = Promise.resolve()
        .then(() => {
          controller.signal.throwIfAborted()
          return load(controller.signal)
        })
        .then((value) => {
          controller.signal.throwIfAborted()
          if (this.pending.get(key) === own) this.store(key, value)
          return value
        })
        .finally(() => {
          own.settled = true
          if (this.pending.get(key) === own) this.pending.delete(key)
        })
    }
    const own = work,
      consumer = Symbol()
    own.consumers.add(consumer)
    return new Promise<T>((resolve, reject) => {
      const detach = () => {
        options.signal?.removeEventListener("abort", cancelled)
        own.controller.signal.removeEventListener("abort", invalidated)
        own.consumers.delete(consumer)
        if (!own.settled && !own.consumers.size) {
          if (this.pending.get(key) === own) this.pending.delete(key)
          own.controller.abort(new DOMException("No active readers", "AbortError"))
        }
      }
      const cancelled = () => {
        detach()
        reject(options.signal!.reason)
      }
      const invalidated = () => {
        detach()
        reject(own.controller.signal.reason)
      }
      options.signal?.addEventListener("abort", cancelled, { once: true })
      own.controller.signal.addEventListener("abort", invalidated, { once: true })
      own.promise.then(
        (value) => {
          detach()
          resolve(value)
        },
        (error) => {
          detach()
          reject(error)
        },
      )
    })
  }
}
