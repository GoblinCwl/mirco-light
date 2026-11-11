export type AdminUser = Record<string, unknown> & { id: number; username: string; password: string; base_path: string; role: number; permission: number; disabled: boolean; allow_ldap: boolean; sso_id: string }
export const userPermissions = ["查看隐藏内容","免目录密码访问","离线下载","上传及写入","重命名","移动","复制","删除","WebDAV 读取","WebDAV 写入","FTP／SFTP 读取","FTP／SFTP 写入","读取压缩包","解压","创建分享","自定义分享名"]
export type DriverItem = { name: string; type: "string" | "text" | "number" | "float" | "bool" | "select" | "multipath"; default?: string; options?: string; required?: boolean; help?: string }
export type DriverInfo = { common: DriverItem[]; additional: DriverItem[]; config: { name?: string; need_ms?: boolean; alert?: string } }
export type AdminStorage = Record<string, unknown> & { id: number; mount_path: string; driver: string; addition: string; disabled: boolean; status: string; order: number }
export function driverDefault(item: DriverItem): string | number | boolean {
  return item.type === "bool" ? item.default === "true" : item.type === "number" || item.type === "float" ? Number(item.default) || 0 : item.default || ""
}
export function parseStorageAddition(value: string) {
  const addition: unknown = JSON.parse(value || "{}")
  if (!addition || typeof addition !== "object" || Array.isArray(addition)) throw new Error("驱动配置必须为 JSON 对象")
  return addition as Record<string, unknown>
}
export const adminRoles = ["普通用户", "GUEST", "ADMIN"]
