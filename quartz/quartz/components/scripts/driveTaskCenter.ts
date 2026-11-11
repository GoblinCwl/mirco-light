import { node } from "./driveUi"
import { driveSize } from "./openlistShared"
import { taskCategories, taskIdentity, taskFinished, taskStateLabels, canOperateTask, groupTaskIds, safeTaskText, type ManagedTask, type TaskAction } from "./driveManagementModel"
import { managementSession, managementButton, managementCheck, confirmManagement, type ManagementDialog } from "./driveManagementUi"

export async function setupDriveTaskCenter(ui: ManagementDialog, parent: AbortSignal, token: string) {
  const { api, signal } = managementSession(ui, parent, token)
  ui.dialog.classList.add("drive-task-dialog")
  ui.submit.hidden = true; ui.cancel.textContent = "关闭"; ui.dialog.classList.add("drive-task-center")
  const toolbar = node("div", "", "drive-management-toolbar drive-task-filters"), typeLabel = node("label", "任务类型"), type = node("select")
  for (const [value,label] of [["all","全部类型"],["offline","离线下载"],["copy","复制"],["move","移动"],["extract","解压"],["upload","上传"]]) {
    const option = node("option",label); option.value = value; type.append(option)
  }
  type.setAttribute("aria-label", "任务类型"); typeLabel.append(type)
  const stateLabel = node("label", "任务状态"), state = node("select")
  for (const [value,label] of [["all","全部状态"],["undone","未完成"],["done","已结束"]]) { const option = node("option",label); option.value = value; state.append(option) }
  state.setAttribute("aria-label", "任务状态"); stateLabel.append(state)
  const refreshButton = managementButton("刷新", () => { void refresh() }), auto = managementCheck("自动刷新", true)
  auto.wrapper.classList.add("drive-task-auto")
  toolbar.append(typeLabel, stateLabel, refreshButton, auto.wrapper)
  const summary = node("p", "正在读取任务…", "drive-action-note"), actions = node("div", "", "drive-management-toolbar drive-task-bulk")
  summary.setAttribute("role", "status")
  const selectAll = managementCheck("全选", false), selected = new Set<string>()
  const bulkButtons = new Map<TaskAction, HTMLButtonElement>(), scopeButtons: HTMLButtonElement[] = []
  actions.append(selectAll.wrapper)
  const list = node("div", "", "drive-task-list"); list.setAttribute("aria-label", "任务列表")
  ui.body.append(toolbar, summary, actions, list)
  let tasks: ManagedTask[] = [], busy = false, loading = false, timer: number | undefined, refreshAgain = false, actionError = ""
  const categories = () => taskCategories.filter(category => type.value === "all" || category.group === type.value)
  const visible = () => tasks.filter(task => categories().some(category=>category.key===task.category) &&
    (state.value === "all" || taskFinished(task) === (state.value === "done")))
  const errorText = (error: unknown) => error instanceof Error ? error.message : "操作失败"
  const stopTimer = () => { if (timer !== undefined) window.clearTimeout(timer); timer = undefined }
  signal.addEventListener("abort", stopTimer, { once: true })
  const schedule = () => {
    stopTimer()
    if (!signal.aborted && auto.input.checked) timer = window.setTimeout(() => {
      timer = undefined
      if (document.hidden) schedule(); else void refresh()
    }, tasks.some(task=>!taskFinished(task)) ? 5000 : 15000)
  }
  const updateButtons = () => {
    const shown = visible(), chosen = shown.filter(task=>selected.has(taskIdentity(task)))
    selectAll.input.checked = shown.length > 0 && chosen.length === shown.length
    selectAll.input.indeterminate = chosen.length > 0 && chosen.length < shown.length
    selectAll.input.disabled = busy || !shown.length
    for (const [action,button] of bulkButtons) button.disabled = busy || !chosen.some(task=>canOperateTask(task,action))
    for (const button of scopeButtons) button.disabled = busy || loading
    refreshButton.disabled = busy || loading
    type.disabled = state.disabled = busy
    for (const checkbox of list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) checkbox.disabled = busy
    for (const button of list.querySelectorAll<HTMLButtonElement>("[data-task-action]")) button.disabled = busy
  }
  const perform = async (work: () => Promise<void>) => {
    if (busy || signal.aborted) return
    busy = true; stopTimer(); actionError = ""; ui.clearError(); updateButtons()
    try { await work() }
    catch (error) { if (!signal.aborted) { actionError = errorText(error); ui.fail(actionError)} }
    finally { busy = false; if (!signal.aborted) { await refresh(); updateButtons() } }
  }
  const runSelected = (action: TaskAction) => {
    const chosen = visible().filter(task=>selected.has(taskIdentity(task))), groups = groupTaskIds(chosen,action)
    const run = () => perform(async () => {
      const results = await Promise.allSettled([...groups].map(async ([category,ids]) => {
        const failures = await api<Record<string,string> | null>(`task/${category}/${action}_some`,ids)
        const errors = Object.values(failures || {}).filter(Boolean)
        if (errors.length) throw new Error(`${taskCategories.find(item=>item.key===category)!.label}：${errors.join("；")}`)
        for (const task of chosen) if (task.category === category && ids.includes(task.id)) selected.delete(taskIdentity(task))
      }))
      const failures = results.filter((result): result is PromiseRejectedResult=>result.status === "rejected")
      if (failures.length) throw new Error(failures.map(result=>errorText(result.reason)).join("\n"))
    })
    if (!groups.size) return
    if (action === "delete") confirmManagement("删除任务记录", "确认删除选中的已结束任务记录？文件会保留。", signal,run)
    else void run()
  }
  for (const [action,label] of [["cancel","取消所选"],["retry","重试所选"],["delete","删除所选记录"]] as const) {
    const button = managementButton(label,()=>runSelected(action),action==="delete"); bulkButtons.set(action,button); actions.append(button)
  }
  for (const [operation,label,description] of [["retry_failed","重试失败任务",""],["clear_succeeded","清除成功记录","确认清除当前类型筛选范围内的成功任务记录？"],["clear_done","清除已结束记录","确认清除当前类型筛选范围内的所有已结束任务记录？"]] as const) {
    const button = managementButton(label,()=>{
      const scope = [...categories()]
      const run = () => perform(async () => {
        const results = await Promise.allSettled(scope.map(category=>api(`task/${category.key}/${operation}`,{})))
        const errors = results.flatMap((result,index)=>result.status === "rejected" ? [`${scope[index].label}：${errorText(result.reason)}`] : [])
        if (errors.length) throw new Error(errors.join("\n"))
      })
      if (description) confirmManagement(label,description,signal,run); else void run()
    },operation!=="retry_failed"); scopeButtons.push(button); actions.append(button)
  }
  selectAll.input.addEventListener("change",()=>{
    for (const task of visible()) if (selectAll.input.checked) selected.add(taskIdentity(task)); else selected.delete(taskIdentity(task))
    render()
  },{signal})
  const cards = new Map<string, { element: HTMLElement; checkbox: HTMLInputElement; name: HTMLElement; meta: HTMLElement; status: HTMLElement; progress: HTMLProgressElement; percent: HTMLElement; details: HTMLElement; actions: HTMLElement }>()
  const render = () => {
    const shown = visible(), retained = new Set(shown.map(taskIdentity)), existing = new Set(tasks.map(taskIdentity))
    for (const key of selected) if (!existing.has(key)) selected.delete(key)
    for (const [key,card] of cards) if (!retained.has(key)) { card.element.remove(); cards.delete(key) }
    list.querySelector(".drive-task-empty")?.remove()
    for (const [position, task] of shown.sort((a,b)=>Number(taskFinished(a))-Number(taskFinished(b)) || String(b.start_time || "").localeCompare(a.start_time || "")).entries()) {
      const key = taskIdentity(task)
      let card = cards.get(key)
      if (!card) {
        const element = node("article", "", "drive-task-card"), heading = node("div", "", "drive-task-heading"), check = managementCheck("",false)
        const name = node("strong"), meta = node("span", "", "drive-task-meta"), status = node("p", "", "drive-task-status"), progress = node("progress"), percent = node("span")
        progress.max = 100; const meter = node("div", "", "drive-task-progress"), details = node("details"), detailBody = node("div", "", "drive-task-detail"), operations = node("div", "", "drive-management-actions")
        details.append(node("summary", "任务详情"), detailBody); heading.append(check.wrapper,name); meter.append(progress,percent)
        element.append(heading,meta,status,meter,details,operations); element.dataset.taskId = task.id; element.dataset.taskCategory = task.category
        check.input.addEventListener("change",()=>{if(check.input.checked)selected.add(key);else selected.delete(key);updateButtons()},{signal})
        card = {element,checkbox:check.input,name,meta,status,progress,percent,details:detailBody,actions:operations}; cards.set(key,card)
      }
      card.checkbox.checked = selected.has(key); card.checkbox.setAttribute("aria-label",`选择任务 ${safeTaskText(task.name)}`)
      card.name.textContent = safeTaskText(task.name); card.meta.textContent = [taskCategories.find(category=>category.key===task.category)!.label,task.creator,taskStateLabels[task.state] || "未知状态"].filter(Boolean).join(" · ")
      card.element.classList.toggle("is-failed",task.state === 7); card.status.textContent = safeTaskText(task.error || task.status || "")
      const percent = task.state === 2 ? 100 : Math.max(0,Math.min(100,Number.isFinite(task.progress)?task.progress:0))
      card.progress.value = percent; card.progress.setAttribute("aria-label",`任务进度 ${Math.round(percent)}%`); card.percent.textContent = `${Math.round(percent)}%`
      card.details.replaceChildren()
      for (const [label,value] of [["任务 ID",task.id],["总大小",task.total_bytes ? driveSize(task.total_bytes) : ""],["开始时间",task.start_time ? new Date(task.start_time).toLocaleString("zh-CN") : ""],["结束时间",task.end_time ? new Date(task.end_time).toLocaleString("zh-CN") : ""]]) {
        if (!value) continue
        const row=node("p");row.append(node("span",label),node("span",value));card.details.append(row)
      }
      // Keep focused action buttons and expanded detail panels across polling.
      const allowed = (["cancel","retry","delete"] as const).filter(action=>canOperateTask(task,action))
      if (card.actions.dataset.actions !== allowed.join(",")) {
        card.actions.replaceChildren();card.actions.dataset.actions=allowed.join(",")
        for(const action of allowed){const button=managementButton(({cancel:"取消任务",retry:"重试",delete:"删除记录"})[action],()=>{
          const run=()=>perform(async()=>{await api(`task/${task.category}/${action}?tid=${encodeURIComponent(task.id)}`,{})})
          if(action==="delete")confirmManagement("删除任务记录","确认删除此任务记录？文件会保留。",signal,run);else void run()
        },action==="delete");button.dataset.taskAction=action;card.actions.append(button)}
      }
      if (list.children[position] !== card.element) list.insertBefore(card.element, list.children[position] || null)
    }
    if(!shown.length)list.append(node("p","暂无符合条件的任务","drive-action-note drive-task-empty"))
    summary.textContent=`共 ${shown.length} 个任务 · ${shown.filter(task=>!taskFinished(task)).length} 个未完成`
    updateButtons()
  }
  async function refresh() {
    if(signal.aborted)return
    if(loading || busy){refreshAgain=true;return}
    loading=true;stopTimer();list.setAttribute("aria-busy","true");updateButtons()
    const failures:string[]=[]
    try {
      const buckets=await Promise.all(taskCategories.flatMap(category=>(["undone","done"] as const).map(async bucket=>{
        try { return {category:category.key,bucket,content:await api<Omit<ManagedTask,"category">[]|null>(`task/${category.key}/${bucket}`)} }
        catch(error){if(!signal.aborted)failures.push(`${category.label}（${bucket==="done"?"已结束":"未完成"}）：${errorText(error)}`);return undefined}
      })))
      if(signal.aborted)return
      const map=new Map(tasks.map(task=>[taskIdentity(task),task]))
      for(const result of buckets)if(result){
        for(const [key,task]of map)if(task.category===result.category&&taskFinished(task)===(result.bucket==="done"))map.delete(key)
        for(const task of result.content||[])map.set(taskIdentity({id:task.id,category:result.category}),{...task,category:result.category})
      }
      tasks=[...map.values()];render()
      ui.fail([actionError,...failures].filter(Boolean).join("\n"))
    } finally {
      loading=false;if(!signal.aborted){list.setAttribute("aria-busy","false");updateButtons();if(refreshAgain){refreshAgain=false;void refresh()}else schedule()}
    }
  }
  type.addEventListener("change",render,{signal});state.addEventListener("change",render,{signal})
  auto.input.addEventListener("change",()=>{if(auto.input.checked)void refresh();else stopTimer()},{signal})
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&auto.input.checked)void refresh()},{signal})
  await refresh()
}
