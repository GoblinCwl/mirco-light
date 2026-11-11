// Only an explicit boolean true permits public comments.
export function parseShareMetadata(raw, strict = false) {
  try {
    const value = typeof raw === "string" ? raw.trim() ? JSON.parse(raw) : {} : raw ?? {}
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("备注必须是 JSON 对象")
    if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.some(tag => typeof tag !== "string"))) throw new Error("tags 必须是字符串数组")
    if (value.jellyfin !== undefined && typeof value.jellyfin !== "boolean") throw new Error("jellyfin 必须是布尔值")
    if (value.order !== undefined && !Number.isSafeInteger(value.order)) throw new Error("排序必须是整数")
    let sharedAt
    if(value.sharedAt!==undefined){
      if(typeof value.sharedAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.sharedAt)&&Number.isFinite(Date.parse(value.sharedAt)))sharedAt=new Date(value.sharedAt).toISOString()
      else if(strict)throw new Error('分享时间必须是带时区的有效 ISO 日期')
    }
    const tags = [...new Set((value.tags || []).map(tag => tag.trim()).filter(Boolean))]
    if (tags.length > 50 || tags.some(tag => tag.length > 100 || /[\u0000-\u001f]/.test(tag) || tag.split("/").some(part => !part || part === "." || part === ".."))) throw new Error("标签格式无效或过长")
    const aliases = {}
    if (value.aliases !== undefined) {
      if (!value.aliases || typeof value.aliases !== "object" || Array.isArray(value.aliases) || Object.keys(value.aliases).length > 2000) throw new Error("别名配置无效")
      for (const [path, name] of Object.entries(value.aliases)) {
        if (!path.startsWith("/") || path === "/" || path.endsWith("/") || path.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(path) || path.split("/").slice(1).some(part => !part || part === "." || part === "..")) throw new Error("别名路径无效")
        if (typeof name !== "string" || !name.trim() || name.trim().length > 200 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("别名格式无效或过长")
        aliases[path] = name.trim()
      }
    }
    return { tags, ...(sharedAt?{sharedAt}:{}), ...(value.order !== undefined ? { order: value.order } : {}), ...(Object.keys(aliases).length ? { aliases } : {}), comment: value.comment === true, ...(value.jellyfin !== undefined ? { jellyfin: value.jellyfin } : {}) }
  } catch (error) {
    if (strict) throw new Error(error instanceof SyntaxError ? "备注必须使用有效的 JSON 格式" : error.message)
    return { tags: [], comment: false }
  }
}
export const sharePageKey = id => `/Share/${encodeURIComponent("分享")}/${encodeURIComponent(id)}/`
