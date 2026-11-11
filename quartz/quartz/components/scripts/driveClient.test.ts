import { test } from "node:test"
import assert from "node:assert/strict"
import { driveDirectoryTitle, driveHref, drivePassword, drivePasswordKey, drivePasswords, driveRoute } from "./driveClient"

test("path routes round-trip Unicode, spaces and reserved filename characters without query parameters", () => {
  for (const view of ["guest", "storage", "share"] as const) {
    const url = new URL(driveHref(view, "/资料/文件 #?%.txt", "日语学习资料"), "https://goblincwl.site")
    const route = driveRoute(url)
    assert.equal(route.valid, true)
    assert.equal(route.view, view)
    assert.equal(route.path, "/资料/文件 #?%.txt")
    assert.equal(url.search, "")
    if (view === "share") assert.equal(route.share, "日语学习资料")
  }
  assert.equal(driveRoute(new URL("https://goblincwl.site/Share/分享/")).valid,false)
  assert.throws(()=>driveHref("shares" as never))
})
test("directory and file links use the right trailing slash", () => {
  assert.equal(decodeURI(driveHref("storage", "/Private/备忘录", "", true)), "/Share/空间/Private/备忘录/")
  assert.equal(decodeURI(driveHref("storage", "/Private/笔记.md")), "/Share/空间/Private/笔记.md")
  assert.equal(driveHref("guest"), "/Share/")
})
test("removed route prefixes are rejected", () => {
  for (const path of ["/realm/Share/", "/realm/Share/分享/影视/Season%2001/episode.mkv", "/tools/openlist/?view=storage", "/tools/Share/", "/drive/"]) {
    assert.equal(driveRoute(new URL(path, "https://goblincwl.site")).valid, false, path)
  }
})
test("invalid paths and IDs are rejected rather than falling back to the portal", () => {
  for (const path of ["/Share/分享/invalid!", "/Share/分享/bad%2Fid/", "/Share/空间/a%5Cb/", "/Share/%E0%A4%A/", "/Share/a//b", "/tools/openlist/?share=../../private", "/tools/openlist/?view=unknown", "/other/"]) {
    assert.equal(driveRoute(new URL(path, "https://goblincwl.site")).valid, false, path)
  }
})
test("guest folders named like route groups still round-trip", () => {
  for (const name of ["分享", "空间", "存储", "访客"]) {
    const route = driveRoute(new URL(driveHref("guest", `/${name}/文件.md`), "https://goblincwl.site"))
    assert.equal(route.view, "guest")
    assert.equal(route.path, `/${name}/文件.md`)
  }
})
test("codes are inherited within the same share without crossing to another share", () => {
  drivePasswords.clear()
  drivePasswords.set(drivePasswordKey("share", "course", "/"), "fixture-code")
  assert.equal(drivePassword("share", "course", "/章/文件.txt"), "fixture-code")
  assert.equal(drivePassword("share", "other", "/章/文件.txt"), "")
  assert.equal(drivePassword("storage", "", "/章/文件.txt"), "")
  drivePasswords.clear()
})
test("directory passwords inherit by path boundary and remain isolated between visitor and storage", () => {
  drivePasswords.set(drivePasswordKey("guest", "", "/public"), "public-code")
  drivePasswords.set(drivePasswordKey("guest", "", "/public/special"), "special-code")
  assert.equal(drivePassword("guest", "", "/public/chapter/file.txt"), "public-code")
  assert.equal(drivePassword("guest", "", "/public/special/file.txt"), "special-code")
  assert.equal(drivePassword("guest", "", "/public-other/file.txt"), "")
  assert.equal(drivePassword("storage", "", "/public/chapter/file.txt"), "")
  drivePasswords.clear()
})

test("only Drive entry headings use the domain heading", () => {
  assert.equal(driveDirectoryTitle("guest", "/"), "星域: Share")
  assert.equal(driveDirectoryTitle("storage", "/"), "星域: Share/空间")
  assert.equal(driveDirectoryTitle("storage", "/Private/备忘录"), "备忘录")
  assert.equal(driveDirectoryTitle("share", "/章节", "日语学习资料"), "章节")
})

test("the old storage alias has no special meaning", () => {
  const route = driveRoute(new URL("https://goblincwl.site/Share/存储/Private/"))
  assert.equal(route.view, "guest")
  assert.equal(route.path, "/存储/Private")
})
