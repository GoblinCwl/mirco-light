import { test } from "node:test"
import assert from "node:assert/strict"
import { sandboxJSON } from "./sandboxJSON"

test("player SVG icons survive script-safe JSON serialization without exposing an HTML terminator", () => {
  const value = {
    icon: '<svg viewBox="0 0 24 24"><path d="M4 4h16"/></svg>',
    title: "</script><script>unsafe</script>",
  }
  const encoded = sandboxJSON(value)
  assert.equal(encoded.includes("<"), false)
  assert.deepEqual(JSON.parse(encoded), value)
})
