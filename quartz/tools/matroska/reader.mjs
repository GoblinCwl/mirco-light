import { RangeReader, parseSegment, parseTracks, parseCues, parseAttachments, readTargetedBlocks, assembleSubtitle, getSubtitleFormat } from "@cryguy/mkv-subtitle-extractor"

// Open metadata only. Subtitle blocks and fonts are read when their track and
// playback window are requested; opening a video never scans the whole movie.
export async function openSubtitles(url, { size, signal, request = fetch } = {}) {
  const ranges = new Map()
  let cacheBytes = 0
  const cacheLimit = 8 * 1024 * 1024
  const makeReader = operationSignal => new RangeReader(url, { allowFullDownload: false, fetch: async (input, init) => {
    const active = signal && operationSignal ? AbortSignal.any([signal, operationSignal]) : operationSignal || signal
    active?.throwIfAborted()
    const range = new Headers(init?.headers).get("Range")?.match(/^bytes=(\d+)-(\d+)$/)
    if (!range) throw new Error("无效的字幕分段请求")
    const start = Number(range[1]), end = Number(range[2]), key = `${start}:${end}`
    if (!Number.isSafeInteger(start) || start < 0 || end < start || end - start >= 32 * 1024 * 1024) throw new Error("内嵌字幕分段超出读取限制")
    if (ranges.has(key)) {
      const cached = ranges.get(key); ranges.delete(key); ranges.set(key, cached)
      return new Response(cached.body.slice(0), { status: 206, headers: cached.headers })
    }
    const response = await request(input, { ...init, credentials: "omit", signal: active })
    if (response.status !== 206) {
      await response.body?.cancel()
      throw new Error("此存储不支持字幕所需的分段读取")
    }
    const length = Number(response.headers.get("Content-Length"))
    if (length > end - start + 1) { await response.body?.cancel(); throw new Error("无效的字幕分段响应") }
    const headers = new Headers(response.headers)
    // OpenList gives the page the file size, even when CORS hides Content-Range.
    if (!headers.has("Content-Range") && Number.isSafeInteger(size) && size > start) headers.set("Content-Range", `bytes ${start}-${Math.min(end, size - 1)}/${size}`)
    if (!headers.has("Content-Range")) { await response.body?.cancel(); throw new Error("无法读取视频大小") }
    const body = await response.arrayBuffer()
    active?.throwIfAborted()
    if (body.byteLength > end - start + 1) throw new Error("无效的字幕分段响应")
    if (body.byteLength <= cacheLimit) {
      while (cacheBytes + body.byteLength > cacheLimit && ranges.size) {
        const oldest = ranges.keys().next().value; cacheBytes -= ranges.get(oldest).body.byteLength; ranges.delete(oldest)
      }
      ranges.set(key, { body, headers }); cacheBytes += body.byteLength
    }
    return new Response(body.slice(0), { status: 206, headers })
  } })
  const metadata = makeReader()
  await metadata.init()
  const segment = await parseSegment(metadata)
  const entry = id => segment.seekEntries.find(item => item.id === id)
  const tracksEntry = entry(0x1654ae6b)
  if (!tracksEntry) throw new Error("此 MKV 没有可读取的轨道信息")
  const tracks = await parseTracks(metadata, segment.segmentDataOffset, tracksEntry.position)
  const publicTracks = tracks.map(track => ({
    type: getSubtitleFormat(track.codecId),
    metadata: { trackNumber: track.trackNumber, trackName: track.trackName, language: track.language, isDefault: track.isDefault },
  }))
  let indexPromise, fontsPromise
  const index = () => indexPromise ||= (async () => {
    const cuesEntry = entry(0x1c53bb6b)
    if (!cuesEntry) throw new Error("此 MKV 缺少字幕定位索引，无法按播放位置读取")
    return parseCues(metadata, segment.segmentDataOffset, cuesEntry.position)
  })().catch(error => { indexPromise = undefined; throw error })
  const fonts = track => ["S_TEXT/ASS", "S_TEXT/SSA"].includes(track.codecId) && entry(0x1941a469)
    ? fontsPromise ||= parseAttachments(metadata, segment.segmentDataOffset, entry(0x1941a469).position)
      .catch(error => { fontsPromise = undefined; throw error })
    : Promise.resolve([])
  const cueCache = new Set(), blocksByTrack = new Map()
  return {
    tracks: publicTracks,
    async readWindow(trackNumber, seconds, operationSignal) {
      signal?.throwIfAborted(); operationSignal?.throwIfAborted()
      const track = tracks.find(item => item.trackNumber === trackNumber)
      if (!track || !Number.isFinite(seconds)) throw new Error("无效的字幕轨道或时间")
      const allCues = await index()
      signal?.throwIfAborted(); operationSignal?.throwIfAborted()
      const multiplier = segment.info.timestampScale / 1e6
      const from = Math.max(0, seconds - 15), until = seconds + 75
      const ownCues = allCues.filter(cue => cue.track === trackNumber).sort((a, b) => a.time - b.time)
      const source = ownCues.length ? ownCues : allCues
      const selected = source.filter(cue => {
        const time = cue.time * multiplier / 1000
        return time <= until && (time >= from || cue.duration !== undefined && time + cue.duration * multiplier / 1000 >= from)
      })
      // Include the preceding cue for files without CueDuration, and the next
      // cue during dialogue-free gaps. Neither requires scanning earlier media.
      const previous = source.filter(cue => cue.time * multiplier / 1000 < from).at(-1)
      const next = source.find(cue => cue.time * multiplier / 1000 > until)
      const emptyWindow = selected.length === 0
      if (previous && !selected.includes(previous)) selected.push(previous)
      if (next && emptyWindow) selected.push(next)
      const targets = ownCues.length ? selected : [...new Map(selected.map(cue => [cue.clusterPosition, { ...cue, relativePosition: undefined }])).values()]
      const cueKey = cue => `${trackNumber}:${cue.clusterPosition}:${cue.relativePosition}:${cue.time}`
      const missing = targets.filter(cue => !cueCache.has(cueKey(cue)))
      const blocks = blocksByTrack.get(trackNumber) || new Map()
      if (missing.length) {
        const reader = makeReader(operationSignal)
        await reader.init() // Header bytes normally come from the session cache.
        const received = await readTargetedBlocks(reader, segment.segmentDataOffset, missing, new Set([trackNumber]), segment.info.timestampScale, 3)
        signal?.throwIfAborted(); operationSignal?.throwIfAborted()
        for (const block of received) {
          if (block.durationMs === undefined && track.defaultDuration) block.durationMs = track.defaultDuration / 1e6
          blocks.set(`${block.timestampMs}:${new TextDecoder().decode(block.data)}`, block)
        }
        for (const cue of missing) cueCache.add(cueKey(cue))
        blocksByTrack.set(trackNumber, blocks)
      }
      const trackFonts = await fonts(track)
      signal?.throwIfAborted(); operationSignal?.throwIfAborted()
      return {
        content: new TextDecoder().decode(assembleSubtitle(track, [...blocks.values()].sort((a, b) => a.timestampMs - b.timestampMs))),
        fonts: trackFonts, from, until, version: blocks.size,
      }
    },
  }
}
