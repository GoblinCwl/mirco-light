import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { readdir, readFile } from "node:fs/promises"
import { QuartzEmitterPlugin } from "../types"
import { FullSlug } from "../../util/path"
import { write } from "./helpers"

// Use the exact installed renderer version for its stylesheet, fonts and copy helper.
export const KatexResources: QuartzEmitterPlugin = () => ({
  name: "KatexResources",
  async *emit(ctx) {
    const require = createRequire(import.meta.url)
    const dist = join(dirname(require.resolve("katex/package.json")), "dist")
    const files = [
      ["katex.min.css", "katex.min.css"],
      ["contrib/copy-tex.min.js", "copy-tex.min.js"],
      ["../LICENSE", "LICENSE"],
      ...((await readdir(join(dist, "fonts"))).map((name) => [`fonts/${name}`, `fonts/${name}`])),
    ]
    for (const [source, target] of files) {
      yield write({ ctx, slug: `static/katex/${target}` as FullSlug, ext: "", content: await readFile(join(dist, source)) })
    }
  },
  async *partialEmit() {},
})
