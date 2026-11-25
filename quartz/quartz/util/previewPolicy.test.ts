import { test } from "node:test"
import assert from "node:assert/strict"
import { isNonPreviewLink } from "./previewPolicy"

const base = "https://goblincwl.site/Memo/MicroLight/about"

test("navigation, feeds and API links never request content previews", () => {
  for (const href of [
    "/reading", "/reading/", "/reading/index.html?type=article#top", "../../reading/",
    "https://goblincwl.site/reading/", "/tags/?tag=hello", "/friends/", "/observatory/", "/archives/",
    "/", "/Repo/", "/Video/", "/Share/", "/index.xml?type=article", "/articles.xml", "../../friends.xml",
    "/some-feed.RSS#latest", "/feed.atom", "/index%2Exml", "/api/site/content/rss", "/artalk/api/v2/conf",
    "mailto:hello@example.test", "https://example.com/reading/", "https://drive.goblincwl.site/",
  ]) assert.equal(isNonPreviewLink(href, base), true, href)
})

test("articles and project links remain eligible, including XML files within projects", () => {
  for (const href of [
    "/Memo/reading", "/Memo/article", "/reading-notes", "/Repo/micro-light",
    "/Repo/micro-light?path=feed.xml", "/Video/BV123", "/Share/分享/abc",
    "/Share/分享/abc/feed.xml",
  ]) assert.equal(isNonPreviewLink(href, base), false, href)
})
