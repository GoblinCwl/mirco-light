import test from "node:test"
import assert from "node:assert/strict"
import { DirectoryDates } from "./directoryDates"
import type { QuartzPluginData } from "../plugins/vfile"

function file(slug: string, day?: number): QuartzPluginData {
  const date = day === undefined ? undefined : new Date(2026, 0, day)
  return {
    slug: slug as QuartzPluginData["slug"],
    filePath: `${slug}.md` as QuartzPluginData["filePath"],
    frontmatter: { title: slug, tags: [] },
    dates: date && { created: date, modified: date, published: date },
  }
}

test("aggregates nested and index dates; preserves untouched branch summaries", () => {
  const index = new DirectoryDates()
  const files = [file("a/index", 2), file("a/b/one", 5), file("other/two", 3)]
  index.sync(files)
  assert.equal(index.get("a/index")?.modified.getDate(), 5)
  const untouched = index.get("other/index")
  files[1] = file("a/b/one", 1)
  index.sync(files)
  assert.equal(index.get("a/index")?.modified.getDate(), 2)
  assert.equal(index.get("a/b/index")?.modified.getDate(), 1)
  assert.strictEqual(index.get("other/index"), untouched)
})

test("handles additions, removals, renames, and in-place date changes", () => {
  const index = new DirectoryDates()
  const first = file("a/deep/one", 6)
  const second = file("a/two", 2)
  index.sync([first, second])
  index.sync([second])
  assert.equal(index.get("a")?.modified.getDate(), 2)
  assert.equal(index.get("a/deep"), undefined)
  const renamed = { ...second, slug: "b/two" as QuartzPluginData["slug"] }
  index.sync([renamed])
  assert.equal(index.get("a"), undefined)
  assert.equal(index.get("b")?.modified.getDate(), 2)
  renamed.dates!.modified.setDate(9)
  index.sync([renamed])
  assert.equal(index.get("b")?.modified.getDate(), 9)
  index.sync([])
  assert.equal(index.get("b"), undefined)
})

test("missing dates are not invented and can be populated later", () => {
  const index = new DirectoryDates()
  const undated = file("a/empty")
  index.sync([undated])
  index.sync([undated])
  assert.equal(index.get("a"), undefined)
  undated.dates = file("unused", 4).dates
  index.sync([undated])
  assert.equal(index.get("a")?.modified.getDate(), 4)
})
