import test from "node:test"
import assert from "node:assert/strict"
import { RequestCache, sharedState } from "./sharedRequest"

const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test("shared state reuses the same cache across module consumers", () => {
  const name = `audit-${Math.random()}`
  assert.strictEqual(
    sharedState(name, () => new RequestCache(1000)),
    sharedState(name, () => new RequestCache(1000)),
  )
})

test("concurrent reads, cached reads, and concurrent refreshes use one request", async () => {
  const cache = new RequestCache<number>(1000)
  let calls = 0
  const load = async () => ++calls
  assert.deepEqual(await Promise.all([cache.read("a", load), cache.read("a", load)]), [1, 1])
  assert.equal(await cache.read("a", load), 1)
  assert.deepEqual(
    await Promise.all([
      cache.read("a", load, { refresh: true }),
      cache.read("a", load, { refresh: true }),
    ]),
    [2, 2],
  )
  assert.equal(calls, 2)
})

test("one reader leaving does not cancel the other reader", async () => {
  const cache = new RequestCache<number>(1000),
    result = deferred<number>(),
    first = new AbortController()
  let sharedSignal!: AbortSignal,
    calls = 0
  const load = (signal: AbortSignal) => {
    calls++
    sharedSignal = signal
    return result.promise
  }
  const a = cache.read("a", load, { signal: first.signal }),
    b = cache.read("a", load)
  const cancelled = assert.rejects(a, { name: "AbortError" })
  await Promise.resolve()
  first.abort()
  await cancelled
  assert.equal(sharedSignal.aborted, false)
  result.resolve(42)
  assert.equal(await b, 42)
  assert.equal(calls, 1)
})

test("all readers leaving cancels work and a new reader starts a fresh request", async () => {
  const cache = new RequestCache<number>(1000),
    controller = new AbortController(),
    old = deferred<number>()
  let sharedSignal!: AbortSignal
  const stale = cache.read(
    "a",
    (signal) => {
      sharedSignal = signal
      return old.promise
    },
    { signal: controller.signal },
  )
  const cancelled = assert.rejects(stale, { name: "AbortError" })
  await Promise.resolve()
  controller.abort()
  await cancelled
  assert.equal(sharedSignal.aborted, true)
  assert.equal(await cache.read("a", async () => 2), 2)
  old.resolve(1)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(await cache.read("a", async () => 3), 2)
})

test("invalidation rejects old readers and late responses cannot replace new data", async () => {
  const cache = new RequestCache<string>(1000),
    old = deferred<string>()
  const stale = cache.read("a", () => old.promise)
  const rejected = assert.rejects(stale, { name: "AbortError" })
  await Promise.resolve()
  cache.clear()
  await rejected
  assert.equal(await cache.read("a", async () => "new"), "new")
  old.resolve("old")
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(await cache.read("a", async () => "unexpected"), "new")
})

test("failed requests are retryable; keys and capacity isolate cached results", async () => {
  const cache = new RequestCache<string>(1000, 2)
  await assert.rejects(
    cache.read("a", async () => {
      throw Error("temporary")
    }),
  )
  assert.equal(await cache.read("a", async () => "a"), "a")
  assert.equal(await cache.read("b", async () => "b"), "b")
  assert.equal(await cache.read("c", async () => "c"), "c")
  assert.equal(await cache.read("a", async () => "reloaded"), "reloaded")
})

test("zero TTL coalesces concurrent work but does not cache subsequent reads", async () => {
  const cache = new RequestCache<number>(0)
  let calls = 0
  const load = async () => ++calls
  assert.deepEqual(await Promise.all([cache.read("a", load), cache.read("a", load)]), [1, 1])
  assert.equal(await cache.read("a", load), 2)
})

test('peek preserves the last successful value for pending UI without bypassing expiry',async context=>{
 const cache=new RequestCache<number>(1000);let now=1000
 context.mock.method(Date,'now',()=>now)
 await cache.read('value',async()=>7);assert.equal(cache.peek('value'),7)
 now+=1001;assert.equal(cache.peek('value'),undefined);assert.equal(cache.peek('value',true),7)
 cache.clear();assert.equal(cache.peek('value',true),undefined)
})
