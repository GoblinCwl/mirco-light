import { test } from "node:test"
import assert from "node:assert/strict"

test("site logout clears linked administrator identity but preserves ordinary visitor details", async context => {
  const original = new Map(["document", "location", "localStorage"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const document = new EventTarget()
  const storage = new Map<string, string>()
  const localStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }
  for (const [key, value] of Object.entries({ document, location: { pathname: "/Memo/test" }, localStorage })) Object.defineProperty(globalThis, key, { configurable: true, value })
  context.after(() => { for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) } })
  context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ authenticated: false })))
  const { syncArtalkAdminSession } = await import("./artalkAdminSession")
  const fields = Object.fromEntries(["name", "email", "link"].map(name => [name, { value: "administrator", readOnly: true, removeAttribute() {} }]))
  let logouts = 0
  const updates: object[] = []
  const user = { logout() { logouts++ }, update(data: object) { updates.push(data); localStorage.setItem("ArtalkUser", JSON.stringify(data)) } }
  const instance = { getEl: () => ({ querySelectorAll: () => [fields.name, fields.email], querySelector: (selector: string) => fields[selector.match(/name="(\w+)"/)![1]] }) as unknown as HTMLElement, ctx: { getUser: () => user } }
  localStorage.setItem("quartz-artalk-linked", "true")
  localStorage.setItem("ArtalkUser", JSON.stringify({ name: "administrator", email: "admin@example.com", token: "secret", is_admin: true }))
  await syncArtalkAdminSession(instance)
  assert.equal(logouts, 1)
  assert.deepEqual(updates, [{ name: "", email: "", link: "", token: "", is_admin: false }])
  assert.equal(localStorage.getItem("ArtalkUser"), null)
  assert.equal(localStorage.getItem("quartz-artalk-linked"), null)
  for (const field of Object.values(fields)) assert.equal(field.value, "")
  assert.equal(fields.name.readOnly, false)
  assert.equal(fields.email.readOnly, false)

  const visitor = JSON.stringify({ name: "visitor", email: "visitor@example.com" })
  localStorage.setItem("ArtalkUser", visitor)
  fields.name.value = "visitor"
  document.dispatchEvent(new Event("stellar-auth-changed"))
  assert.equal(localStorage.getItem("ArtalkUser"), visitor)
  assert.equal(fields.name.value, "visitor")
  assert.equal(logouts, 1)
})
