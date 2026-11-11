import { QuartzTransformerPlugin } from "../types"
import { excalidrawMarkdown } from "../../util/excalidraw"
// @ts-ignore
import script from "../../components/scripts/excalidraw.inline"
import style from "../../components/styles/excalidraw.scss"

export const Excalidraw: QuartzTransformerPlugin = () => ({
  name: "Excalidraw",
  textTransform: (_ctx, source) => excalidrawMarkdown(source),
  externalResources: () => ({
    js: [{ script, loadTime: "afterDOMReady", contentType: "inline" }],
    css: [{ content: style, inline: true }],
  }),
})
