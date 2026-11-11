import test from "node:test"
import assert from "node:assert/strict"
import { safeUploadPath } from "./driveUpload"

test("upload paths preserve selected folder structure and Unicode filenames", () => {
  assert.equal(safeUploadPath("资料/子目录/文件 #?%.txt"), "资料/子目录/文件 #?%.txt")
  assert.equal(safeUploadPath("empty.txt"), "empty.txt")
})
test("upload paths reject traversal, absolute paths and invalid path parts", () => {
  for (const path of ["/absolute.txt", "../escape.txt", "folder/../escape.txt", "folder//file", "folder\\file", "folder/./file", "folder/\u0000file", " "]) assert.throws(() => safeUploadPath(path), /路径无效/)
})
