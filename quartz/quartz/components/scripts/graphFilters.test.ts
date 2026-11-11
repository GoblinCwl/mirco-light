import { test } from "node:test"
import assert from "node:assert/strict"
import { filterGraphContent, graphNodeKind } from "./graphFilters"

test("graph content types distinguish articles, shares, repository and videos", () => {
  assert.equal(graphNodeKind("Memo/note"), "article")
  assert.equal(graphNodeKind("Share/分享/example"), "share")
  assert.equal(graphNodeKind("Video/BV123"), "video")
  assert.equal(graphNodeKind("Repo/project"), "repo")
  assert.equal(graphNodeKind("tags/学习"), undefined)
  assert.equal(graphNodeKind("/"), undefined)
})

test("filters retain the homepage and relevant tags without changing source data", () => {
  const source = new Map([
    ["/", { tags: [] }], ["Memo/note", { tags: ["学习"] }],
    ["Share/分享/example", { tags: ["资源"] }], ["Video/BV123", { tags: ["学习"] }],
    ["Repo/project", { tags: ["代码"] }],
    ["tags/学习", { tags: [] }], ["tags/资源", { tags: [] }], ["tags/代码", { tags: [] }],
  ])
  assert.deepEqual([...filterGraphContent(source, new Set(["video"])).keys()], ["/", "Video/BV123", "tags/学习"])
  assert.deepEqual([...filterGraphContent(source, new Set()).keys()], ["/"])
  assert.ok(!filterGraphContent(source, new Set(["article", "share", "video"])).has("Repo/project"))
  assert.equal(source.size, 8)
})
