export type RenameMode = "regex" | "sequence" | "replace"
export type RenameFile = { name: string; created?: string; modified?: string }
export type RenameRule = { mode: RenameMode; source: string; replacement: string; padding?: string }
export type RenameChange = { src_name: string; new_name: string }

function dates(name: string, file: RenameFile) {
  for (const kind of ["created", "modified"] as const) {
    if (!name.includes(`{${kind}_`)) continue
    const date = new Date(file[kind] || "")
    if (!Number.isFinite(date.getTime())) throw new Error(`${file.name} 没有有效的${kind === "created" ? "创建" : "修改"}时间`)
    const values = { year: date.getFullYear(), month: date.getMonth() + 1, date: date.getDate(), hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds() }
    for (const [part, value] of Object.entries(values)) name = name.replace(`{${kind}_${part}}`, String(value).padStart(part === "year" ? 4 : 2, "0"))
  }
  return name
}

// These transformations match OpenList Frontend's BatchRename.tsx.
export function buildRenamePlan(files: RenameFile[], rule: RenameRule): RenameChange[] {
  const { mode, source, replacement } = rule
  if (!source) throw new Error("请填写匹配规则")
  if (mode === "regex") {
    let match: RegExp, replace: RegExp
    try { match = new RegExp(source); replace = new RegExp(source, "g") }
    catch { throw new Error("正则表达式无效，请检查语法") }
    return files.filter(file => match.test(file.name)).map(file => ({ src_name: file.name, new_name: dates(file.name.replace(replace, replacement), file) }))
  }
  if (mode === "sequence") {
    if (!/^\d+$/.test(replacement) || !Number.isSafeInteger(Number(replacement))) throw new Error("起始序号必须是有效的非负整数")
    const padding = Number(rule.padding || 0)
    if (!Number.isInteger(padding) || padding < 0 || padding > 128) throw new Error("序号位数应为 0–128 的整数")
    if (!Number.isSafeInteger(Number(replacement) + files.length)) throw new Error("序号过大，请减小起始序号")
    let number = replacement
    return files.map(file => {
      const dot = file.name.lastIndexOf("."), extension = dot === -1 ? "" : file.name.substring(dot)
      const padded = padding ? number.padStart(padding, "0") : number
      const name = (source.includes("{number}") ? source.replace("{number}", padded) : source + padded) + extension
      number = String(Number.parseInt(number, 10) + 1).padStart(number.length, "0")
      return { src_name: file.name, new_name: name }
    })
  }
  if (!replacement) throw new Error("请填写替换内容")
  return files.filter(file => file.name.includes(source)).map(file => ({ src_name: file.name, new_name: file.name.replace(source, replacement) }))
}
