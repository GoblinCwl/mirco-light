import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { transformSync } from "esbuild"
import type { renderSandboxVideo, VideoRendererContext } from "./videoRenderer"

test("ordinary video renderer remains self-contained when serialized into an iframe", async (context) => {
  const module = { exports: {} as { renderSandboxVideo: typeof renderSandboxVideo } }
  const code = transformSync(readFileSync(new URL("./videoRenderer.ts", import.meta.url), "utf8"), {
    loader: "ts",
    format: "cjs",
    minify: true,
  }).code
  Function("module", "exports", code)(module, module.exports)
  const isolated = Function(
    `return (${module.exports.renderSandboxVideo.toString()})`,
  )() as typeof renderSandboxVideo
  const prior = new Map(
    ["document", "addEventListener"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  )
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { style: {} }, body: { style: {} } },
  })
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, value: () => {} })
  context.after(() => {
    for (const [key, value] of prior) {
      if (value) Object.defineProperty(globalThis, key, value)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  const assets: string[] = []
  const supplied = {
    config: { preferences: {}, url: "https://files.test/video.ts", mediaType: "ts" },
    key: "video",
    root: { style: {}, clientWidth: 0 },
    frameAsset: async (name: string) => {
      assets.push(name)
      throw Error("fixture stop")
    },
    localScript: async (name: string) => {
      assets.push(name)
      throw Error("fixture stop")
    },
  } as unknown as VideoRendererContext
  await assert.rejects(isolated(supplied), /fixture stop/)
  assert.deepEqual(assets, ["artplayer.js", "mpegts.js"])
})
