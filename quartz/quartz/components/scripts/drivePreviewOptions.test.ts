import { test } from "node:test"
import assert from "node:assert/strict"
import { initialVideoQuality, nativePdfUrl, previewChoices, previewScheme } from "./drivePreviewOptions"
const file = (name: string, type = 0, size = 100) => ({ name, type, size, is_dir: false, modified: "" })
const config = { iframe_previews: JSON.stringify({ "doc,docx,xls,xlsx,ppt,pptx": { Microsoft: "https://view.officeapps.live.com/op/view.aspx?src=$e_url", Google: "https://docs.google.com/gview?url=$e_url&embedded=true" }, pdf: { "PDF.js": "https://res.oplist.org/pdf.js/web/viewer.html?file=$e_url" }, epub: { "EPUB.js": "https://res.oplist.org/epub.js/viewer.html?url=$e_url" } }) }
test("OpenList built-in and configured renderers retain their order and Download fallback", () => {
  assert.deepEqual(previewChoices(file("a.docx"), config, false, false).map(x => x.key), ["jit", "doc", "iframe-Microsoft", "download"])
  assert.deepEqual(previewChoices(file("a.pdf"), config, false, false).map(x => x.key), ["jit", "pdf_native", "pdf", "iframe-PDF.js", "download"])
  assert.deepEqual(previewChoices(file("a.epub"), config, false, false).map(x => x.key), ["iframe-EPUB.js", "download"])
  assert.deepEqual(previewChoices({ ...file("a.mkv", 2), provider: "AliyundriveOpen" }, config, false, false).map(x => x.key), ["aliyun_video", "video", "video360", "download"])
  assert.deepEqual(previewChoices(file("a.html", 4), config, false, false).map(x => x.key), ["html", "markdown", "markdown_with_word_wrap", "text_editor", "download"])
})
test("JitViewer leads supported office formats while text/media retain their existing defaults", () => {
  for (const ext of ["docx", "xlsx", "pptx", "csv", "tsv", "ofd", "pdf"]) {
    assert.equal(previewChoices(file(`sample.${ext}`), {}, false, false)[0].key, "jit")
    assert.equal(previewChoices(file(`sample.${ext}`), {}, true, false)[0].key, "jit")
    assert.equal(previewChoices(file(`sample.${ext}`), { share_preview: "false" }, true, false).some(item => item.key === "jit"), false)
  }
  for (const ext of ["doc", "xls", "ppt"]) assert.equal(previewChoices(file(`sample.${ext}`), {}, false, false).some(item => item.key === "jit"), false)
  for (const [name, type, expected] of [["a.txt", 4, "markdown"], ["a.md", 4, "markdown"], ["a.jpg", 5, "image"], ["a.mp4", 2, "video"], ["a.mp3", 3, "audio"]] as const) {
    assert.equal(previewChoices(file(name, type), {}, false, false)[0].key, expected)
  }
  assert.equal(previewChoices(file("large.csv", 4, 2 * 1024 * 1024), { preview_download_by_default: "true" }, false, false)[0].key, "jit")
})
test("native PDF URLs retain signed/share/archive access and avoid forced downloads", () => {
  const normal = new URL(nativePdfUrl("https://drive.goblincwl.site/d/Vault/a.pdf?sign=A%2BB&download=true"))
  assert.equal(normal.pathname, "/p/Vault/a.pdf")
  assert.equal(normal.searchParams.get("sign"), "A+B")
  assert.equal(normal.searchParams.has("download"), false)
  for (const path of ["/sd/id/a.pdf", "/sad/id/a.zip", "/ae/Vault/a.zip"]) {
    const url = new URL(nativePdfUrl(`https://drive.goblincwl.site${path}?pwd=a%26b&inner=%2F中文.pdf&pass=test`))
    assert.equal(url.pathname, path)
    assert.equal(url.searchParams.get("pwd"), "a&b")
    assert.equal(url.searchParams.get("inner"), "/中文.pdf")
    assert.equal(url.searchParams.get("pass"), "test")
    assert.equal(url.searchParams.get("quartz_pdf"), "1")
  }
  assert.equal(previewChoices(file("a.pdf"), {}, true, false)[0].key, "jit")
  assert.deepEqual(previewChoices(file("a.pdf"), { share_preview: "false" }, true, false).map(x => x.key), ["download"])
})
test("archive permissions, share flags and default-download settings are respected", () => {
  assert.equal(previewChoices(file("a.zip"), {}, false, false).some(x => x.key === "archive"), false)
  assert.equal(previewChoices(file("a.zip"), {}, false, true)[0].key, "archive")
  assert.equal(previewChoices(file("a.zip"), {}, true, true).at(-1)!.key, "archive")
  assert.equal(previewChoices(file("a.png", 5), { preview_download_by_default: "true" }, false, false)[0].key, "download")
  assert.equal(previewChoices(file("a.md", 4, 1024 * 1024), {}, false, false)[0].key, "download")
  assert.deepEqual(previewChoices(file("a.png", 5), { share_preview: "false" }, true, false).map(x => x.key), ["download"])
})
test("preview template expands all placeholders without losing share codes or signed URLs", () => {
  const direct = "https://drive.goblincwl.site/sd/id/中文.pdf?pwd=a%26b", raw = "https://files.example/a.pdf?sign=A%2BB"
  const result = new URL(previewScheme("https://preview.example/?src=$e_url&direct=$e_durl&name=$name", { ...file("中文.pdf"), raw_url: raw }, direct))
  assert.equal(result.searchParams.get("src"), raw)
  assert.equal(result.searchParams.get("direct"), direct)
  assert.equal(result.searchParams.get("name"), "中文.pdf")
  assert.throws(() => previewScheme("javascript:alert(1)", file("a"), direct), /预览地址/)
})

test("initial quality uses the lowest available resolution and honors saved selections",()=>{
 const qualities=[{id:'auto'},{id:'original'},{id:'1080'},{id:'720'},{id:'480'}]
 assert.equal(initialVideoQuality(qualities,'lowest')?.id,'480')
 assert.equal(initialVideoQuality(qualities,'720')?.id,'720')
 assert.equal(initialVideoQuality(qualities,'auto')?.id,'auto')
 assert.equal(initialVideoQuality(qualities,'original')?.id,'original')
 assert.equal(initialVideoQuality(qualities,'360')?.id,'480')
 assert.equal(initialVideoQuality([{id:'auto'}],'lowest')?.id,'auto')
 assert.equal(initialVideoQuality([],'lowest'),undefined)
})
