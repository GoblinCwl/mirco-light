import { test } from "node:test"
import assert from "node:assert/strict"
import { createRepoViewNavigation } from "./repoViewNavigation"
import { sameRepo } from "./repoNavigationScope"

const url = (query = "") => new URL(`https://example.com/Repo/project/${query}`)
const tick = () => new Promise<void>(resolve => setImmediate(resolve))
test("tabs, files and branches stay inside the same repository", () => {
  for (const suffix of ["?tab=commits", "?tab=releases", "?path=src%2Fmain.ts", "?ref=feature%2Ftest"])
    assert.equal(sameRepo(url(), url(suffix)), true)
  for (const target of ["https://example.com/Repo/other/", "https://example.com/Repo/", "https://example.com/Share/project/", "https://other.example/Repo/project/"])
    assert.equal(sameRepo(url(), new URL(target)), false)
})
test("a late A response cannot complete a newer A → B → A navigation", async () => {
  const reads: { signal: AbortSignal; finish: () => void }[] = [], busy: boolean[] = [], pushed: string[] = [], ready: string[] = []
  const navigation = createRepoViewNavigation(url(), {
    render: (_url, signal) => new Promise<void>(resolve => reads.push({ signal, finish: resolve })),
    busy: value => busy.push(value), push: value => pushed.push(value.search), anchor: () => {}, updateDirectory: () => {},
    ready: value => ready.push(value.search),
  })
  navigation.navigate(url(), false)
  navigation.navigate(url("?path=a.ts"))
  navigation.navigate(url())
  assert.equal(reads[0].signal.aborted, true)
  assert.equal(reads[1].signal.aborted, true)
  reads[0].finish(); reads[1].finish(); await tick()
  assert.deepEqual(busy, [true, true, true])
  assert.deepEqual(ready, [])
  reads[2].finish(); await tick()
  assert.deepEqual(busy, [true, true, true, false])
  assert.deepEqual(ready, [""])
  assert.deepEqual(pushed, ["?path=a.ts", ""])
  navigation.dispose()
})

test("same-view result clicks wait for rendering, then invoke ready without fetching again", async () => {
  let finish!: () => void, reads = 0, ready = 0, anchors = 0
  const navigation = createRepoViewNavigation(url(), {
    render: () => { reads++; return new Promise<void>(resolve => {finish=resolve}) },
    busy: () => {}, push: () => {}, anchor: () => {anchors++}, updateDirectory: () => {}, ready: () => {ready++},
  })
  navigation.navigate(url(),false)
  navigation.navigate(url("#readme"),false)
  assert.equal(ready,0)
  assert.equal(anchors,0)
  finish(); await tick()
  assert.equal(ready,1)
  assert.equal(anchors,1)
  navigation.navigate(url("#readme"),false)
  assert.equal(ready,2)
  assert.equal(reads,1)
  navigation.dispose()
})
test("back/forward restores a view without pushing history; same-view anchors do not reload", async () => {
  let reads = 0, pushes = 0, anchors = 0
  const navigation = createRepoViewNavigation(url(), {
    render: async () => { reads++ }, busy: () => {}, push: () => { pushes++ }, anchor: () => { anchors++ }, updateDirectory: () => {},
  })
  navigation.navigate(url(), false); await tick()
  navigation.navigate(url("#readme")); await tick()
  assert.equal(reads, 1)
  assert.equal(anchors, 1)
  navigation.navigate(url("?tab=commits"), false); await tick()
  assert.equal(reads, 2)
  assert.equal(pushes, 1)
  navigation.navigate(url("?tab=commits"), false, true); await tick()
  assert.equal(reads, 3)
  assert.equal(pushes, 1)
  navigation.dispose()
})
