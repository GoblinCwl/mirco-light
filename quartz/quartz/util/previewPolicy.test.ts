import { test } from "node:test"
import assert from "node:assert/strict"
import { isNavigationLink } from "./previewPolicy"

test("functional links never request content previews; content links remain eligible", () => {
 const base = "https://goblincwl.site/Memo/MicroLight/about"
 for (const href of ["/reading", "/reading/", "/reading/index.html?type=article#top", "../../reading/", "https://goblincwl.site/reading/", "/tags/?tag=hello", "/friends/", "/observatory/", "/archives/", "/", "/Repo/", "/Video/", "/Share/"]) assert.equal(isNavigationLink(href,base),true,href)
 for (const href of ["/Memo/reading", "/Memo/article", "/reading-notes", "/Repo/micro-light", "/Video/BV123", "/Share/分享/abc", "https://example.com/reading/", "https://drive.goblincwl.site/"]) assert.equal(isNavigationLink(href,base),false,href)
})
