export type MarkdownTokenizer = {
  url(source: string): { raw: string } | undefined
}

const proseDelimiter = /[，。！？；、：（）【】《》「」『』〔〕［］｛｝]/u

export function splitChineseAutolinks(tokenizer: MarkdownTokenizer): MarkdownTokenizer {
  const readURL = tokenizer.url.bind(tokenizer)
  tokenizer.url = (source) => {
    const token = readURL(source)
    const boundary = token?.raw.search(proseDelimiter) ?? -1
    // Return a shorter token so the lexer can process the rest as prose.
    return boundary > 0 ? readURL(source.slice(0, boundary)) : token
  }
  return tokenizer
}
