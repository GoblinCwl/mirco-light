import { test } from "node:test"
import assert from "node:assert/strict"

test("avatars stay hidden until selected and decoded; missing avatars use local artwork without retry loops", async () => {
  const listeners = new Map<string, () => void>()
  Object.assign(globalThis, {
    document: {
      documentElement: { getAttribute: () => "light" },
      addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    },
    location: { origin: "https://example.com" },
  })
  let requests = 0
  Object.assign(globalThis, { fetch: async (url: string) => ({ ok: true, json: async () => ({ hash: url.includes("e".repeat(64)) ? "c".repeat(32) : "d".repeat(32) }) }) })
  class Probe {
    naturalWidth = 80
    referrerPolicy = ""
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(value: string) {
      requests++
      queueMicrotask(() => (value.includes("a".repeat(32)) || value.includes("cn.cravatar.com/avatar/" + "c".repeat(32))) ? this.onload?.() : this.onerror?.())
    }
  }
  Object.assign(globalThis, { Image: Probe })
  const { bindIdenticon, commentAvatar } = await import("./identicon")
  const image = () => {
    const attributes = new Map<string, string>()
    return {
      dataset: {} as Record<string, string>,
      style: { visibility: "" },
      decode: async () => {},
      classList: { remove() {}, toggle() {} },
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
      get src() { return attributes.get("src") ?? "" },
      set src(value: string) { attributes.set("src", value) },
    } as unknown as HTMLImageElement
  }
  const registered = image(), missing = image(), cravatar = image(), cravatarSha = image()
  bindIdenticon(registered, "visitor", "a".repeat(32))
  bindIdenticon(missing, "visitor", "b".repeat(64))
  bindIdenticon(cravatar, "visitor", "c".repeat(32))
  bindIdenticon(cravatarSha, "visitor", "e".repeat(64))
  assert.equal(registered.src, "")
  assert.equal(missing.src, "")
  assert.equal(registered.style.visibility, "hidden")
  assert.equal(missing.style.visibility, "hidden")
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.match(registered.src, /^https:\/\/www.gravatar.com\/avatar\//)
  assert.equal(registered.dataset.identiconSeed, undefined)
  assert.match(missing.src, /^data:image\/svg\+xml,/)
  assert.equal(registered.style.visibility, "")
  assert.equal(missing.style.visibility, "")
  bindIdenticon(registered, "visitor")
  bindIdenticon(missing, "visitor")
  bindIdenticon(cravatar, "visitor")
  bindIdenticon(cravatarSha, "visitor")
  assert.equal(cravatarSha.src, cravatar.src)
  assert.match(cravatar.src, /^https:\/\/cn\.cravatar\.com\/avatar\//)
  assert.equal(cravatar.style.visibility, "")
  assert.equal(requests, 6)
  // Artalk may regenerate src when its theme changes; preserve the decision.
  missing.src = commentAvatar("b".repeat(64))
  bindIdenticon(missing, "visitor")
  assert.match(missing.src, /^data:image\/svg\+xml,/)
  Object.assign(document, { querySelectorAll: () => [registered, missing, cravatar] })
  const cravatarSource = cravatar.src
  const registeredSource = registered.src
  listeners.get("themechange")!()
  assert.equal(registered.src, registeredSource)
  assert.equal(cravatar.src, cravatarSource)
  cravatar.src = commentAvatar("c".repeat(32))
  bindIdenticon(cravatar, "visitor")
  assert.equal(cravatar.src, cravatarSource)
  assert.equal(requests, 6)
  assert.equal(registered.dataset.identiconSeed, undefined)
  assert.match(missing.src, /^data:image\/svg\+xml,/)
  assert.match(commentAvatar("nickname"), /^data:image\/svg\+xml,/)
  assert.equal(commentAvatar("0bd58561894bba0aaebc6f8adfc59e59", true), "/static/avatars/goblincwl-profile-transparent-v1.webp")
})
