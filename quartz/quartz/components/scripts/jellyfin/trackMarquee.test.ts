import { test } from "node:test"
import assert from "node:assert/strict"
import { trackScrollOffset } from "./trackMarquee"

test("long track names pause at both ends, travel fully, and return without jumping", () => {
  assert.equal(trackScrollOffset(799, 56), 0)
  assert.equal(trackScrollOffset(1800, 56), 28)
  assert.equal(trackScrollOffset(2800, 56), 56)
  assert.equal(trackScrollOffset(3799, 56), 56)
  assert.equal(trackScrollOffset(4800, 56), 28)
  assert.equal(trackScrollOffset(5800, 56), 0)
})
