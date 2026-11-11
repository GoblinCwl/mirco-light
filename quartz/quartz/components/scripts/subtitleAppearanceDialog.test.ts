import { test } from "node:test"
import assert from "node:assert/strict"
import { openSubtitleAppearanceDialog } from "./subtitleAppearanceDialog"
import { defaultSubtitleAppearance, type SubtitleAppearance } from "./subtitleAppearance"

class DialogNode extends EventTarget {
  children: DialogNode[] = []
  style = {}
  className = ""
  textContent = ""
  value = ""
  parent?: DialogNode
  open = false
  focused=false
  append(...nodes: DialogNode[]) {
    for (const node of nodes) {
      node.parent = this
      this.children.push(node)
    }
  }
  setAttribute() {}
  hasAttribute() {
    return false
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this)
  }
  focus() {this.focused=true}
  showModal() {
    this.open = true
  }
  close() {
    if (this.open) {
      this.open = false
      this.dispatchEvent(new Event("close"))
    }
  }
}

test("appearance form previews, applies, resets, deduplicates and closes on navigation", (t) => {
  const previous = new Map(
    ["document", "window"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  )
  const body = new DialogNode()
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body,
      createElement: () => new DialogNode(),
      querySelector: () => body.children[0] || null,
    },
  })
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => ({ matches: false }) },
  })
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  const lifecycle = new AbortController(),
    values: SubtitleAppearance[] = []
  openSubtitleAppearanceDialog(undefined, (value) => values.push(value), lifecycle.signal)
  openSubtitleAppearanceDialog(undefined, () => {}, lifecycle.signal)
  assert.equal(body.children.length, 1)
  const dialog = body.children[0],
    content = dialog.children[2],
    form = content.children[2]
  assert.equal(dialog.focused,true)
  assert.equal(dialog.children[1].children[1].focused,false)
  const font = form.children[3].children[0]
  assert.equal(font.value, "casual")
  font.value = "console"
  font.dispatchEvent(new Event("change"))
  assert.equal(values[0].font, "console")
  assert.match((content.children[0].children[0].style as any).fontFamily, /^Consolas,/)
  const color = form.children[4].children[0]
  color.value = "#abcdef"
  color.dispatchEvent(new Event("input"))
  assert.equal(values.at(-1)?.textColor, "#abcdef")
  dialog.children[3].children[0].dispatchEvent(new Event("click"))
  assert.deepEqual(values.at(-1), defaultSubtitleAppearance)
  assert.equal(font.value, "casual")
  lifecycle.abort()
  assert.equal(body.children.length, 0)
})
