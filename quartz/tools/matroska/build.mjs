import { build } from "esbuild"
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { patchReader } from "./patch-reader.mjs"
const output = new URL("../../quartz/static/vendor/matroska/", import.meta.url)
await mkdir(output, { recursive: true })
await build({ entryPoints: [new URL("reader.mjs", import.meta.url).pathname], outfile: new URL("reader.js", output).pathname, bundle: true, format: "iife", globalName: "QuartzMatroska", platform: "browser", target: "es2022", minify: true, legalComments: "linked", plugins: [{ name: "matroska-cluster-header", setup(builder) {
  builder.onLoad({ filter: /mkv-subtitle-extractor\/dist\/index\.js$/ }, async args => ({ contents: patchReader(await readFile(args.path, "utf8")), loader: "js" }))
} }] })
const hash = createHash("sha256").update(await readFile(new URL("reader.js", output))).digest("hex")
await copyFile(new URL("node_modules/@cryguy/mkv-subtitle-extractor/LICENSE", import.meta.url), new URL("LICENSE", output))
await writeFile(new URL("VERSION", output), `@cryguy/mkv-subtitle-extractor 1.0.1\nsha256 ${hash}\n`)
await writeFile(new URL("../../quartz/components/scripts/matroskaReaderVersion.ts", import.meta.url), `export const matroskaReaderUrl = "/static/vendor/matroska/reader.js?v=${hash.slice(0, 12)}"\n`)
console.log(`Matroska reader ${hash.slice(0, 12)}`)
