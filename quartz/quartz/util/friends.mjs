export const defaultFriends = [
 { id:'example-friend',name:'远方来信',url:'https://example.com/',avatar:'/static/Profile.png',description:'在技术与生活之间，记录一些值得留下的片刻。',example:true },
 ...[['moon','月面电台','记录音乐、夜晚与不期而遇的灵感。'],['forest','林间手记','关于自然、阅读与缓慢生活的文字。'],['orbit','轨道之外','探索代码、设计与创造的边界。'],['tide','潮汐档案','收集旅行途中遇见的人与风景。'],['paper','纸间星河','读书、电影，以及那些未完成的故事。'],['light','光的回声','用影像留住日常里的微光。'],['north','北辰工坊','一个喜欢折腾软硬件的个人小站。']].map(([id,name,description],index)=>({id:'example-'+id,name,url:'https://example.com/'+id,avatar:['/static/friends/toki-demo.png','/static/avatars/goblincwl-profile-transparent-v1.webp','/static/Profile.png'][index%3],description,example:true}))
]
export function parseFriends(raw) {
  const items = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!Array.isArray(items) || items.length > 150) throw new Error('友链列表格式无效，最多可添加 150 个站点')
  const ids = new Set(), urls = new Set()
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('友链信息无效')
    const { id, name, url, avatar = '', description = '', example = false, status = '展示中' } = item
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || ids.has(id)) throw new Error('友链标识无效或重复')
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || /[\u0000-\u001f]/.test(name)) throw new Error('请填写站点名称，最多 80 字')
    const website = safeWebsite(url)
    if (urls.has(website)) throw new Error('该站点链接已经存在')
    if (typeof avatar !== 'string' || avatar.length > 1500 || avatar && !(avatar.startsWith('/static/') && !avatar.includes('\\') && !avatar.split('/').includes('..'))) { if (typeof avatar !== 'string' || !avatar) throw new Error('头像链接无效'); safeWebsite(avatar) }
    if (typeof description !== 'string' || description.length > 300) throw new Error('站点简介最多 300 字')
    if (typeof example !== 'boolean') throw new Error('示例标识无效')
    if (!['展示中', '待审核', '已失效'].includes(status)) throw new Error('友链状态无效')
    ids.add(id); urls.add(website)
    return { id, name: name.trim(), url: website, avatar: avatar.trim(), description: description.trim(), status, ...(example ? { example: true } : {}) }
  })
}
function safeWebsite(value) {
  if (typeof value !== 'string' || value.length > 1500) throw new Error('请填写有效的网站链接')
  let url
  try { url = new URL(value) } catch { throw new Error('链接需要以 https:// 或 http:// 开头') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请使用有效的 http 或 https 链接')
  return url.href
}
