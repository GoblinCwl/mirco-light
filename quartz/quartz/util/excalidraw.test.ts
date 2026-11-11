import { test } from "node:test"
import assert from "node:assert/strict"
import { excalidrawMarkdown } from "./excalidraw"

test("ordinary Markdown and other JSON code blocks are untouched", () => {
  const markdown = '---\ntitle: note\n---\n\n```json\n{"hello":"world"}\n```'
  assert.equal(excalidrawMarkdown(markdown), markdown)
})
test("Obsidian compressed scenes survive comment stripping; generated content preserves front matter", () => {
  const frontmatter = '---\nexcalidraw-plugin: parsed\npublish: true\ntags:\n  - excalidraw\n---'
  const markdown = `${frontmatter}\n\n# Excalidraw Data\n## Text Elements\nInternal text\n%%\n## Drawing\n\`\`\`compressed-json\nAbCD\n1234+/==\n\`\`\`\n%%`
  const result = excalidrawMarkdown(markdown)
  assert.ok(result.startsWith(frontmatter + "\n"))
  assert.match(result, /data-excalidraw-encoding="lz-base64"/)
  assert.match(result, /data-excalidraw-scene="AbCD1234\+\/=="/)
  assert.doesNotMatch(result, /## Drawing|%%|Internal text/)
})
test("uncompressed drawings preserve Unicode and HTML-like scene text inside base64", () => {
  const json = JSON.stringify({ type: "excalidraw", elements: [{ type: "text", text: '你好 </figure><script>alert(1)</script>' }] })
  const result = excalidrawMarkdown(`---\r\nexcalidraw-plugin: parsed\r\n---\r\n## Drawing\r\n\`\`\`json\r\n${json}\r\n\`\`\``)
  assert.equal(Buffer.from(/data-excalidraw-scene="([^"]+)"/.exec(result)![1], "base64").toString("utf8"), json)
  assert.doesNotMatch(result, /<script>|你好/)
})
