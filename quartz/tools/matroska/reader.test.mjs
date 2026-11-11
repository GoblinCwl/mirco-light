import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
const source = await readFile(new URL("../../quartz/static/vendor/matroska/reader.js", import.meta.url), "utf8")
const { openSubtitles } = new Function(source + "\nreturn QuartzMatroska;")()
const readSubtitles = async (url, options) => {
  const session = await openSubtitles(url, options)
  return Promise.all(session.tracks.map(async track => {
    const window = await session.readWindow(track.metadata.trackNumber, 0)
    return { ...track, output: { subtitle: new TextEncoder().encode(window.content), fonts: window.fonts } }
  }))
}
const id = value => Buffer.from(value.toString(16).padStart(Math.ceil(value.toString(16).length / 2) * 2, "0"), "hex")
const uint = (value, width = 4) => { const bytes = Buffer.alloc(width); bytes.writeUIntBE(value, 0, width); return bytes }
const element = (tag, data, width = 0) => {
  if (!width) { width = 1; while (data.length >= 2 ** (7 * width) - 1) ++width }
  const size = uint(data.length, width); size[0] |= 1 << (8 - width)
  return Buffer.concat([id(tag), size, data])
}
const children = (tag, ...entries) => element(tag, Buffer.concat(entries))
const number = (tag, value) => element(tag, uint(value))
const text = (tag, value) => element(tag, Buffer.from(value))
function fixture(codec = "S_TEXT/ASS", defaultTrack = 1, secondTime = 3000, padding = 0) {
  const header = children(0x1a45dfa3, text(0x4282, "matroska"))
  const info = children(0x1549a966, number(0x2ad7b1, 1000000))
  const tracks = children(0x1654ae6b, children(0xae, number(0xd7, 1), number(0x83, 17), number(0x88, defaultTrack), text(0x86, codec), text(0x22b59c, "zho"), text(0x536e, "中文字幕"), text(0x63a2, "[Script Info]\nScriptType: v4.00+\n[V4+ Styles]\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")))
  const cluster = (time, line, width) => {
    const timestamp = number(0xe7, time)
    const payload = codec === "S_TEXT/ASS" ? `0,0,Default,,0,0,0,,${line}` : line
    const block = element(0xa1, Buffer.concat([Buffer.from([0x81, 0, 0, 0]), Buffer.from(payload)]))
    const group = children(0xa0, block, number(0x9b, 1000))
    return { data: element(0x1f43b675, Buffer.concat([timestamp, group]), width), relative: timestamp.length }
  }
  // Legal, different VINT widths: this used to silently lose the second cue.
  const one = cluster(1000, "第一句", 2), two = cluster(secondTime, "第二句", 1)
  const seek = (tracksPosition, cuesPosition, clusterPosition) => children(0x114d9b74, ...[[0x1654ae6b, tracksPosition], [0x1c53bb6b, cuesPosition], [0x1f43b675, clusterPosition]].map(([tag, position]) => children(0x4dbb, element(0x53ab, id(tag)), number(0x53ac, position))))
  const gap = padding ? element(0xec, Buffer.alloc(padding)) : Buffer.alloc(0)
  const seekSize = seek(0, 0, 0).length, tracksPosition = seekSize + info.length, firstPosition = tracksPosition + tracks.length, secondPosition = firstPosition + one.data.length, cuesPosition = secondPosition + two.data.length + gap.length
  const cue = (time, position, relative) => children(0xbb, number(0xb3, time), children(0xb7, number(0xf7, 1), number(0xf1, position), number(0xf0, relative)))
  const cues = children(0x1c53bb6b, cue(1000, firstPosition, one.relative), cue(secondTime, secondPosition, two.relative))
  return Buffer.concat([header, children(0x18538067, seek(tracksPosition, cuesPosition, firstPosition), info, tracks, one.data, two.data, gap, cues)])
}
function ranges(data) {
  return async (_url, init) => {
    const [start, end] = new Headers(init.headers).get("Range").slice(6).split("-").map(Number)
    const body = data.subarray(start, Math.min(end + 1, data.length))
    // As in OpenList CORS responses, Content-Range is hidden from this caller.
    return new Response(body, { status: 206, headers: { "Content-Length": String(body.length) } })
  }
}
test("ASS keeps both cues when Cluster headers have different VINT widths", async () => {
  const data = fixture(), tracks = await readSubtitles("https://media.invalid/test.mkv", { size: data.length, request: ranges(data) })
  assert.equal(tracks.length, 1)
  assert.equal(tracks[0].metadata.trackName, "中文字幕")
  assert.equal(tracks[0].metadata.isDefault, true)
  assert.deepEqual(new TextDecoder().decode(tracks[0].output.subtitle).match(/^Dialogue:.*$/gm), ["Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,第一句", "Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,第二句"])
})
test("SRT is readable and preserves a non-default track flag", async () => {
  const data = fixture("S_TEXT/UTF8", 0), [track] = await readSubtitles("https://media.invalid/test.mkv", { size: data.length, request: ranges(data) })
  assert.equal(track.type, "srt"); assert.equal(track.metadata.isDefault, false)
  assert.match(new TextDecoder().decode(track.output.subtitle), /00:00:03,000 --> 00:00:04,000\n第二句/)
})
test("image subtitles are omitted rather than decoded as garbage text", async () => {
  const data = fixture("S_HDMV/PGS")
  assert.deepEqual(await readSubtitles("https://media.invalid/test.mkv", { size: data.length, request: ranges(data) }), [])
})
test("a server ignoring Range is cancelled without a full-file download", async () => {
  let cancelled = false
  await assert.rejects(readSubtitles("https://media.invalid/test.mkv", { size: 2e9, request: async () => new Response(new ReadableStream({ cancel() { cancelled = true } })) }), /分段读取/)
  assert.equal(cancelled, true)
})
test("navigation cancellation stops probing before any file request", async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(readSubtitles("https://media.invalid/test.mkv", { signal: controller.signal, request: () => assert.fail("must not fetch") }), { name: "AbortError" })
})
test("metadata opens first; a distant subtitle is only loaded after seeking", async () => {
  const data = fixture("S_TEXT/ASS", 1, 600000)
  const session = await openSubtitles("https://media.invalid/test.mkv", { size: data.length, request: ranges(data) })
  assert.equal(session.tracks.length, 1)
  const beginning = await session.readWindow(1, 0)
  assert.match(beginning.content, /第一句/)
  assert.doesNotMatch(beginning.content, /第二句/)
  const later = await session.readWindow(1, 600)
  assert.match(later.content, /0:10:00.00,0:10:01.00.*第二句/)
  assert.equal((await session.readWindow(1, 600)).version, later.version)
})
test("a cancelled seek can be followed by a fresh successful window read", async () => {
  const data = fixture(), session = await openSubtitles("https://media.invalid/test.mkv", { size: data.length, request: ranges(data) })
  const controller = new AbortController()
  const abandoned = session.readWindow(1, 0, controller.signal)
  controller.abort()
  await assert.rejects(abandoned, { name: "AbortError" })
  assert.match((await session.readWindow(1, 3)).content, /第二句/)
})
test("a transient index request failure does not poison subsequent window reads", async () => {
  const data = fixture("S_TEXT/ASS", 1, 3000, 300000), serve = ranges(data)
  let failed = false
  const session = await openSubtitles("https://media.invalid/test.mkv", { size: data.length, request: async (url, init) => {
    const start = Number(new Headers(init.headers).get("Range").slice(6).split("-")[0])
    if (start > 262144 && !failed) { failed = true; throw new Error("temporary network failure") }
    return serve(url, init)
  } })
  await assert.rejects(session.readWindow(1, 0), /temporary network failure/)
  assert.match((await session.readWindow(1, 0)).content, /第一句/)
})
