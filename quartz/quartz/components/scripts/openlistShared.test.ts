import { test } from "node:test"
import assert from "node:assert/strict"
import { driveApiUrl, driveGuestFileUrl, driveDownloadUrl, drivePreviewKind, normalizeDrivePath, sortDriveFiles } from "./openlistShared"

test("file URLs preserve Unicode and reserved filename characters without injecting query parameters", () => {
  assert.equal(normalizeDrivePath("/a/../b//./c"), "/b/c")
  const url = driveDownloadUrl("/资料/文件 #?%.txt", "abc&download=true")
  assert.equal(url, "https://drive.goblincwl.site/d/%E8%B5%84%E6%96%99/%E6%96%87%E4%BB%B6%20%23%3F%25.txt?sign=abc%26download%3Dtrue")
  for (const route of ["auth/login", "me", "fs/list", "fs/get", "fs/put"]) {
    assert.equal(new URL(driveApiUrl(route)).origin, "https://drive.goblincwl.site")
  }
})
test("active document formats are previewed as text rather than executed", () => {
  for (const filename of ["unsafe.html", "unsafe.svg", "script.JS"]) assert.equal(drivePreviewKind(filename), "text")
  assert.equal(drivePreviewKind("photo.WEBP"), "image")
  assert.equal(drivePreviewKind("archive.zip"), "other")
})
test("all sort modes preserve folders first and do not mutate the original listing", () => {
  const files = [
    { name: "file2", is_dir: false, size: 10, modified: "2026-11-01" },
    { name: "file10", is_dir: false, size: 100, modified: "2026-11-02" },
    { name: "folder", is_dir: true, size: 0, modified: "2020-01-01" },
  ]
  assert.deepEqual(sortDriveFiles(files, "name").map(file => file.name), ["folder", "file2", "file10"])
  for (const sort of ["size", "modified"]) assert.deepEqual(sortDriveFiles(files, sort).map(file => file.name), ["folder", "file10", "file2"])
  assert.equal(files[0].name, "file2")
})

test("media requests use the media proxy while file and account APIs stay on Drive", () => {
  for (const endpoint of ["lookup", "playback", "stop", "danmaku", "media", "aliases", "subtitle/match/1/track.ass", "stream/session/segment"]) {
    assert.equal(new URL(driveApiUrl("public/quartz/jellyfin/" + endpoint)).origin, "https://media.goblincwl.site")
  }
  assert.equal(new URL(driveApiUrl("public/quartz/entries")).origin, "https://drive.goblincwl.site")
})


test("guest file links use the API-authorized URL without private account paths or altered signatures", () => {
  const raw_url = "https://files.example.test/public/video.mp4?signature=abc%2F123&expires=123"
  assert.equal(driveGuestFileUrl({raw_url}), raw_url)
  assert.equal(driveGuestFileUrl({raw_url:"/p/public/file.txt?sign=abc"}), "https://drive.goblincwl.site/p/public/file.txt?sign=abc")
  assert.throws(()=>driveGuestFileUrl({}), /未返回下载地址/)
  for(const raw_url of ["javascript:alert(1)","data:text/plain,hello","file:///private/file"])
    assert.throws(()=>driveGuestFileUrl({raw_url}), /下载地址无效/)
})
