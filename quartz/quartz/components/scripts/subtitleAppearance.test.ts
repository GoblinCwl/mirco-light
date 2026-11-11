import { test } from "node:test"
import assert from "node:assert/strict"
import {
  defaultSubtitleAppearance,
  normalizeSubtitleAppearance,
  subtitleAppearanceStyles,
} from "./subtitleAppearance"

test("Jellyfin text appearance defaults and reset are stable independent copies", () => {
  const value = normalizeSubtitleAppearance()
  assert.deepEqual(value, defaultSubtitleAppearance)
  value.font = "default"
  assert.equal(normalizeSubtitleAppearance().font, "casual")
  const styles = subtitleAppearanceStyles(normalizeSubtitleAppearance())
  assert.equal(styles.fontSize, "2.924rem")
  assert.equal(styles.fontWeight, "700")
  assert.match(styles.fontFamily, /^Gabriola,Segoe Print,Comic Sans MS,/)
  assert.equal(styles.marginBottom, "1.35em")
})

test("stored appearance rejects arbitrary CSS, invalid enums and out of range positions", () => {
  const result = normalizeSubtitleAppearance({
    font: "Arial; color:red",
    textColor: "red;}body{display:none}",
    textSize: "huge",
    textWeight: "900",
    subtitleStyling: "unknown",
    verticalPosition: 50,
    dropShadow: "injected",
  })
  assert.deepEqual(result, defaultSubtitleAppearance)
  for (const value of [null, [], "invalid", { verticalPosition: NaN }, { verticalPosition: 1.5 }])
    assert.deepEqual(normalizeSubtitleAppearance(value), defaultSubtitleAppearance)
  const valid = normalizeSubtitleAppearance({
    textWeight: "normal",
    textSize: "small",
    font: "smallcaps",
    dropShadow: "uniform",
    verticalPosition: 3,
    textColor: "#abcdef",
    subtitleStyling: "Native",
  })
  const style = subtitleAppearanceStyles(valid, false)
  assert.equal(style.fontVariant, "small-caps")
  assert.equal(style.fontWeight, "400")
  assert.equal(style.color, "#abcdef")
  assert.equal(style.marginBottom, "0px")
  assert.equal(style.marginTop, "4.05em")
  assert.notEqual(style.textShadow, "none")
})
