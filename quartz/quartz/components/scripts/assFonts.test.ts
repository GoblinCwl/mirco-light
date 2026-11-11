import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { transformSync } from "esbuild"
import { embeddedASSFont } from "./assFonts"
const data = new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
function encoded(bytes: Uint8Array) {
  let bits = 0,
    value = 0,
    out = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 6) {
      bits -= 6
      out += String.fromCharCode(((value >> bits) & 63) + 33)
    }
  }
  if (bits) out += String.fromCharCode(((value << (6 - bits)) & 63) + 33)
  return out
}
const fixture = (text = "text", style = "Default", extras = "", fonts = ["Present"]) =>
  `[V4+ Styles]\nFormat: Name, Fontname\nStyle: Default,Present\nStyle: Unused,Missing\nStyle: Reset,ResetFont\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:01.00,${style},,0,0,0,,${text}\n${extras}\n[Fonts]\n${fonts.map((name) => `fontname:${name}_B0.ttf\n${encoded(data)}`).join("\n")}`
test("unused styles and comments do not trigger a full fallback font download", () => {
  assert.deepEqual(
    embeddedASSFont(fixture("text", "Default", "Comment: 0,0,1,Unused,,0,0,0,,unused")),
    data,
  )
  assert.equal(embeddedASSFont(fixture("text", "Unused")), undefined)
})
test("active font overrides and named style resets still require all fonts", () => {
  assert.equal(embeddedASSFont(fixture("{\\fnOther}text")), undefined)
  assert.deepEqual(
    embeddedASSFont(fixture("{\\fnOther}text", "Default", "", ["Present", "Other"])),
    data,
  )
  assert.equal(embeddedASSFont(fixture("{\\rReset}text")), undefined)
  assert.deepEqual(
    embeddedASSFont(fixture("{\\rReset}text", "Default", "", ["Present", "ResetFont"])),
    data,
  )
  assert.deepEqual(embeddedASSFont(fixture("{\\r}text")), data)
})
test("malformed font attachments retain fallback behavior", () => {
  assert.equal(embeddedASSFont(fixture().replace(encoded(data), "invalid font data")), undefined)
  assert.equal(
    embeddedASSFont(fixture().replace(encoded(data), encoded(new Uint8Array(16)))),
    undefined,
  )
  assert.equal(embeddedASSFont("[Script Info]\nTitle: none"), undefined)
})
test("the font helper can run in the isolated iframe without module globals", () => {
  const module = { exports: {} as { embeddedASSFont: typeof embeddedASSFont } }
  Function(
    "module",
    "exports",
    transformSync(readFileSync(new URL("./assFonts.ts", import.meta.url), "utf8"), {
      loader: "ts",
      format: "cjs",
    }).code,
  )(module, module.exports)
  const isolated = Function(
    `return (${module.exports.embeddedASSFont.toString()})`,
  )() as typeof embeddedASSFont
  assert.deepEqual(isolated(fixture()), data)
})
