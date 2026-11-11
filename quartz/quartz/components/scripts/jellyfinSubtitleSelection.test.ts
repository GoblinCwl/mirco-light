import { test } from "node:test"
import assert from "node:assert/strict"
import { initialJellyfinSubtitle } from "./jellyfinSubtitleSelection"

test("Jellyfin's selected index wins over any filename or codec heuristic", () => {
  const tracks = [
    { index: 0, key: "text" },
    { index: 4, key: "image" },
  ]
  assert.equal(initialJellyfinSubtitle(tracks, undefined, 4), tracks[1])
  assert.equal(initialJellyfinSubtitle(tracks, "text", 4), tracks[0])
  assert.equal(initialJellyfinSubtitle(tracks, "off", 4), undefined)
  assert.equal(initialJellyfinSubtitle(tracks, "deleted", 4), tracks[1])
  for (const index of [-1, undefined, 99])
    assert.equal(initialJellyfinSubtitle(tracks, undefined, index), undefined)
})
