import { test } from "node:test"
import assert from "node:assert/strict"
import { absoluteStoragePath, relativeStoragePath } from "./driveStoragePaths"
import { driveHref, driveRoute, requireDriveUser, setDriveToken } from "../components/scripts/driveClient"

test("storage URLs include account roots while API paths remain relative", () => {
  assert.equal(absoluteStoragePath("/Live/file.mp4", "/Resource"), "/Resource/Live/file.mp4")
  assert.equal(relativeStoragePath("/Resource/Live/file.mp4", "/Resource"), "/Live/file.mp4")
  assert.equal(absoluteStoragePath("/Resource/Live", "/Resource"), "/Resource/Resource/Live")
  assert.equal(relativeStoragePath("/Resource/Resource/Live", "/Resource"), "/Resource/Live")
  assert.equal(relativeStoragePath("/Resource-other/Live", "/Resource"), null)
  assert.equal(relativeStoragePath("/Live", "/Resource"), null)
  assert.equal(relativeStoragePath("/", "/Resource"), "/")
  assert.equal(relativeStoragePath("/Resource", "/Resource"), "/")
  assert.equal(absoluteStoragePath("/Live", "/"), "/Live")
  assert.equal(relativeStoragePath("/Live", "/"), "/Live")
})
test("browser routes round-trip scoped accounts; public/share URLs stay unchanged", async () => {
  const fetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ authenticated:true, share:{configured:true,token:"fixture-scoped-token",user: { username: "scoped", role: 2, base_path: "/用户根目录/资源" }} }))
  setDriveToken("fixture-scoped-token")
  try {
    await requireDriveUser()
    const href = driveHref("storage", "/Live/文件 #.mp4", "", false)
    assert.equal(decodeURI(href), "/Share/空间/用户根目录/资源/Live/文件 %23.mp4")
    assert.equal(driveRoute(new URL(href, "https://goblincwl.site")).path, "/Live/文件 #.mp4")
    assert.equal(driveRoute(new URL("https://goblincwl.site/Share/空间/other/Live")).valid, false)
    assert.equal(decodeURI(driveHref("storage")), "/Share/空间/")
    assert.equal(decodeURI(driveHref("share", "/Live", "share-id", true)), "/Share/分享/share-id/Live/")
    assert.equal(decodeURI(driveHref("guest", "/Live", "", true)), "/Share/Live/")
  } finally { setDriveToken(""); globalThis.fetch = fetch }
})
