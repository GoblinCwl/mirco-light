import { test } from "node:test"
import assert from "node:assert/strict"
import { latestPageDate } from "./pageModified"

test("page dates select actual newest content across time zones and ignore missing values", () => {
  assert.equal(latestPageDate([null,undefined,"invalid"]),null)
  assert.equal(latestPageDate(["2026-11-08T12:00:00+08:00",null,"2026-11-08T05:00:00Z"]),"2026-11-08T05:00:00.000Z")
  assert.equal(latestPageDate([]),null)
})
