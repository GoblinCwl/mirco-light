import { after, beforeEach, test } from "node:test"
import assert from "node:assert/strict"
import { DRIVE_AUTH_KEY, DRIVE_CREDENTIAL_TTL, DRIVE_SHARE_PREFIX, readDriveToken, writeDriveToken, readDriveShareCode, writeDriveShareCode, clearDriveShareCode, clearDriveShareCodes } from "./driveCredentials"
const local = new Map<string, string>(), session = new Map<string, string>(), originalNow = Date.now
const oldLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), oldSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage")
const storage = (data: Map<string, string>) => ({ getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key), key: (i: number) => [...data.keys()][i] ?? null, get length() { return data.size } })
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage(local) })
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage(session) })
let now = 1000
beforeEach(() => { local.clear(); session.clear(); now = 1000; Date.now = () => now })
after(() => {
  Date.now = originalNow
  for (const [key, descriptor] of [["localStorage", oldLocal], ["sessionStorage", oldSession]] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key)
  }
})
test("auth is persisted locally, reads do not extend the 12-hour expiry", () => {
  writeDriveToken("account-A")
  const saved = local.get(DRIVE_AUTH_KEY)
  assert.equal(JSON.parse(saved!).expires, now + DRIVE_CREDENTIAL_TTL)
  session.clear(); now += DRIVE_CREDENTIAL_TTL - 1
  assert.equal(readDriveToken(), "account-A"); assert.equal(local.get(DRIVE_AUTH_KEY), saved)
  now++; assert.equal(readDriveToken(), ""); assert.equal(local.has(DRIVE_AUTH_KEY), false)
})
test("old session tokens are ignored and cannot restore a logged-out account", () => {
  session.set(DRIVE_AUTH_KEY, "old-token")
  assert.equal(readDriveToken(), "")
  writeDriveToken("current-token"); writeDriveToken("")
  assert.equal(readDriveToken(), "")
})
test("share codes are isolated by ID, expire on access and can be explicitly invalidated", () => {
  writeDriveShareCode("first", "code-A"); writeDriveShareCode("second", "code-B")
  now += DRIVE_CREDENTIAL_TTL - 1
  assert.equal(readDriveShareCode("first"), "code-A"); assert.equal(readDriveShareCode("unknown"), "")
  clearDriveShareCode("second"); assert.equal(readDriveShareCode("second"), "")
  now++; assert.equal(readDriveShareCode("first"), ""); assert.equal(local.has(DRIVE_SHARE_PREFIX + "first"), false)
})
test("clearing share credentials preserves unrelated local storage", () => {
  local.set("theme", "dark"); writeDriveShareCode("first", "code-A"); writeDriveShareCode("second", "code-B")
  clearDriveShareCodes(); assert.equal(readDriveShareCode("first"), ""); assert.equal(readDriveShareCode("second"), ""); assert.equal(local.get("theme"), "dark")
})
test("malformed or expired auth entries cannot be used", () => {
  for (const raw of ["plain-token", '{"value":"token","expires":0}', '{"value":12,"expires":999999999}', '{"value":"token"}']) {
    local.set(DRIVE_AUTH_KEY, raw); assert.equal(readDriveToken(), ""); assert.equal(local.has(DRIVE_AUTH_KEY), false)
  }
})
