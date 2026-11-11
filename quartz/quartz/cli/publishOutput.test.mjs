import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beginPublication } from "./publishOutput.mjs"

test("publication keeps the live build intact, discards failures, and retains one previous release", async () => {
  const root = await mkdtemp(join(tmpdir(), "quartz-publish-"))
  const before = process.env.QUARTZ_ATOMIC_PUBLISH
  process.env.QUARTZ_ATOMIC_PUBLISH = "1"
  const live = () => readFile(join(root, "current/index.html"), "utf8")
  try {
    const initial = await beginPublication(root)
    await writeFile(join(initial.directory, "index.html"), "old")
    await writeFile(join(initial.directory, "removed.html"), "removed")
    await initial.commit()
    const firstTarget = await readlink(join(root, "current"))

    const failed = await beginPublication(root, true)
    await writeFile(join(failed.directory, "index.html"), "failed")
    assert.equal(await live(), "old", "candidate writes cannot mutate the published files")
    await failed.discard()
    assert.equal(await live(), "old")
    assert.equal(await readlink(join(root, "current")), firstTarget)

    const incremental = await beginPublication(root, true)
    await writeFile(join(incremental.directory, "index.html"), "new")
    await rm(join(incremental.directory, "removed.html"))
    assert.equal(await live(), "old")
    assert.equal(await readFile(join(root, "current/removed.html"), "utf8"), "removed")
    await incremental.commit()
    await incremental.discard()
    assert.equal(await live(), "new")
    await assert.rejects(readFile(join(root, "current/removed.html")), { code: "ENOENT" })
    assert.equal(await readFile(join(root, firstTarget, "index.html"), "utf8"), "old")

    const full = await beginPublication(root)
    await writeFile(join(full.directory, "index.html"), "full")
    assert.equal(await live(), "new")
    await full.commit()
    assert.equal(await live(), "full")
    assert.equal((await readdir(join(root, ".releases"))).length, 2)
    await assert.rejects(readFile(join(root, firstTarget, "index.html")), { code: "ENOENT" })
  } finally {
    if (before === undefined) delete process.env.QUARTZ_ATOMIC_PUBLISH
    else process.env.QUARTZ_ATOMIC_PUBLISH = before
    await rm(root, { recursive: true, force: true })
  }
})
