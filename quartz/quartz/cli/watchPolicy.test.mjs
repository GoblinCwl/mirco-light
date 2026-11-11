import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import chokidar from "chokidar"
import { minimatch } from "minimatch"
import { contentWatchIgnored, sourceWatchIgnored } from "./watchPolicy.mjs"

const directory = { isDirectory: () => true }, file = { isDirectory: () => false }
test("content watcher prunes ignored trees without hiding link-only notes or treating folders as files", () => {
  const root = join(tmpdir(), "notes")
  const patterns = ["Resources/**", "Private/日记/**", "**/!(*.md)"]
  const ignored = contentWatchIgnored(root, patterns, path => patterns.some(pattern => minimatch(path, pattern, { dot: true })))
  for (const path of [".obsidian", ".opencode", "Resources", "Private/日记"])
    assert.equal(ignored(join(root, path), directory), true, path)
  for (const path of ["Memo", "Work", "Private/备忘录"])
    assert.equal(ignored(join(root, path), directory), false, path)
  assert.equal(ignored(join(root, "Work/link-only.md"), file), false)
  assert.equal(ignored(join(root, "Memo/note.md"), file), false)
  assert.equal(ignored(join(root, "Memo/note.md.edtz"), file), true)
})
test("source watcher ignores dependencies/cache/tests and keeps assets and newly added source", () => {
  for (const path of ["quartz/.quartz-cache", "quartz/components/x.test.ts", "quartz/node_modules"])
    assert.equal(sourceWatchIgnored(join(process.cwd(), path), directory), true)
  for (const path of ["quartz/components/new.ts", "quartz/cli/new.mjs", "quartz/static/new.webp", "package-lock.json"])
    assert.equal(sourceWatchIgnored(join(process.cwd(), path), file), false)
  assert.equal(sourceWatchIgnored(join(process.cwd(), "quartz/home/README.md"), file), true)
})
test("native watcher includes live notes and skips hidden/excluded/non-Markdown files", async t => {
  const root = await mkdtemp(join(tmpdir(), "quartz-watch-"))
  const patterns = ["Resources/**", "**/!(*.md)"]
  const ignoreFile = path => patterns.some(pattern => minimatch(path, pattern, { dot: true }))
  for (const folder of ["Memo", "Work", ".obsidian/plugins", "Resources"])
    await mkdir(join(root, folder), { recursive: true })
  for (const path of ["Memo/note.md", "Work/link.md", ".obsidian/plugins/plugin.js", "Resources/asset.md", "Memo/note.md.edtz"])
    await writeFile(join(root, path), "fixture")
  const watcher = chokidar.watch(".", { cwd: root, ignoreInitial: true, ignored: contentWatchIgnored(root, patterns, ignoreFile) })
  t.after(async () => { await watcher.close(); await rm(root, { recursive: true, force: true }) })
  await new Promise((resolve, reject) => { watcher.once("ready", resolve); watcher.once("error", reject) })
  const watched = Object.entries(watcher.getWatched()).flatMap(([folder, entries]) => entries.map(name => join(folder, name)))
  assert.ok(watched.some(path => path.endsWith("note.md")))
  assert.ok(watched.some(path => path.endsWith("link.md")))
  assert.ok(!watched.some(path => /\.obsidian|Resources|\.edtz/.test(path)))
  const changed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Markdown watch did not fire")), 3000)
    watcher.once("change", path => { clearTimeout(timer); resolve(path) })
  })
  await writeFile(join(root, "Work/link.md"), "updated")
  assert.equal(await changed, "Work/link.md")
})
