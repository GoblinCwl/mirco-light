import { test } from "node:test"
import assert from "node:assert/strict"
import { mergeDriveShareGraph, isDriveShareGraphNode, driveShareGraphSlug } from "./driveShareGraph"
import type { ContentDetails } from "../../util/contentTypes"
import type { SimpleSlug } from "../../util/path"

test("dynamic sharing graph uses canonical roots, resource labels and normalized tags without replacing articles", () => {
  const article = { title: "Article", links: [], tags: ["学习"], content: "" } as unknown as ContentDetails
  const data = new Map<SimpleSlug, ContentDetails>([["Memo/article" as SimpleSlug, article]])
  mergeDriveShareGraph(data, [
    { kind: "guest", title: "Guest" },
    { kind: "share", id: "日语-资料", name: "资料目录", title: "fallback", protected: true, tags: ["学习", "Study Notes", "分类/日语"], comment: false },
    { kind: "share", id: "file", name: "report.pdf", title: "fallback", protected: false, comment: true },
    { kind: "share", id: "media", title: "Media", protected: false, jellyfin: true, tags: ["媒体"] },
  ])
  assert.equal(data.size, 4)
  assert.equal(data.has(driveShareGraphSlug("media")), true)
  assert.equal(data.get("Memo/article" as SimpleSlug), article)
  const share = data.get("Share/分享/日语-资料" as SimpleSlug)!
  assert.equal(share.title, "日语-资料")
  assert.deepEqual(share.tags, ["学习", "Study-Notes", "分类/日语"])
  assert.deepEqual(data.get("Share/分享/file" as SimpleSlug)!.tags, [])
  assert.ok([...data.keys()].every(key => !key.includes("?") && !key.includes("#")))
})

test("sharing appearance applies only to actual share roots", () => {
  assert.equal(isDriveShareGraphNode("Share/分享/资料"), true)
  assert.equal(isDriveShareGraphNode("Share/分享/file-share"), true)
  for (const id of ["Memo/article", "tags/分享", "Drive", "Share/空间/Root", "Share/分享", "Share/分享/资料/file.txt"]) assert.equal(isDriveShareGraphNode(id), false)
})

test("share identities retain IDs ending in index instead of using Quartz article simplification", () => {
  const data = new Map<SimpleSlug, ContentDetails>()
  mergeDriveShareGraph(data, [{ kind: "share", id: "index", title: "index", protected: false }, { kind: "share", id: "myindex", title: "myindex", protected: false }])
  assert.ok(data.has("Share/分享/index" as SimpleSlug))
  assert.ok(data.has("Share/分享/myindex" as SimpleSlug))
  assert.equal(driveShareGraphSlug("日语"), "Share/分享/日语")
})
