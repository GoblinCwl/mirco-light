import { after, beforeEach, test } from "node:test"
import assert from "node:assert/strict"
import { clearDriveDirectoryCache, DIRECTORY_CACHE_TTL, readDriveDirectory } from "./driveDirectoryCache"
import { drivePasswordKey, drivePasswords } from "./driveClient"

const originalFetch = globalThis.fetch, originalNow = Date.now
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
const storage = new Map<string, string>()
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } })
let now = 1000, calls = 0
beforeEach(() => {
  clearDriveDirectoryCache(); storage.clear(); storage.set("openlist-token", JSON.stringify({ value: "account-A", expires: 99_000_000 })); drivePasswords.clear()
  now = 1000; calls = 0; Date.now = () => now
  globalThis.fetch = async input => { if(String(input)==="/api/site/settings")return Response.json({values:{}});calls++; return Response.json({ code: 200, data: { content: [], total: 0 } }) }
})
after(() => {
  clearDriveDirectoryCache(); globalThis.fetch = originalFetch; Date.now = originalNow
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage)
  else Reflect.deleteProperty(globalThis, "localStorage")
})

test("concurrent trees share one request; fresh pages reuse data and expired pages revalidate", async () => {
  const signal = new AbortController().signal
  await Promise.all([readDriveDirectory("/folder", 1, signal), readDriveDirectory("/folder", 1, signal)])
  assert.equal(calls, 1)
  now += DIRECTORY_CACHE_TTL - 1; await readDriveDirectory("/folder", 1, signal)
  assert.equal(calls, 1)
  now += 2; await readDriveDirectory("/folder", 1, signal)
  assert.equal(calls, 2)
})
test("account, path, page and password isolate directory metadata", async () => {
  const signal = new AbortController().signal
  await readDriveDirectory("/folder", 1, signal)
  storage.set("openlist-token", JSON.stringify({ value: "account-B", expires: 99_000_000 })); await readDriveDirectory("/folder", 1, signal)
  await readDriveDirectory("/other", 1, signal)
  await readDriveDirectory("/folder", 2, signal)
  drivePasswords.set(drivePasswordKey("storage", "", "/folder"), "code"); await readDriveDirectory("/folder", 1, signal)
  assert.equal(calls, 5)
  await readDriveDirectory("/folder", 1, signal); assert.equal(calls, 5)
  clearDriveDirectoryCache(); await readDriveDirectory("/folder", 1, signal)
  assert.equal(calls, 6)
})
test("logout invalidation prevents an old request from repopulating the cache", async () => {
  let resolve!: (value: Response) => void
  globalThis.fetch = input => { if(String(input)==="/api/site/settings")return Promise.resolve(Response.json({values:{}}));calls++; return new Promise<Response>(done => { resolve = done }) }
  const signal = new AbortController().signal
  const request = readDriveDirectory("/folder", 1, signal)
  const rejected = assert.rejects(request, { name: "AbortError" })
  await new Promise<void>(done=>setImmediate(done))
  clearDriveDirectoryCache(); storage.set("openlist-token", JSON.stringify({ value: "account-B", expires: 99_000_000 }))
  resolve(Response.json({ code: 200, data: { content: [{ name: "private-A" }], total: 1 } }))
  await rejected
  globalThis.fetch = async input => { if(String(input)==="/api/site/settings")return Response.json({values:{}});calls++; return Response.json({ code: 200, data: { content: [], total: 0 } }) }
  const page = await readDriveDirectory("/folder", 1, signal)
  assert.deepEqual(page.content, []); assert.equal(calls, 2)
})
