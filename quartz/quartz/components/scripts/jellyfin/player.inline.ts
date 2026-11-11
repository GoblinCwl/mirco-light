import { mountJellyfinPlayer } from "./player"
const config = (window as any).__quartzJellyfinConfig
delete (window as any).__quartzJellyfinConfig
void mountJellyfinPlayer(config).catch((error) => {
  const root = document.getElementById("preview")!
  const panel = document.createElement("div")
  panel.className = "quartz-playback-error"
  const message = document.createElement("span")
  message.setAttribute("role", "alert")
  message.textContent = error?.message || "播放器初始化失败"
  const retry = document.createElement("button")
  retry.type = "button"
  retry.textContent = "重试"
  retry.onclick = () => parent.postMessage({ channel: config.channel, type: "jellyfinReload" }, "*")
  panel.append(message, retry)
  root.replaceChildren(panel)
  parent.postMessage(
    {
      channel: config.channel,
      type: "contentHeight",
      height: Math.max(180, Math.ceil(root.getBoundingClientRect().height)),
    },
    "*",
  )
  parent.postMessage({ channel: config.channel, type: "jellyfinInitError" }, "*")
})
