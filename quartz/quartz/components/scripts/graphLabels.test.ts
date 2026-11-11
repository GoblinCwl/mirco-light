import { test } from "node:test"
import assert from "node:assert/strict"
import { compactGraphTitle } from "./graphLabels"

test("short labels remain intact; long mixed-language titles have bounded display width", () => {
  assert.equal(compactGraphTitle("#Yu-Gi-Oh!"), "#Yu-Gi-Oh!")
  const title = "[Master Duel] 我的对手竟然是超级超级长的标题"
  const result = compactGraphTitle(title)
  assert.ok(result.endsWith("…"))
  assert.ok(result.length < title.length)
  assert.ok(Array.from(result).reduce((width, character) => width + (/^[\x00-\x7f]$/.test(character) ? 1 : 2), 0) <= 26)
  assert.equal(title, "[Master Duel] 我的对手竟然是超级超级长的标题")
})

test("labels normalize line breaks and do not split Unicode code points", () => {
  assert.equal(compactGraphTitle("  标题\n  内容  "), "标题 内容")
  const result = compactGraphTitle("🌟".repeat(30))
  assert.equal(result, "🌟".repeat(12) + "…")
})
