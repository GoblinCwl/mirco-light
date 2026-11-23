import type { Root } from "hast"
import { htmlToJsx } from "../../util/jsx"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import style from "../styles/aiSummary.scss"
// @ts-expect-error Quartz bundles .inline.ts files as script text.
import summaryScript from "../scripts/aiSummary.inline"

const summarySegmenter = new Intl.Segmenter("zh", { granularity: "word" })
const summaryGraphemes = new Intl.Segmenter("zh", { granularity: "grapheme" })
const summaryPace = [24, 38, 48, 30, 54, 34, 42, 28]

function summaryChunks(summary: string) {
  const tokens = Array.from(summarySegmenter.segment(summary)).flatMap(({ segment }) =>
    /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(segment)
      ? Array.from(summaryGraphemes.segment(segment), ({ segment }) => segment)
      : [segment],
  )
  const tokensPerChunk = Math.max(1, Math.ceil(tokens.length / 120))
  const chunks: { text: string; delay: number }[] = []
  let delay = 140
  for (let i = 0; i < tokens.length; i += tokensPerChunk) {
    const text = tokens.slice(i, i + tokensPerChunk).join("")
    const pause = text.includes("\n") ? 180 : /[。！？.!?；;…]/u.test(text) ? 105 : 0
    const gap = summaryPace[chunks.length % summaryPace.length]
    chunks.push({ text, delay })
    delay += text.trim() ? gap + pause : pause
  }
  const speed = Math.max(1, (chunks.at(-1)?.delay ?? 0) / 4800)
  return chunks.map((chunk) => ({ text: chunk.text, delay: Math.round(chunk.delay / speed) }))
}

const Content: QuartzComponent = ({ fileData, tree }: QuartzComponentProps) => {
  const classes: string[] = fileData.frontmatter?.cssclasses ?? []
  const classString = ["popover-hint", ...classes].join(" ")
  const isHome = fileData.slug === "index"
  const summary = isHome ? undefined : fileData.frontmatter?.ai_summary
  let warning: ReturnType<typeof htmlToJsx>
  let body: typeof tree | Root = tree
  if (summary && fileData.frontmatter?.deprecated && tree.type === "root") {
    const root = tree as Root
    const firstElementIndex = root.children.findIndex((node) => node.type === "element")
    const first = root.children[firstElementIndex]
    if (
      first?.type === "element" &&
      (first.properties.dataCallout ?? first.properties["data-callout"]) === "warning"
    ) {
      const split = firstElementIndex + 1
      const warningTree: Root = { ...root, children: root.children.slice(0, split) }
      warning = htmlToJsx(fileData.filePath!, warningTree)
      body = { ...root, children: root.children.slice(split) }
    }
  }
  return (
    <article class={classString} data-home-layout-pending={isHome ? "" : undefined}>
      {warning}
      {summary && (
        <aside class="article-ai-summary" aria-labelledby="article-ai-summary-title">
          <div class="article-ai-summary__title" id="article-ai-summary-title">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M10 2c1 5.3 2.7 7 8 8-5.3 1-7 2.7-8 8-1-5.3-2.7-7-8-8 5.3-1 7-2.7 8-8Zm8 12c.5 2.6 1.4 3.5 4 4-2.6.5-3.5 1.4-4 4-.5-2.6-1.4-3.5-4-4 2.6-.5 3.5-1.4 4-4Z" />
            </svg>
            AI 摘要
          </div>
          <p>
            {summaryChunks(summary).map(({ text, delay }, index) => (
              <span key={index} style={{ animationDelay: `${delay}ms` }}>{text}</span>
            ))}
          </p>
        </aside>
      )}
      {htmlToJsx(fileData.filePath!, body)}
    </article>
  )
}

Content.css = style
Content.afterDOMLoaded = summaryScript

export default (() => Content) satisfies QuartzComponentConstructor
