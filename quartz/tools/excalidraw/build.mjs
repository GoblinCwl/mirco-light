import { build } from "esbuild"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
const directory = fileURLToPath(new URL("../../quartz/static/vendor/excalidraw/", import.meta.url))
await mkdir(directory, { recursive: true })
await mkdir(`${directory}/fonts`, { recursive: true })
let fontCount = 0
await build({
  entryPoints: [fileURLToPath(new URL("renderer.js", import.meta.url))],
  outfile: `${directory}/renderer.js`, bundle: true, format: "esm", platform: "browser",
  minify: true, target: "es2022", legalComments: "linked", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "local-lazy-fonts", setup(builder) {
    builder.onLoad({ filter: /@excalidraw\/utils\/dist\/prod\/index\.js$/ }, async args => {
      let contents = await readFile(args.path, "utf8")
      const fonts = new Map()
      contents = contents.replace(/"data:font\/woff2;base64,([A-Za-z0-9+/=]+)"/g, (_, encoded) => {
        const font = Buffer.from(encoded, "base64"), name = `${createHash("sha256").update(font).digest("hex").slice(0, 20)}.woff2`
        fonts.set(name, font)
        return `new URL("/static/vendor/excalidraw/fonts/${name}",location.origin).href`
      })
      await Promise.all([...fonts].map(([name, font]) => writeFile(`${directory}/fonts/${name}`, font)))
      fontCount = fonts.size
      return { contents, loader: "js" }
    })
  } }],
})
const hash = createHash("sha256").update(await readFile(`${directory}/renderer.js`)).digest("hex")
await writeFile(`${directory}/VERSION`, `@excalidraw/utils 0.1.8\nlz-string 1.5.0\nsha256 ${hash}\n`)
await writeFile(new URL("../../quartz/components/scripts/excalidrawRendererVersion.ts", import.meta.url), `export const excalidrawRendererUrl = "/static/vendor/excalidraw/renderer.js?v=${hash.slice(0, 12)}"\n`)
console.log(`Excalidraw renderer ${hash.slice(0, 12)}; ${fontCount} local font subsets loaded only when used`)
