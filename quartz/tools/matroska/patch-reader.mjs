// Fix pinned upstream 1.0.1's assumption that all Cluster size VINTs have the
// same width. A small Cluster in the GX episode uses six header bytes instead
// of seven; reusing the first Cluster's width silently loses that subtitle.
export function patchReader(source) {
  const replace = (before, after) => {
    if (!source.includes(before)) throw new Error("Matroska reader patch no longer matches")
    source = source.replace(before, after)
  }
  replace(`  async read(offset, length) {`, `  async read(offset, length, readAhead = true) {`)
  replace(`const readAheadLength = Math.max(length, _RangeReader.READ_AHEAD_SIZE);`, `const readAheadLength = readAhead ? Math.max(length, _RangeReader.READ_AHEAD_SIZE) : length;`)
  replace(`  const firstClusterPos = cueEntries[0].clusterPosition;
  const probeBuf = await reader.read(segmentDataOffset + firstClusterPos, HEADER_READ_SIZE);
  const clusterHeaderSize = parseElementHeader(probeBuf, 0).dataOffset;`, `  const clusterWidths = new Map();
  await mapConcurrent([...clusterGroups.keys()], workers, async clusterPos => {
    const probeBuf = await reader.read(segmentDataOffset + clusterPos, HEADER_READ_SIZE, false);
    clusterWidths.set(clusterPos, parseElementHeader(probeBuf, 0).dataOffset);
  });`)
  replace(`    if (entries.every((e) => e.relativePosition !== void 0)) {`, `    if (entries.every((e) => e.relativePosition !== void 0)) {
      const clusterHeaderSize = clusterWidths.get(clusterPos);`)
  replace(`    let codecId = "";`, `    let codecId = "";
    let isDefault = true;`)
  replace(`        case CODEC_ID:`, `        case 0x88:
          isDefault = readUint(tracksData, child.dataOffset, child.dataSize) !== 0;
          break;
        case CODEC_ID:`)
  replace(`    if (trackType === SUBTITLE_TRACK_TYPE) {`, `    if (trackType === SUBTITLE_TRACK_TYPE && ["S_TEXT/UTF8", "S_TEXT/ASS", "S_TEXT/SSA", "S_TEXT/WEBVTT"].includes(codecId)) {`)
  replace(`        codecId,
        codecPrivate,`, `        codecId,
        isDefault,
        codecPrivate,`)
  replace(`        trackNumber: track.trackNumber,
        language:`, `        trackNumber: track.trackNumber,
        isDefault: track.isDefault,
        language:`)
  replace(`      let relativePosition;`, `      let relativePosition;
      let duration;`)
  replace(`          case CUE_RELATIVE_POSITION:`, `          case 0xb2:
            duration = readUint(cuesData, posChild.dataOffset, posChild.dataSize);
            break;
          case CUE_RELATIVE_POSITION:`)
  replace(`entries.push({ time: cueTime, track, clusterPosition, relativePosition });`, `entries.push({ time: cueTime, track, clusterPosition, relativePosition, duration });`)
  return source + "\nexport { RangeReader, parseSegment, parseTracks, parseCues, parseAttachments, readTargetedBlocks, assembleSubtitle, getSubtitleFormat };\n"
}
