export type DriveMeta = {
  id: number; path: string; password: string; p_sub: boolean; read_users: number[]; read_users_sub: boolean
  write_users: number[]; write_users_sub: boolean; write: boolean; w_sub: boolean; hide: string; h_sub: boolean
  header: string; header_sub: boolean; readme: string; r_sub: boolean
}
export const emptyDriveMeta = (): DriveMeta => ({ id: 0, path: "", password: "", p_sub: false,
  read_users: [], read_users_sub: false, write_users: [], write_users_sub: false,
  write: false, w_sub: false, hide: "", h_sub: false, header: "", header_sub: false, readme: "", r_sub: false })
export const taskCategories = [
  { key: "offline_download", group: "offline", label: "离线下载" },
  { key: "offline_download_transfer", group: "offline", label: "离线传输" },
  { key: "copy", group: "copy", label: "复制" },
  { key: "move", group: "move", label: "移动" },
  { key: "decompress", group: "extract", label: "解压" },
  { key: "decompress_upload", group: "extract", label: "解压上传" },
  { key: "upload", group: "upload", label: "上传" },
] as const
export type TaskCategory = typeof taskCategories[number]["key"]
export type ManagedTask = { id: string; category: TaskCategory; name: string; creator?: string; state: number;
  status?: string; progress: number; total_bytes?: number; start_time?: string | null; end_time?: string | null; error?: string }
export type TaskAction = "cancel" | "retry" | "delete"
export const taskStateLabels = ["等待中", "进行中", "已完成", "取消中", "已取消", "发生错误", "失败处理中", "已失败", "等待重试", "准备重试"]
export const taskFinished = (task: Pick<ManagedTask, "state">) => [2, 4, 7].includes(task.state)
export function canOperateTask(task: Pick<ManagedTask, "state">, action: TaskAction) {
  return action === "cancel" ? !taskFinished(task) && task.state !== 3
    : action === "retry" ? [4, 7].includes(task.state) : taskFinished(task)
}
export const taskIdentity = (task: Pick<ManagedTask, "category" | "id">) => JSON.stringify([task.category, task.id])
export const safeTaskText = (text: string) => text.replace(/with password <[^>]*>/g, "with password <••••>")
export function groupTaskIds(tasks: ManagedTask[], action: TaskAction) {
  const groups = new Map<TaskCategory, string[]>()
  for (const task of tasks) if (canOperateTask(task, action)) {
    if (!groups.has(task.category)) groups.set(task.category, [])
    groups.get(task.category)!.push(task.id)
  }
  return groups
}
