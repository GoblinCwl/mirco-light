import assert from "node:assert/strict"
import { test } from "node:test"
import { load } from "js-yaml"
import { remark } from "remark"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import { VFile } from "vfile"
import type { BuildCtx } from "./ctx"
import type { FilePath, FullSlug } from "./path"
import { originalKnowledgeMetadata, prepareKnowledgeMarkdown } from "./knowledgeMarkdown"

test("knowledge Markdown keeps original metadata types and resolves document links", () => {
  assert.equal(originalKnowledgeMetadata("---\n---\nBody\n---"), "")
  const source = `---
title: Note
tags: one, two
custom:
  active: false
  count: 2
---

## Heading

[Neighbor](Other.md) and ![Diagram](diagram.png).

| A | B |
| - | - |
| C | D |

\`\`\`js
console.log("kept")
\`\`\`

🔐β ciphertext 🔐 after
`
  const context = {
    cfg: { configuration: { baseUrl: "site.test", unlistedPatterns: ["Hidden/**"] } },
    allSlugs: ["Memo/Note", "Memo/Other", "Memo/diagram.png"],
  } as unknown as BuildCtx
  const tree = remark().use(remarkFrontmatter).use(remarkGfm).parse(source)
  const prepare = (path: string, frontmatter: VFile["data"]["frontmatter"]) => {
    const file = new VFile({
      data: {
        slug: "Memo/Note" as FullSlug,
        relativePath: path as FilePath,
        frontmatter,
        knowledgeMetadata: originalKnowledgeMetadata(source),
      },
    })
    prepareKnowledgeMarkdown(context, tree, file)
    return file.data.knowledge
  }
  const exported = prepare("Memo/Note.md", { title: "Note", tags: ["one", "two"] })
  assert.ok(exported)
  assert.deepEqual(load(exported.metadata), { title: "Note", tags: "one, two", custom: { active: false, count: 2 } })
  assert.match(exported.body, /\[Neighbor\]\(https:\/\/site\.test\/Memo\/Other\)/)
  assert.match(exported.body, /!\[Diagram\]\(https:\/\/site\.test\/Memo\/diagram\.png\)/)
  assert.match(exported.body, /\| C +\| D +\|/)
  assert.match(exported.body, /console\.log\("kept"\)/)
  assert.ok(exported.body.includes("[加密文本] after") && !exported.body.includes("ciphertext"))
  assert.equal(prepare("Memo/Note.md", { title: "Draft", draft: true }), undefined)
  assert.equal(prepare("Memo/Note.md", { title: "Protected", passphrase: "secret" }), undefined)
  assert.equal(prepare("Hidden/Note.md", { title: "Hidden" }), undefined)
})
