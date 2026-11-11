import test from "node:test"
import assert from "node:assert/strict"
import { torrentBase64, torrentMagnet, type TorrentInfo } from "./driveTorrent"

const encode = (value: string | Buffer | number | unknown[] | Record<string, unknown>): Buffer => {
  if (typeof value === "string") return encode(Buffer.from(value))
  if (Buffer.isBuffer(value)) return Buffer.concat([Buffer.from(`${value.length}:`), value])
  if (typeof value === "number") return Buffer.from(`i${value}e`)
  if (Array.isArray(value)) return Buffer.concat([Buffer.from("l"), ...value.map(item => encode(item as Parameters<typeof encode>[0])), Buffer.from("e")])
  return Buffer.concat([Buffer.from("d"), ...Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, item]) => [encode(key), encode(item as Parameters<typeof encode>[0])]), Buffer.from("e")])
}
const info: TorrentInfo = { name: "中文种子", info_hash: "a".repeat(40), total_size: 12, files: [], has_cas: false, piece_length: 1, piece_count: 12 }

test("magnet preserves the server info hash, Unicode name and all unique trackers", () => {
  const bytes = encode({ announce: "https://tracker.test/a", "announce-list": [["https://tracker.test/a"], ["udp://tracker.test:80/a"]], info: { name: info.name, pieces: Buffer.from([0, 101, 255, 58, 100]) } })
  const params = new URL(torrentMagnet(bytes, info)).searchParams
  assert.equal(params.get("xt"), `urn:btih:${info.info_hash}`)
  assert.equal(params.get("dn"), info.name)
  assert.deepEqual(params.getAll("tr"), ["https://tracker.test/a", "udp://tracker.test:80/a"])
})

test("rejects malformed torrent structures, truncated strings and invalid hashes", () => {
  for (const value of ["d8:announce99:abc", "d1:xi1", "li1eeextra", "l".repeat(66)]) {
    assert.throws(() => torrentMagnet(Buffer.from(value), info), /种子文件/)
  }
  assert.throws(() => torrentMagnet(encode({}), { ...info, info_hash: "invalid" }), /Info Hash/)
})

test("base64 handles binary torrent data across multiple chunks", () => {
  const bytes = Buffer.from(Array.from({ length: 25000 }, (_, i) => i % 256))
  assert.equal(torrentBase64(bytes), bytes.toString("base64"))
})
