import { test } from "node:test"
import assert from "node:assert/strict"
import { shareContent, tagPrefixes, tagHref } from "./shareContent"
import type { DriveEntry } from "./driveEntries"

test("public discovery indexes only share roots, retaining index IDs and public protection metadata", () => {
  const entries: DriveEntry[] = [{ kind: "guest", title: "Guest" }, { kind: "share", id: "index", title: "resource.zip", protected: true, tags: ["Study Notes", "分类/日语", "Study Notes"] }]
  const before = JSON.stringify(entries), pages = shareContent(entries)
  assert.equal(pages.length, 1)
  assert.equal(pages[0].slug, "Share/分享/index")
  assert.equal(pages[0].page.title, "index")
  assert.equal(pages[0].page.encrypted, true)
  assert.equal(pages[0].page.content, "")
  assert.deepEqual(pages[0].page.tags, ["Study-Notes", "分类/日语"])
  assert.equal(JSON.stringify(entries), before)
})
test("parent tags aggregate without duplicating shares; tag links use canonical encoded paths", () => {
  assert.deepEqual(tagPrefixes(["分类/日语", "分类/语法", "分类/日语"]), ["分类", "分类/日语", "分类/语法"])
  assert.equal(tagHref("分类/日语"), "/tags/%E5%88%86%E7%B1%BB/%E6%97%A5%E8%AF%AD/")
  assert.deepEqual(shareContent([]), [])
})
