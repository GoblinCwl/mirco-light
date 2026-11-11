// This function is also serialized into the opaque preview frame. Keep it self-contained.
export function preferredSubtitle<
  T extends { name?: string; language?: string; type?: string; isDefault?: boolean },
>(choices: T[], filename: string): T | undefined {
  const languageRank = (item: T) => {
    const stem = filename.replace(/\.[^.]*$/, "").toLowerCase()
    let name = String(item.name || "").toLowerCase()
    if (name.startsWith(stem)) name = name.slice(stem.length)
    const label = `${name} ${String(item.language || "").toLowerCase()}`
    const chinese =
      /中文|汉语|漢語|简体|簡體|繁体|繁體|简中|繁中|[简簡繁][英日韩韓]|中[英日韩韓俄法德]|[英日韩韓俄法德]中|(?:^|[^a-z])(?:zh(?:[-_](?:cn|tw|hans|hant))?|zhcn|zhtw|chi|zho|chs|cht|cmn|cn|chinese|mandarin)(?=$|[^a-z])|(?:chs|cht|chi|zho)(?:eng?|jpn?|ja|kor?|ko)/i.test(
        label,
      )
    if (!chinese) return 2
    const bilingual =
      /双语|雙語|英语|英語|英文|日语|日語|日文|韩语|韓語|韩文|韓文|俄语|俄語|法语|法語|德语|德語|中[英日韩韓俄法德]|[英日韩韓俄法德]中|[简簡繁][英日韩韓]|bilingual|dual[\s_-]*(?:sub|lang)|(?:^|[^a-z])(?:en|eng|english|ja|jpn|japanese|ko|kor|korean|fr|fre|fra|french|de|ger|deu|german|ru|rus|russian)(?=$|[^a-z])|(?:chs|cht|chi|zho)(?:eng?|jpn?|ja|kor?|ko)/i.test(
        label,
      )
    return bilingual ? 0 : 1
  }
  return [...choices].sort(
    (a, b) =>
      languageRank(a) - languageRank(b) ||
      Number(a.type === "pgs") - Number(b.type === "pgs") ||
      Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)),
  )[0]
}
