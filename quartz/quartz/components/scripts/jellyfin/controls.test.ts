import { test } from "node:test"
import assert from "node:assert/strict"
import { checkSettingSilently, syncSubtitleSetting } from "./controls"

test("late subtitle selection preserves the user's open quality submenu", () => {
  const root: unknown[] = [],
    quality: unknown[] = [],
    selected = { name: "Chinese" }
  let checked: unknown,
    renders = 0
  const setting = {
    show: true,
    active: quality,
    check(item: unknown) {
      checked = item
      this.active = root
    },
    render(active: unknown[]) {
      this.active = active
      renders++
    },
  }
  checkSettingSilently({ setting }, selected)
  assert.equal(checked, selected)
  assert.equal(setting.active, quality)
  assert.equal(renders, 1)
  setting.show = false
  checkSettingSilently({ setting }, selected)
  assert.equal(setting.active, root)
  assert.equal(renders, 1)
})

test("subtitle checkbox and tooltip follow the requested selection and restore independently of loading", () => {
  const track = { name: "简英双语", type: "vtt", url: "https://test/subtitle" } as any
  const off = { html: "关闭", track: undefined },
    active = { html: "简英双语", track }
  const option = { tooltip: "关闭", selector: [off, active] }
  let checked: unknown
  const player = {
    setting: {
      show: false,
      find: () => option,
      check: (item: unknown) => {
        checked = item
      },
    },
  }
  syncSubtitleSetting(player, track)
  assert.equal(checked, active)
  assert.equal(option.tooltip, "简英双语")
  syncSubtitleSetting(player, undefined)
  assert.equal(checked, off)
  assert.equal(option.tooltip, "关闭")
})
