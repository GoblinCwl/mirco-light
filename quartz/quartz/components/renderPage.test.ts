import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { subtle } from "node:crypto"
import { build } from "esbuild"

// Exercise the real renderer with browser scripts/styles treated as resources,
// as they are during a Quartz build. No browser or personal notes are needed.
test("encrypted artifacts reach the emitter with and without hidden navigation files", async () => {
  const cache = path.join(process.cwd(), ".quartz-cache")
  await mkdir(cache, { recursive: true })
  const directory = await mkdtemp(path.join(cache, "render-regression-"))
  try {
    const outfile = path.join(directory, "fixture.mjs")
    await build({
      stdin: {
        resolveDir: path.join(process.cwd(), "quartz/components"), loader: "tsx",
        contents: `
          import {renderPage} from './renderPage'
          import TagList from './TagList'
          import {render} from 'preact-render-to-string'
          export async function probe(filtered) {
            const cfg = {locale:'zh-CN',unlistedPatterns:filtered?['Hidden/**']:[],passProtected:{enabled:true,iteration:10}}
            const note = {slug:'Protected',relativePath:'Protected.md',filePath:'Protected.md',frontmatter:{title:'Protected',passphrase:'fixture-password',tags:['topic']}}
            const hidden = {slug:'Hidden/note',relativePath:'Hidden/note.md',filePath:'Hidden/note.md',frontmatter:{title:'Hidden'}}
            const resources = {css:[],js:[],additionalHead:[]}
            const props = {cfg,ctx:{},fileData:note,allFiles:[note,hidden],tree:{type:'root',children:[]},children:[],externalResources:resources}
            const blank = () => null
            const head = ({allFiles}) => <head data-public-count={allFiles.length}/>
            const body = () => <article>Protected fixture body</article>
            const html = await renderPage(cfg,'Protected',props,{head,header:[],beforeBody:[],pageBody:body,afterBody:[],left:[],right:[],footer:blank},resources)
            return {html,payload:props.encryptedPayload,slug:props.encryptedPayloadSlug,tags:render(TagList()(props)),sourceCount:props.allFiles.length}
          }
        `,
      },
      outfile, bundle: true, platform: "node", format: "esm", packages: "external",
      jsx: "automatic", jsxImportSource: "preact",
      plugins: [{ name: "quartz-resources", setup(build) {
        build.onLoad({ filter: /(?:\.inline\.ts|\.scss)$/ }, async args => ({ contents: await readFile(args.path, "utf8"), loader: "text" }))
      } }],
    })
    const { probe } = await import(pathToFileURL(outfile).href)
    for (const filtered of [false, true]) {
      const result = await probe(filtered)
      assert.equal(typeof result.payload, "string")
      assert.match(result.slug, /^Protected\.[a-f0-9]{16}\.encrypted$/)
      assert.ok(result.html.includes(`${result.slug}.json`))
      assert.ok(result.html.includes(`data-public-count="${filtered ? 1 : 2}"`))
      assert.equal(result.sourceCount, 2)
      assert.ok(!result.html.includes("Protected fixture body"))
      assert.match(result.tags, /data-no-popover="true"/)
      const payload = JSON.parse(result.payload)
      const data = Buffer.from(payload.content, "base64")
      const base = await subtle.importKey("raw", Buffer.from("fixture-password"), "PBKDF2", false, ["deriveKey"])
      const key = await subtle.deriveKey({ name: "PBKDF2", salt: data.subarray(0, 32), iterations: payload.iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"])
      const plain = await subtle.decrypt({ name: "AES-GCM", iv: data.subarray(32, 48) }, key, data.subarray(48))
      assert.match(new TextDecoder().decode(plain), /Protected fixture body/)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
