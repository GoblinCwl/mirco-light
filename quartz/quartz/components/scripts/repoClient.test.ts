import { test } from "node:test"
import assert from "node:assert/strict"
import { repoCachedRequest, readRepoCatalog, peekRepoCatalog } from "./repoClient"

test("repeated reads share a request and failed reads can retry", async context => {
  let calls = 0, fail = false
  context.mock.method(globalThis, "fetch", async () => {
    calls++
    return new Response(JSON.stringify(fail ? { error: "暂不可用" } : { value: calls }), { status: fail ? 502 : 200, headers: { "Content-Type": "application/json" } })
  })
  const [first, second] = await Promise.all([repoCachedRequest("/api/repo/test/browse"), repoCachedRequest("/api/repo/test/browse")])
  assert.deepEqual(first, second)
  assert.equal(calls, 1)
  await repoCachedRequest("/api/repo/test/browse")
  assert.equal(calls, 1)
  fail = true
  await assert.rejects(repoCachedRequest("/api/repo/test/readme"), /暂不可用/)
  fail = false
  await repoCachedRequest("/api/repo/test/readme")
  assert.equal(calls, 3)
})

test("catalog readers share the same pending snapshot used by initial titles", async context => {
  let calls = 0
  const repository = { name: "fork-project", fork: true, language: "TypeScript" }
  context.mock.method(globalThis, "fetch", async () => {
    calls++
    return new Response(JSON.stringify({ owner: "Example", repositories: [repository] }), { headers: { "Content-Type": "application/json" } })
  })
  const first = readRepoCatalog(), second = readRepoCatalog()
  assert.strictEqual(await first, await second)
  assert.equal(calls, 1)
  assert.deepEqual(peekRepoCatalog()?.repositories[0], repository)
})

test('missing repository content is distinct from temporary service failures',async context=>{
 const {repoRequest}=await import('./repoClient')
 const {PageNotFoundError}=await import('./siteError')
 context.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:'仓库不存在'}),{status:404,headers:{'Content-Type':'application/json'}}))
 await assert.rejects(repoRequest('/api/repo/missing/info'),PageNotFoundError)
 context.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:'仓库服务暂时不可用'}),{status:503,headers:{'Content-Type':'application/json'}}))
 await assert.rejects(repoRequest('/api/repo/missing/info'),error=>error instanceof Error&&!(error instanceof PageNotFoundError))
})
