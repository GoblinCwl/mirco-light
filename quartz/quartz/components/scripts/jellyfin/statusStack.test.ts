import { test } from "node:test"
import assert from "node:assert/strict"
import { createStatusStack } from "./statusStack"

class NodeFixture {
  style: Record<string, string> = {}
  textContent = ""
  className = ""
  parent?: NodeFixture
  children: NodeFixture[] = []
  setAttribute() {}
  append(node: NodeFixture) {
    node.parent = this
    this.children.push(node)
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this)
  }
}

test("different notices stack while repeated volume feedback updates one row and expires independently", (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document")
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => new NodeFixture() },
  })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "document", previous)
    else Reflect.deleteProperty(globalThis, "document")
  })
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const root = new NodeFixture(),
    lifetime = new AbortController()
  const stack = createStatusStack(root as any, "left", lifetime.signal)
  stack.notice("音量 10%", "volume", 1000)
  t.mock.timers.tick(500)
  stack.notice("音量 20%", "volume", 1000)
  stack.notice("已恢复播放", "recovery", 6000)
  const host = root.children[0]
  assert.equal(host.children.length, 2)
  assert.equal(host.children[0].textContent, "音量 20%")
  assert.equal(host.children[0].style.position, undefined)
  assert.equal(host.style.flexDirection, "column")
  t.mock.timers.tick(1100)
  assert.equal(host.children.length, 1)
  assert.equal(host.children[0].textContent, "已恢复播放")
  lifetime.abort()
  assert.equal(root.children.length, 0)
  t.mock.timers.tick(10000)
})
