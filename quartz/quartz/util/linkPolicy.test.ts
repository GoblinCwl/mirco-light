import { test } from "node:test"
import assert from "node:assert/strict"
import { contentLinkKind } from "./linkPolicy"

test("content links distinguish the site, subdomains, protocols and attachments", () => {
  for (const href of ["/Memo/test", "../note", "#heading", "https://goblincwl.site/Repo/test", "http://goblincwl.site/page"]) assert.equal(contentLinkKind(href), "internal", href)
  for (const href of ["https://example.com", "//example.com/note", "https://drive.goblincwl.site/", "https://goblincwl.site.example.com", "https://goblincwl.site@example.com"]) assert.equal(contentLinkKind(href), "external", href)
  for (const href of ["mailto:a@example.com", "tel:123", "obsidian://open?vault=test"]) assert.equal(contentLinkKind(href), "special", href)
  for (const href of ["/static/a.png", "https://example.com/file.PDF?download=1", "/files/archive.zip"]) assert.equal(contentLinkKind(href), "attachment", href)
  assert.equal(contentLinkKind("https://example.org/page", "example.org"), "internal")
})
