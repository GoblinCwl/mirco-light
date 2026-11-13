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
  class Probe {
    naturalWidth = 80
    referrerPolicy = ""
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(value: string) {
      requests++
      queueMicrotask(() => value.includes("a".repeat(32)) ? this.onload?.() : this.onerror?.())
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
  const registered = image(), missing = image()
  bindIdenticon(registered, "visitor", "a".repeat(32))
  bindIdenticon(missing, "visitor", "b".repeat(64))
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
  assert.equal(requests, 2)
  // Artalk may regenerate src when its theme changes; preserve the decision.
  missing.src = commentAvatar("b".repeat(64))
  bindIdenticon(missing, "visitor")
  assert.match(missing.src, /^data:image\/svg\+xml,/)
  Object.assign(document, { querySelectorAll: () => [registered, missing] })
  const registeredSource = registered.src
  listeners.get("themechange")!()
  assert.equal(registered.src, registeredSource)
  assert.equal(registered.dataset.identiconSeed, undefined)
  assert.match(missing.src, /^data:image\/svg\+xml,/)
  assert.match(commentAvatar("nickname"), /^data:image\/svg\+xml,/)
  assert.equal(commentAvatar("0bd58561894bba0aaebc6f8adfc59e59", true), "/static/avatars/goblincwl-profile-transparent-v1.webp")
})
