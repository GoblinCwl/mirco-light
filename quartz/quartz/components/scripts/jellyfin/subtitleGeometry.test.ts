import { test } from "node:test"
import assert from "node:assert/strict"
import { subtitleGeometry } from "./subtitleGeometry"

test("inline text, margins and shadows shrink with the picture relative to fullscreen", () => {
  const full = subtitleGeometry(1920, 1080, 16 / 9, 1920, 1080)!
  const half = subtitleGeometry(960, 540, 16 / 9, 1920, 1080)!
  assert.equal(full.scale, 1)
  assert.equal(half.scale, 0.5)
  assert.equal(half.referenceWidth, full.referenceWidth)
  assert.equal(half.referenceHeight, full.referenceHeight)
})

test("portrait fullscreen black bars do not enlarge landscape subtitles", () => {
  const inline = subtitleGeometry(540, 303.75, 16 / 9, 1920, 1080)!
  const portrait = subtitleGeometry(540, 960, 16 / 9, 1080, 1920)!
  assert.equal(portrait.scale, inline.scale)
  assert.equal(portrait.height, 303.75)
  assert.equal(portrait.y, 328.125)
  assert.equal(portrait.referenceWidth, inline.referenceWidth)
})

test("widescreen and portrait media use their own aspect and a centered picture", () => {
  const wide = subtitleGeometry(1920, 1080, 2.4, 1920, 1080)!
  assert.equal(wide.height, 800)
  assert.equal(wide.y, 140)
  assert.equal(wide.scale, 1)
  const portrait = subtitleGeometry(1080, 1920, 9 / 16, 1920, 1080)!
  assert.equal(portrait.scale, 1)
  assert.equal(portrait.width, 1080)
  assert.equal(subtitleGeometry(0, 0, 16 / 9, 1920, 1080), undefined)
})
