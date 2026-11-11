export type TorrentInfo = {
  name: string; total_size: number; info_hash: string; files: { path: string; size: number }[]
  piece_length: number; piece_count: number; has_cas: boolean
  cas?: { file_md5: string; slice_md5: string; cloud: string }
}

export function torrentBase64(bytes: Uint8Array): string {
  let text = ""
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(text)
}

// Read tracker metadata without re-encoding the info dictionary or changing its hash.
export function torrentMagnet(bytes: Uint8Array, info: TorrentInfo): string {
  if (!/^[a-f\d]{40}$/i.test(info.info_hash)) throw new Error("种子的 Info Hash 无效")
  let cursor = 0, nodes = 0
  const decoder = new TextDecoder(), trackers = new Set<string>()
  const string = () => {
    const start = cursor
    while (bytes[cursor] >= 48 && bytes[cursor] <= 57) cursor++
    if (cursor === start || bytes[cursor++] !== 58) throw new Error("种子文件格式错误")
    const length = Number(decoder.decode(bytes.subarray(start, cursor - 1)))
    if (!Number.isSafeInteger(length) || length < 0 || cursor + length > bytes.length) throw new Error("种子文件不完整")
    const value = bytes.subarray(cursor, cursor + length); cursor += length; return value
  }
  const read = (depth: number, tracker = false): void => {
    if (depth > 64 || ++nodes > 100000 || cursor >= bytes.length) throw new Error("种子文件结构异常")
    const token = bytes[cursor]
    if (token >= 48 && token <= 57) {
      const value = string()
      if (tracker) { const url = decoder.decode(value); if (/^(https?|udp|wss?):\/\//i.test(url)) trackers.add(url) }
    } else if (token === 105) {
      const start = ++cursor
      while (cursor < bytes.length && bytes[cursor] !== 101) cursor++
      if (cursor >= bytes.length || !/^-?\d+$/.test(decoder.decode(bytes.subarray(start, cursor)))) throw new Error("种子文件格式错误")
      cursor++
    } else if (token === 100 || token === 108) {
      cursor++
      while (cursor < bytes.length && bytes[cursor] !== 101) {
        const key = token === 100 ? decoder.decode(string()) : ""
        read(depth + 1, token === 100 ? depth === 0 && (key === "announce" || key === "announce-list") : tracker)
      }
      if (bytes[cursor++] !== 101) throw new Error("种子文件不完整")
    } else throw new Error("种子文件格式错误")
  }
  read(0)
  if (cursor !== bytes.length) throw new Error("种子文件格式错误")
  const params = new URLSearchParams({ xt: `urn:btih:${info.info_hash}`, dn: info.name })
  for (const tracker of trackers) params.append("tr", tracker)
  return `magnet:?${params}`
}
