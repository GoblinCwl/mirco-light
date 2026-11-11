import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { Mutex } from "async-mutex"
import { BuildProcess } from "./buildProcessClient.mjs"

async function fixture(t, code) {
  const root = await mkdtemp(join(tmpdir(), "quartz-process-"))
  const module = join(root, "build.mjs")
  await writeFile(module, code)
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, moduleURL: pathToFileURL(module).href }
}

test("reloading disposes the process and module globals instead of caching historical bundles", async t => {
  const { root, moduleURL } = await fixture(t, `
    import {writeFile} from 'node:fs/promises';
    globalThis.buildLoads=(globalThis.buildLoads||0)+1;
    export default async function(argv,mutex,refresh){
      const release=await mutex.acquire();
      await writeFile(argv.result,JSON.stringify({pid:process.pid,loads:globalThis.buildLoads}));release();refresh();
      return async()=>writeFile(argv.closed,'closed');
    }`)
  const mutex = new Mutex(), processes = new Set()
  let refreshed = 0
  for (let index = 0; index < 4; index++) {
    const closed = join(root, `closed-${index}`), result = join(root, "result")
    const builder = new BuildProcess(moduleURL, { result, closed }, mutex, { refresh: () => refreshed++ })
    try {
      await builder.ready
      const state = JSON.parse(await readFile(result, "utf8"))
      assert.equal(state.loads, 1)
      assert.equal(processes.has(state.pid), false)
      processes.add(state.pid)
    } finally { await builder.close() }
    assert.equal(await readFile(closed, "utf8"), "closed")
    assert.equal(builder.child.exitCode, 0)
    assert.equal(mutex.isLocked(), false)
    assert.equal(builder.locks.size, 0)
  }
  assert.equal(refreshed, 4)
})

test("shutdown drains an in-flight article write before releasing the builder", async t => {
  const { root, moduleURL } = await fixture(t, `
    import {writeFile} from 'node:fs/promises';
    export default async function(argv,mutex){
      void(async()=>{const release=await mutex.acquire();await new Promise(r=>setTimeout(r,80));await writeFile(argv.result,'published');release()})();
      return async()=>{};
    }`)
  const mutex = new Mutex(), result = join(root, "result")
  const builder = new BuildProcess(moduleURL, { result }, mutex)
  await builder.ready
  const closing = builder.close()
  assert.equal(builder.close(), closing, "concurrent reloads must share shutdown")
  await closing
  assert.equal(await readFile(result, "utf8"), "published")
  assert.equal(mutex.isLocked(), false)
})

test("a failed builder releases publication locks and allows a subsequent successful build", async t => {
  const { root, moduleURL } = await fixture(t, `
    export default async function(argv,mutex){await mutex.acquire();throw new Error('fixture build failed')}`)
  const mutex = new Mutex()
  const builder = new BuildProcess(moduleURL, {}, mutex)
  await assert.rejects(builder.ready, /fixture build failed/)
  await builder.close().catch(() => {})
  assert.equal(mutex.isLocked(), false)
  const next = join(root, "repaired.mjs")
  await writeFile(next, `export default async function(argv,mutex){const release=await mutex.acquire();release()}`)
  const repaired = new BuildProcess(pathToFileURL(next).href, {}, mutex)
  await repaired.ready
  await repaired.close()
  assert.equal(mutex.isLocked(), false)
})

test("an unexpected builder exit is reported once and releases its locks", async t => {
  const { moduleURL } = await fixture(t, `export default async function(){setTimeout(()=>process.exit(17),20);return async()=>{}}`)
  const errors = [], mutex = new Mutex()
  const builder = new BuildProcess(moduleURL, {}, mutex, { error: error => errors.push(error.message) })
  await builder.ready
  await builder.done
  await builder.close()
  assert.equal(errors.length, 1)
  assert.match(errors[0], /17/)
  assert.equal(mutex.isLocked(), false)
})

test("native image dependencies are safely released when the build process exits", async t => {
  const requireFrom = JSON.stringify(pathToFileURL(join(process.cwd(), "package.json")).href)
  const { root, moduleURL } = await fixture(t, `
    import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';
    const sharp=createRequire(${requireFrom})('sharp');
    export default async function(argv,mutex){
      const release=await mutex.acquire();
      const png=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="#37a"/></svg>')).png().toBuffer();
      await writeFile(argv.result,png);release();return async()=>{};
    }`)
  const mutex = new Mutex()
  for (let i = 0; i < 3; i++) {
    const result = join(root, `native-${i}.png`), builder = new BuildProcess(moduleURL, { result }, mutex)
    try { await builder.ready } finally { await builder.close() }
    assert.equal(builder.child.exitCode, 0)
    assert.equal((await readFile(result)).subarray(1, 4).toString(), "PNG")
    assert.equal(mutex.isLocked(), false)
  }
})
