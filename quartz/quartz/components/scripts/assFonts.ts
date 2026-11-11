export function embeddedASSFont(content: string): Uint8Array | undefined {
  // Check fonts used by actual dialogue, not dormant style definitions.
  const normalize = (name: string) =>
    name.trim().replace(/^@/, "").replace(/\s+/g, " ").toLowerCase()
  const attachments: { name: string; encoded: string }[] = []
  const required = new Set<string>(),
    activeStyles = new Set<string>()
  const styles = new Map<string, string>()
  let section = "",
    fontColumn = 1,
    styleColumn = 0,
    eventStyle = 3,
    eventText = 9
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    // Encoded font data can itself start with '['; only known section
    // headers terminate the Fonts section.
    const header = line.match(
      /^\[(Script Info|Aegisub Project Garbage|V4\+? Styles|Fonts|Graphics|Events)\]$/i,
    )
    if (header) {
      section = header[1].toLowerCase()
      continue
    }
    if (section === "fonts") {
      const name = line.match(/^fontname:\s*(.+)$/i)
      if (name)
        attachments.push({
          name: normalize(name[1].replace(/\.(?:ttf|otf)$/i, "").replace(/_[bi]*\d+$/i, "")),
          encoded: "",
        })
      else if (line && attachments.length) attachments[attachments.length - 1].encoded += line
    } else if (/^v4\+? styles$/.test(section)) {
      if (/^format:/i.test(line)) {
        const columns = line
          .slice(line.indexOf(":") + 1)
          .split(",")
          .map((value) => value.trim().toLowerCase())
        fontColumn = columns.indexOf("fontname")
        styleColumn = columns.indexOf("name")
      } else if (/^style:/i.test(line) && fontColumn >= 0) {
        const fields = line.slice(line.indexOf(":") + 1).split(","),
          font = fields[fontColumn],
          name = fields[styleColumn]
        if (font?.trim() && name?.trim()) styles.set(normalize(name), normalize(font))
      }
    } else if (section === "events") {
      if (/^format:/i.test(line)) {
        const columns = line
          .slice(line.indexOf(":") + 1)
          .split(",")
          .map((value) => value.trim().toLowerCase())
        eventStyle = columns.indexOf("style")
        eventText = columns.indexOf("text")
      } else if (/^dialogue:/i.test(line)) {
        const fields = line.slice(line.indexOf(":") + 1).split(",")
        if (eventStyle < 0 || eventText < 0) return
        activeStyles.add(normalize(fields[eventStyle] || "Default"))
        for (const block of fields
          .slice(eventText)
          .join(",")
          .matchAll(/\{([^}]*)\}/g)) {
          for (const match of block[1].matchAll(/\\fn([^\\}]+)/g))
            if (match[1].trim()) required.add(normalize(match[1]))
          for (const match of block[1].matchAll(/\\r([^\\}]*)/g))
            if (match[1].trim()) activeStyles.add(normalize(match[1]))
        }
      }
    }
  }
  for (const style of activeStyles) {
    const font = styles.get(style) || styles.get("default")
    if (!font) return
    required.add(font)
  }
  if (!required.size || !attachments.length) return
  const fonts = new Map<string, Uint8Array>()
  for (const attachment of attachments) {
    const encoded = attachment.encoded
    if (encoded.length < 16 || encoded.length % 4 === 1 || /[^!-`]/.test(encoded)) return
    const data = new Uint8Array(Math.floor((encoded.length * 6) / 8))
    let bits = 0,
      value = 0,
      offset = 0
    for (let i = 0; i < encoded.length; i++) {
      value = (value << 6) | (encoded.charCodeAt(i) - 33)
      bits += 6
      if (bits >= 8) {
        bits -= 8
        data[offset++] = (value >> bits) & 255
      }
    }
    const signature = String.fromCharCode(...data.subarray(0, 4))
    if (
      !(data[0] === 0 && data[1] === 1 && data[2] === 0 && data[3] === 0) &&
      !["OTTO", "ttcf", "true"].includes(signature)
    )
      return
    fonts.set(attachment.name, data)
  }
  if ([...required].some((name) => !fonts.has(name))) return
  return fonts.get(required.values().next().value!)
}
