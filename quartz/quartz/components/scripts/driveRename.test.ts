import test from "node:test"
import assert from "node:assert/strict"
import { buildRenamePlan } from "./driveRename"

test("regex uses global replacement and capture groups, filtering unmatched items", () => {
  assert.deepEqual(buildRenamePlan([{ name: "a-a.txt" }, { name: "skip.txt" }], { mode: "regex", source: "a", replacement: "b" }), [{ src_name: "a-a.txt", new_name: "b-b.txt" }])
  assert.deepEqual(buildRenamePlan([{ name: "photo_12.jpg" }], { mode: "regex", source: "^photo_(\\d+)(\\.jpg)$", replacement: "image-$1$2" }), [{ src_name: "photo_12.jpg", new_name: "image-12.jpg" }])
})
test("regex expands all OpenList created and modified date placeholders", () => {
  const placeholders = ["year", "month", "date", "hour", "minute", "second"].map(part => `{created_${part}}`).join("-") + "_{modified_year}-{modified_month}-{modified_date}"
  const plan = buildRenamePlan([{ name: "old.txt", created: "2026-11-03T09:08:07", modified: "2026-10-02T06:05:04" }], { mode: "regex", source: "^old", replacement: placeholders })
  assert.equal(plan[0].new_name, "2026-11-03-09-08-07_2026-10-02.txt")
  assert.throws(() => buildRenamePlan([{ name: "old.txt" }], { mode: "regex", source: "old", replacement: "{created_year}" }), /创建/)
})
test("sequential rules preserve extension, selection order and leading zeros", () => {
  const files = [{ name: "z.txt" }, { name: "a.md" }]
  assert.deepEqual(buildRenamePlan(files, { mode: "sequence", source: "文件-{number}-副本", replacement: "009", padding: "4" }).map(item => item.new_name), ["文件-0009-副本.txt", "文件-0010-副本.md"])
  assert.deepEqual(buildRenamePlan(files, { mode: "sequence", source: "item", replacement: "007" }).map(item => item.new_name), ["item007.txt", "item008.md"])
})
test("find-and-replace replaces only the first literal occurrence", () => {
  assert.deepEqual(buildRenamePlan([{ name: "a.a.txt" }, { name: "skip.txt" }], { mode: "replace", source: "a.", replacement: "b." }), [{ src_name: "a.a.txt", new_name: "b.a.txt" }])
})
test("invalid patterns, sequence values and missing inputs are rejected", () => {
  const files = [{ name: "a.txt" }]
  assert.throws(() => buildRenamePlan(files, { mode: "regex", source: "[", replacement: "b" }), /正则/)
  assert.throws(() => buildRenamePlan(files, { mode: "sequence", source: "item", replacement: "NaN" }), /序号/)
  assert.throws(() => buildRenamePlan(files, { mode: "sequence", source: "item", replacement: "1", padding: "-1" }), /位数/)
  assert.throws(() => buildRenamePlan(files, { mode: "replace", source: "", replacement: "b" }), /匹配/)
})
