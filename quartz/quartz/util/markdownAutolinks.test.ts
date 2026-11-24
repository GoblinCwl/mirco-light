import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { runInNewContext } from "node:vm"
import { splitChineseAutolinks, type MarkdownTokenizer } from "./markdownAutolinks"

const bundle = new URL("../static/vendor/marked/15.0.12/lib/marked.umd.js", import.meta.url)
const marked = runInNewContext(readFileSync(bundle, "utf8") + "\nmarked") as {
  Tokenizer: new () => MarkdownTokenizer
  parse: (source: string, options: { gfm: boolean; async: false; tokenizer: MarkdownTokenizer }) => string
}

function parse(source: string) {
  const tokenizer = splitChineseAutolinks(new marked.Tokenizer())
  return marked.parse(source, { gfm: true, async: false, tokenizer }).trim()
}

test("Chinese prose ends bare URLs and can be followed by another link", () => {
  assert.equal(
    parse("地址是 https://goblincwl.site，由 GoblinCwl 创建。"),
    '<p>地址是 <a href="https://goblincwl.site">https://goblincwl.site</a>，由 GoblinCwl 创建。</p>',
  )
  assert.equal(
    parse("https://goblincwl.site/Memo/中文标题。https://example.org！"),
    '<p><a href="https://goblincwl.site/Memo/%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98">https://goblincwl.site/Memo/中文标题</a>。<a href="https://example.org">https://example.org</a>！</p>',
  )
})

test("punctuation in explicit links and code stays inside its original span", () => {
  assert.equal(
    parse("[文章](https://goblincwl.site/Memo/甲，乙) `https://goblincwl.site，示例`"),
    '<p><a href="https://goblincwl.site/Memo/%E7%94%B2%EF%BC%8C%E4%B9%99">文章</a> <code>https://goblincwl.site，示例</code></p>',
  )
})
