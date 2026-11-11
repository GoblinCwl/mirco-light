import { test } from "node:test"
import assert from "node:assert/strict"
import { repoHref, repoRoute, repoMarkdownLink, repoEscape } from "./repoShared"

test("branch names, file names and language categories survive URL encoding", () => {
  const href = repoHref("example", { ref: "feature/example", path: "文档/a #b.md" })
  const route = repoRoute(new URL(href, "https://example.com"))
  assert.equal(route.ref, "feature/example")
  assert.equal(route.path, "文档/a #b.md")
  assert.equal(repoRoute(new URL(repoHref("", { language: "C#" }), "https://example.com")).language, "C#")
})
test("README links resolve against their branch and directory", () => {
  const link = repoMarkdownLink("../README.md#示例", "docs/intro.md", "repo", "feature/a")
  const route = repoRoute(new URL(link, "https://example.com"))
  assert.equal(route.path, "README.md")
  assert.equal(route.ref, "feature/a")
  const image = new URL(repoMarkdownLink("./assets/test.png", "docs/README.md", "repo", "main", true), "https://example.com")
  assert.equal(image.pathname, "/api/repo/repo/raw")
  assert.equal(image.searchParams.get("path"), "docs/assets/test.png")
  assert.equal(repoMarkdownLink("#title", "README.md", "repo", "main"), "#title")
})
test("README unsafe protocols and malformed encodings are rejected", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,hello", "//evil.example/a", "%ZZ"])
    assert.equal(repoMarkdownLink(value, "README.md", "repo", "main"), "")
  assert.equal(repoMarkdownLink("https://example.com/a", "README.md", "repo", "main"), "https://example.com/a")
  assert.equal(repoEscape('<img src=x onerror="run()">'), "&lt;img src=x onerror=&quot;run()&quot;&gt;")
})
