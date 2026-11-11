import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { transformSync } from "esbuild"
import { Mutex } from "async-mutex"

// Execute the production rebuild body without importing the site configuration,
// starting watchers or writing to the site's output directory.
const source = readFileSync(new URL("./build.ts", import.meta.url), "utf8")
const body = source.slice(
  source.indexOf("async function rebuild("),
  source.indexOf("\nexport default async"),
)
const code = transformSync(body, { loader: "ts" }).code
function fixture() {
  const parsed: string[][] = [],
    emitted: string[][] = [],
    refreshes: string[] = [],
    fullBuilds: string[][] = [],
    candidates: boolean[] = [],
    published: string[] = [],
    discarded: string[] = [],
    notifications: string[] = []
  let fail = false,
    fullFail = false,
    parseGate: (() => Promise<void>) | undefined
  const dependencies = {
    path,
    randomIdNonSecure: (() => {
      let id = 0
      return () => String(++id)
    })(),
    PerfTimer: class {
      addEvent() {}
      timeSince() {
        return "0ms"
      }
    },
    styleText: (_: unknown, text: string) => text,
    console: { log() {} },
    getStaticResourcesFromPlugins: () => ({}),
    joinSegments: (...parts: string[]) => parts.join("/"),
    toPosixPath: (value: string) => value,
    slugifyFilePath: (value: string) => value,
    parseMarkdown: async (_: unknown, paths: string[]) => {
      parsed.push(paths)
      await parseGate?.()
      return paths.map((path) => [
        {},
        { data: { relativePath: path.replace(/^content\//, ""), publish: true } },
      ])
    },
    filterContent: (_: unknown, files: any[]) =>
      files.filter(([, file]) => file.data.publish !== false),
    beginPublication: async (root: string, inherit: boolean) => {
      assert.equal(root, "unused")
      candidates.push(inherit)
      return {
        directory: "candidate",
        commit: async () => {
          published.push("commit")
        },
        discard: async () => {
          discarded.push("discard")
        },
      }
    },
    emitContent: async (_: unknown, files: any[]) => {
      fullBuilds.push(files.map(([, file]) => file.data.relativePath))
      return !fullFail
    },
    publishBuildSnapshot: async () => {
      notifications.push("build-state")
    },
    notifyBuildPublished: async () => {
      assert.deepEqual(notifications.slice(-2), ["content", "build-state"])
      assert.ok(published.length > 0)
      notifications.push("notify")
    },
    publishContentSnapshot: async () => {
      notifications.push("content")
    },
    discoveryContent: (_: unknown, files: any[]) => files,
  }
  const rebuild = Function(
    ...Object.keys(dependencies),
    `${code}; return rebuild`,
  )(...Object.values(dependencies))
  const ctx = {
    buildId: "",
    argv: { directory: "content", output: "unused", verbose: false },
    cfg: {
      plugins: {
        emitters: [
          {
            name: "fixture",
            emit: async (_: unknown, __: unknown, ___: unknown, events: any[]) => {
              if (fail) throw new Error("emitter failed")
              emitted.push(events.map((event) => event.path))
              return []
            },
          },
        ],
      },
    },
    allFiles: [],
    allSlugs: [],
  }
  const data = {
    ctx,
    outputRoot: "unused",
    contentMap: new Map(),
    mut: new Mutex(),
    changesSinceLastBuild: {},
    lastBuildMs: 0,
  }
  const changes: any[] = []
  return {
    data,
    changes,
    parsed,
    emitted,
    fullBuilds,
    candidates,
    published,
    discarded,
    notifications,
    refreshes,
    fail: (value: boolean) => (fail = value),
    fullFail: (value: boolean) => (fullFail = value),
    gate: (value?: () => Promise<void>) => (parseGate = value),
    run: () => rebuild(changes, () => refreshes.push("refresh"), data),
  }
}
test("successful incremental builds consume only their current batch", async () => {
  const f = fixture()
  f.changes.push({ path: "A.md", type: "change" })
  await f.run()
  f.changes.push({ path: "B.md", type: "change" })
  await f.run()
  assert.deepEqual(f.parsed, [["content/A.md"], ["content/B.md"]])
  assert.deepEqual(f.emitted, [["A.md"], ["B.md"]])
  assert.deepEqual(f.data.changesSinceLastBuild, {})
  assert.deepEqual(f.changes, [])
  assert.equal(f.data.mut.isLocked(), false)
})
test("an emitter failure releases the lock, retains changes and recovers on the next build", async () => {
  const f = fixture()
  f.fail(true)
  f.changes.push({ path: "A.md", type: "change" })
  await assert.rejects(f.run(), /emitter failed/)
  assert.equal(f.data.mut.isLocked(), false)
  assert.equal(f.refreshes.length, 0)
  assert.equal(f.changes.length, 1)
  f.fail(false)
  f.changes.push({ path: "B.md", type: "change" })
  await f.run()
  assert.deepEqual(f.fullBuilds, [["A.md", "B.md"]])
  assert.deepEqual(f.candidates, [true, false])
  assert.equal(f.published.length, 1)
  assert.equal(f.discarded.length, 2)
  assert.equal(f.data.ctx.argv.output, "unused")
  assert.deepEqual(f.data.changesSinceLastBuild, {})
  assert.equal(f.data.mut.isLocked(), false)
})
test("changes arriving during emission survive for the queued build; superseded builds release their locks", async () => {
  const f = fixture()
  let resolve!: () => void, entered!: () => void
  const inside = new Promise<void>((r) => (entered = r)),
    wait = new Promise<void>((r) => (resolve = r))
  f.gate(async () => {
    entered()
    await wait
  })
  f.changes.push({ path: "A.md", type: "change" })
  const first = f.run()
  await inside
  f.changes.push({ path: "B.md", type: "change" })
  const superseded = f.run()
  f.changes.push({ path: "C.md", type: "change" })
  const last = f.run()
  f.gate()
  resolve()
  await Promise.all([first, superseded, last])
  assert.deepEqual(f.parsed, [["content/A.md"], ["content/B.md", "content/C.md"]])
  assert.deepEqual(f.changes, [])
  assert.equal(f.data.mut.isLocked(), false)
})
test("full emission failure remains a full rebuild on retry and clears completed deletion state", async () => {
  const f = fixture()
  f.data.contentMap.set("A.md", {
    type: "markdown",
    content: [{}, { data: { relativePath: "A.md", publish: true } }],
  })
  f.changes.push({ path: "A.md", type: "delete" })
  f.fullFail(true)
  await assert.rejects(f.run(), /Full rebuild emission failed/)
  assert.equal(f.data.mut.isLocked(), false)
  f.fullFail(false)
  await f.run()
  assert.deepEqual(f.candidates, [false, false])
  assert.equal(f.published.length, 1)
  assert.deepEqual(f.data.changesSinceLastBuild, {})
  assert.deepEqual(f.changes, [])
  assert.equal(f.refreshes.length, 1)
})

test("publication notifies only after successful emission and both snapshots", async () => {
  const f = fixture()
  f.fail(true)
  f.changes.push({ path: "A.md", type: "change" })
  await assert.rejects(f.run(), /emitter failed/)
  assert.deepEqual(f.notifications, [])
  f.fail(false)
  await f.run()
  assert.deepEqual(f.notifications, ["content", "build-state", "notify"])
})
