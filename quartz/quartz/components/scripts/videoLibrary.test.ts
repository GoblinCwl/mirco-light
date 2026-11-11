import { test } from "node:test"
import assert from "node:assert/strict"
import { collectionVideos, standaloneVideos, seriesLibrary, videoHref, videoRoute, videoPlayerUrl, type VideoLibrary } from "./videoLibrary"

test("BV routes remain stable across collection names and support real multi-part selection", () => {
  const route = videoRoute(new URL(videoHref("BV1xx411c7mD", "series-9", 2), "https://example.com"))
  assert.equal(route.bvid, "BV1xx411c7mD")
  assert.equal(route.collection, "series-9")
  assert.equal(route.page, 2)
  const player = new URL(videoPlayerUrl(route.bvid, route.page))
  assert.equal(player.searchParams.get("p"), "2")
  assert.equal(player.searchParams.get("bvid"), route.bvid)
  assert.equal(player.searchParams.get("autoplay"), "0")
  assert.equal(player.searchParams.get("t"), "0")
  assert.throws(() => videoPlayerUrl("bad"), /无效/)
  assert.equal(videoRoute(new URL("https://example.com/Video/missing/")).valid, false)
  assert.equal(videoRoute(new URL("https://example.com/Video/collection/")).valid, false)
  assert.equal(route.valid, true)
})
test("unavailable videos are excluded and equal publication dates retain stable order", () => {
  const library = { videos: [{ bvid: "BV1xx411c7mD" }, { bvid: "BV1yy411c7mD" }, { bvid: "BV1zz411c7mD" }], collections: [{ id: "series-9", bvids: ["BV1yy411c7mD", "removed", "BV1xx411c7mD"] }] } as VideoLibrary
  assert.deepEqual(collectionVideos(library, library.collections[0]).map(v => v.bvid), ["BV1yy411c7mD", "BV1xx411c7mD"])
  assert.deepEqual(standaloneVideos(library).map(v => v.bvid), ["BV1zz411c7mD"])
  const route = videoRoute(new URL(videoHref("", "season-8"), "https://example.com"))
  assert.equal(route.collection, "season-8")
  assert.equal(route.bvid, "")
})

test("only series classify videos; season-only and ungrouped videos go to Other", () => {
  const library = { videos: [{ bvid: "a" }, { bvid: "b" }, { bvid: "c" }], collections: [{ id: "season-1", kind: "season", bvids: ["a"] }, { id: "series-2", kind: "series", bvids: ["b"] }] } as VideoLibrary
  const result = seriesLibrary(library)
  assert.deepEqual(result.collections.map(item => item.id), ["series-2", "other"])
  assert.deepEqual(result.collections[1].bvids, ["a", "c"])
  assert.deepEqual(standaloneVideos(result), [])
  assert.deepEqual(seriesLibrary(result), result)
})

test("directory series and videos use latest publication, keeping Other last and the source untouched", () => {
  const library = { videos: [{ bvid: "old", publishedAt: "2025-01-01T00:00:00Z" }, { bvid: "new", publishedAt: "2026-01-01T00:00:00Z" }, { bvid: "other", publishedAt: "2026-11-01T00:00:00Z" }], collections: [{ id: "series-old", kind: "series", bvids: ["old"] }, { id: "series-new", kind: "series", bvids: ["old", "new"] }] } as VideoLibrary
  const result = seriesLibrary(library)
  assert.deepEqual(result.collections.map(group => group.id), ["series-new", "series-old", "other"])
  assert.deepEqual(collectionVideos(result, result.collections[0]).map(video => video.bvid), ["new", "old"])
  assert.equal(library.videos[0].bvid, "old")
  assert.equal(library.collections[0].id, "series-old")
})
