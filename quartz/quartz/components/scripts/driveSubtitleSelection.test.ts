import {readFileSync} from "node:fs"
import {transformSync} from "esbuild"
import { test } from "node:test"
import assert from "node:assert/strict"
import { preferredSubtitle } from "./driveSubtitleSelection"

test("language labels take precedence over default flags and subtitle format", () => {
  const english = { name: "English", language: "eng", type: "ass", isDefault: true }
  const chinese = { name: "简体中文", language: "chs", type: "pgs" }
  const bilingual = { name: "中日双语", language: "zh", type: "ass" }
  assert.equal(preferredSubtitle([english, chinese], "电影.mkv"), chinese)
  assert.equal(preferredSubtitle([chinese, bilingual, english], "电影.mkv"), bilingual)
  assert.equal(preferredSubtitle([{ ...chinese, type: "ass" }, chinese], "电影.mkv")?.type, "ass")
  assert.equal(preferredSubtitle([], "电影.mkv"), undefined)
})
test("CHS, Chinese and bilingual variants use labels only and ignore the media filename", () => {
  for (const name of ["CHS", "Chinese", "zh-CN", "chs_eng", "简英双语", "中英"]) {
    const track = { name, language: "", type: "ass" }
    assert.equal(
      preferredSubtitle(
        [{ name: "English", language: "en", type: "ass", isDefault: true }, track],
        "中文片名.mkv",
      ),
      track,
    )
  }
  const english = { name: "中文片名.English.ass", language: "en", type: "ass" }
  const chinese = { name: "中文片名.CHS.ass", language: "zh", type: "ass" }
  assert.equal(preferredSubtitle([english, chinese], "中文片名.mkv"), chinese)
})
test("the serialized iframe selector works without module scope and agrees with the parent", () => {
  const module = {exports: {} as {preferredSubtitle: typeof preferredSubtitle}}
  const source = readFileSync(new URL('./driveSubtitleSelection.ts', import.meta.url), 'utf8')
  const compiled = transformSync(source, {loader:'ts',format:'cjs'}).code
  Function('module','exports',compiled)(module,module.exports)
  const isolated = Function(`return (${module.exports.preferredSubtitle.toString()})`)() as typeof preferredSubtitle
  const choices = [
    { name: "English", language: "en", type: "ass", isDefault: true },
    { name: "中文", language: "zh", type: "pgs" },
  ]
  assert.deepEqual(isolated(choices, "movie.mkv"), preferredSubtitle(choices, "movie.mkv"))
})
